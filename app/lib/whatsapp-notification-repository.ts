import 'server-only';

import crypto from 'node:crypto';

import { PostgrestError } from '@supabase/supabase-js';

import { enqueueOutboundDispatchJob, getOutboundDispatchQueue } from './outbound-dispatch-queue';
import {
  cacheApiClientByKeyPrefix,
  clearApiNotificationIdempotency,
  completeApiNotificationIdempotency,
  countRecentAcceptedApiNotifications as countRecentAcceptedApiNotificationsInRedis,
  decrementPendingOutboundCounts,
  getCachedApiClientByKeyPrefix,
  getPendingApiNotificationCount,
  getPendingOutboundMessageCountBySource,
  incrementPendingOutboundCounts,
  recordAcceptedApiNotification,
  reserveApiNotificationIdempotency,
} from './outbound-dispatch-redis';
import { buildOutboundDispatchJobData } from './outbound-dispatch-job';
import { getSupabaseAdminClient } from './supabase-server';
import {
  API_NOTIFICATION_PRIORITY,
  BLAST_PRIORITY,
  ApiClientRecord,
  DEFAULT_DISPATCH_SETTINGS_ID,
  DEFAULT_GLOBAL_MESSAGES_PER_MINUTE,
  DispatchSettingsRecord,
  OutboundMessageRecord,
  OutboundMessageSourceType,
  TICKET_REPLY_PRIORITY,
  buildApiNotificationSourceId,
} from './whatsapp-notification-utils';
import {
  CreateOutboundMessageInput,
  NotificationRepository,
  NotificationRepositoryError,
} from './whatsapp-notification-service';

export interface UpdateDispatchSettingsInput {
  global_messages_per_minute?: number;
  api_notifications_paused?: boolean;
}

export interface CreateTicketReplyOutboundMessageInput {
  replyId: string;
  ticketId: string;
  recipientPhoneNumber: string | null;
  recipientChatId: string;
  content: string;
}

export interface CreateGroupBlastOutboundMessagesInput {
  groupNames: string[];
  content: string;
}

function normalizeGroupNames(values: string[] | null | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  (values || []).forEach((value) => {
    const groupName = value.trim();

    if (!groupName) {
      return;
    }

    const dedupeKey = groupName.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    normalized.push(groupName);
  });

  return normalized;
}

function extractGroupNames(record: Record<string, unknown>): string[] {
  const directValues = Array.isArray(record.group_names)
    ? record.group_names.filter((value): value is string => typeof value === 'string')
    : [];
  const legacyValue = typeof record.group_name === 'string' && record.group_name.trim()
    ? [record.group_name]
    : [];

  return normalizeGroupNames([...directValues, ...legacyValue]);
}

function matchesTargetGroups(record: Record<string, unknown>, targetGroups: string[]): boolean {
  const contactGroups = extractGroupNames(record).map((groupName) => groupName.toLowerCase());
  return targetGroups.some((groupName) => contactGroups.includes(groupName.toLowerCase()));
}

export function createSupabaseNotificationRepository(): NotificationRepository {
  const supabase = getSupabaseAdminClient();

  return {
    async findApiClientByKeyPrefix(keyPrefix: string): Promise<ApiClientRecord | null> {
      const cachedClient = await getCachedApiClientByKeyPrefix(keyPrefix);

      if (cachedClient) {
        return cachedClient;
      }

      const { data, error } = await supabase
        .from('api_clients')
        .select('*')
        .eq('key_prefix', keyPrefix)
        .maybeSingle();

      if (error) {
        throw toRepositoryError('Failed to load API client.', error);
      }

      const apiClient = (data as ApiClientRecord | null) ?? null;

      if (apiClient) {
        void cacheApiClientByKeyPrefix(apiClient);
      }

      return apiClient;
    },

    async touchApiClientLastUsedAt(clientId: string, isoTimestamp: string): Promise<void> {
      const { error } = await supabase
        .from('api_clients')
        .update({
          last_used_at: isoTimestamp,
          updated_at: isoTimestamp,
        })
        .eq('id', clientId);

      if (error) {
        throw toRepositoryError('Failed to update API client usage metadata.', error);
      }
    },

    reserveApiNotificationIdempotency,
    completeApiNotificationIdempotency,
    clearApiNotificationIdempotency,

    async countRecentAcceptedApiNotifications(clientId: string, nowMs: number): Promise<number> {
      return countRecentAcceptedApiNotificationsInRedis(clientId, nowMs);
    },

    async countPendingApiNotifications(clientId: string): Promise<number> {
      return getPendingApiNotificationCount(clientId);
    },

    async createOutboundMessage(
      input: CreateOutboundMessageInput,
    ): Promise<OutboundMessageRecord> {
      const outboundMessage: OutboundMessageRecord = {
        id: crypto.randomUUID(),
        client_id: input.clientId,
        idempotency_key: input.idempotencyKey,
        request_fingerprint: input.requestFingerprint,
        source_type: 'api_notification',
        source_id: buildApiNotificationSourceId(input.clientId, input.idempotencyKey),
        ticket_id: null,
        priority: API_NOTIFICATION_PRIORITY,
        recipient_phone_number: input.recipientPhoneNumber,
        recipient_chat_id: null,
        content: input.content,
        client_reference: input.clientReference,
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
        last_delivery_error: null,
        whatsapp_message_id: null,
        delivered_at: null,
        created_at: input.acceptedAt,
        updated_at: input.acceptedAt,
      };

      const { error } = await supabase
        .from('outbound_messages')
        .insert(outboundMessage);

      if (error) {
        throw toRepositoryError('Failed to write outbound delivery ledger entry.', error);
      }

      try {
        await enqueueOutboundDispatchJob(buildOutboundDispatchJobData(outboundMessage));
        await incrementPendingOutboundCounts(outboundMessage.source_type, outboundMessage.client_id);
        await recordAcceptedApiNotification(outboundMessage.client_id!, input.acceptedAt);
      } catch (queueError) {
        await markOutboundMessageAsFailed(
          supabase,
          outboundMessage.id,
          summarizeOperationalQueueError(queueError),
        );

        throw toOperationalRepositoryError('Failed to queue outbound message.', queueError);
      }

      return outboundMessage;
    },
  };
}

export async function createGroupBlastOutboundMessages(
  input: CreateGroupBlastOutboundMessagesInput,
): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const targetGroups = normalizeGroupNames(input.groupNames);

  if (!targetGroups.length) {
    return 0;
  }

  const { data, error } = await supabase
    .from('csv_contacts')
    .select('id, no_telp, group_names, group_name')
    .order('created_at', { ascending: false });

  if (error) {
    throw toRepositoryError('Failed to load blast recipients.', error);
  }

  const contacts = (data || []) as Array<Record<string, unknown>>;
  const recipients = contacts.filter((contact) => matchesTargetGroups(contact, targetGroups));

  if (!recipients.length) {
    return 0;
  }

  const now = new Date().toISOString();
  let insertedCount = 0;

  for (const recipient of recipients) {
    const recipientPhoneNumber = String(recipient.no_telp || '').trim();

    if (!recipientPhoneNumber) {
      continue;
    }

    const outboundMessage: OutboundMessageRecord = {
      id: crypto.randomUUID(),
      client_id: null,
      idempotency_key: null,
      request_fingerprint: null,
      source_type: 'blast',
      source_id: `blast:${crypto.randomUUID()}`,
      ticket_id: null,
      priority: BLAST_PRIORITY,
      recipient_phone_number: recipientPhoneNumber,
      recipient_chat_id: null,
      content: input.content,
      client_reference: null,
      delivery_status: 'queued',
      delivery_attempts: 0,
      next_retry_at: null,
      last_delivery_error: null,
      whatsapp_message_id: null,
      delivered_at: null,
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await supabase
      .from('outbound_messages')
      .insert(outboundMessage);

    if (insertError) {
      throw toRepositoryError('Failed to write blast delivery ledger entry.', insertError);
    }

    try {
      await enqueueOutboundDispatchJob(buildOutboundDispatchJobData(outboundMessage));
      await incrementPendingOutboundCounts(outboundMessage.source_type, outboundMessage.client_id);
      insertedCount += 1;
    } catch (queueError) {
      await markOutboundMessageAsFailed(
        supabase,
        outboundMessage.id,
        summarizeOperationalQueueError(queueError),
      );

      throw toOperationalRepositoryError('Failed to queue blast outbound message.', queueError);
    }
  }

  return insertedCount;
}

export async function createTicketReplyOutboundMessage(
  input: CreateTicketReplyOutboundMessageInput,
): Promise<OutboundMessageRecord> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('outbound_messages')
    .insert({
      client_id: null,
      idempotency_key: null,
      request_fingerprint: null,
      source_type: 'ticket_reply',
      source_id: input.replyId,
      ticket_id: input.ticketId,
      priority: TICKET_REPLY_PRIORITY,
      recipient_phone_number: input.recipientPhoneNumber,
      recipient_chat_id: input.recipientChatId,
      content: input.content,
      client_reference: null,
      delivery_status: 'queued',
      delivery_attempts: 0,
      next_retry_at: null,
      last_delivery_error: null,
      whatsapp_message_id: null,
      delivered_at: null,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) {
    throw toRepositoryError('Failed to write ticket reply delivery ledger entry.', error);
  }

  const outboundMessage = data as OutboundMessageRecord;

  try {
    await enqueueOutboundDispatchJob(buildOutboundDispatchJobData(outboundMessage));
    await incrementPendingOutboundCounts(outboundMessage.source_type, outboundMessage.client_id);
  } catch (queueError) {
    await markOutboundMessageAsFailed(
      supabase,
      outboundMessage.id,
      summarizeOperationalQueueError(queueError),
    );

    throw toOperationalRepositoryError(
      'Failed to queue ticket reply outbound message.',
      queueError,
    );
  }

  return outboundMessage;
}

export async function getDispatchSettings(): Promise<DispatchSettingsRecord> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('bot_dispatch_settings')
    .select('*')
    .eq('id', DEFAULT_DISPATCH_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw toRepositoryError('Failed to load dispatch settings.', error);
  }

  if (data) {
    return data as DispatchSettingsRecord;
  }

  return upsertDefaultDispatchSettings();
}

export async function updateDispatchSettings(
  patch: UpdateDispatchSettingsInput,
): Promise<DispatchSettingsRecord> {
  const supabase = getSupabaseAdminClient();
  const current = await getDispatchSettings();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('bot_dispatch_settings')
    .upsert({
      id: DEFAULT_DISPATCH_SETTINGS_ID,
      global_messages_per_minute:
        patch.global_messages_per_minute ?? current.global_messages_per_minute,
      api_notifications_paused:
        patch.api_notifications_paused ?? current.api_notifications_paused,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) {
    throw toRepositoryError('Failed to update dispatch settings.', error);
  }

  return data as DispatchSettingsRecord;
}

export async function countQueuedOutboundMessagesBySource(
  sourceType: OutboundMessageSourceType,
): Promise<number> {
  return getPendingOutboundMessageCountBySource(sourceType);
}

export async function releasePendingOutboundMessageCounts(
  sourceType: OutboundMessageSourceType,
  clientId: string | null,
): Promise<void> {
  await decrementPendingOutboundCounts(sourceType, clientId);
}

async function markOutboundMessageAsFailed(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  outboundMessageId: string,
  errorMessage: string,
): Promise<void> {
  await supabase
    .from('outbound_messages')
    .update({
      delivery_status: 'failed',
      delivery_attempts: 0,
      next_retry_at: null,
      last_delivery_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', outboundMessageId);
}

function summarizeOperationalQueueError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function toRepositoryError(message: string, error: PostgrestError): NotificationRepositoryError {
  return new NotificationRepositoryError(`${message} ${error.message}`, error.code);
}

function toOperationalRepositoryError(
  message: string,
  error: unknown,
): NotificationRepositoryError {
  const suffix = error instanceof Error ? error.message : String(error);
  return new NotificationRepositoryError(`${message} ${suffix}`);
}

async function upsertDefaultDispatchSettings(): Promise<DispatchSettingsRecord> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('bot_dispatch_settings')
    .upsert({
      id: DEFAULT_DISPATCH_SETTINGS_ID,
      global_messages_per_minute: DEFAULT_GLOBAL_MESSAGES_PER_MINUTE,
      api_notifications_paused: false,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) {
    throw toRepositoryError('Failed to initialize dispatch settings.', error);
  }

  return data as DispatchSettingsRecord;
}

export async function closeOutboundDispatchQueue(): Promise<void> {
  await getOutboundDispatchQueue().close();
}
