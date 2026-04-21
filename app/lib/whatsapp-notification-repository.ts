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
  DEFAULT_WHATSAPP_INSTANCE_ID,
  DEFAULT_WHATSAPP_INSTANCE_LABEL,
  DEFAULT_DISPATCH_SETTINGS_ID,
  DEFAULT_GLOBAL_MESSAGES_PER_MINUTE,
  DispatchSettingsRecord,
  OutboundMessageRecord,
  OutboundMessageSourceType,
  TICKET_REPLY_PRIORITY,
  WhatsappInstanceRecord,
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
  whatsappInstanceId: string;
  recipientPhoneNumber: string | null;
  recipientChatId: string;
  content: string;
}

export interface CreateGroupBlastOutboundMessagesInput {
  groupNames: string[];
  content: string;
}

export interface CreateDirectBlastOutboundMessagesInput {
  recipientPhoneNumbers: string[];
  content: string;
}

export interface CreatePersonalizedBlastOutboundMessagesInput {
  recipients: Array<{
    recipientPhoneNumber: string;
    content: string;
  }>;
}

export interface BlastDispatchResult {
  totalRecipients: number;
  acceptedCount: number;
  queuedCount: number;
  alreadyAcceptedCount: number;
  failedCount: number;
  trackedMessageIds: string[];
}

function normalizeList(values: string[] | null | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  (values || []).forEach((value) => {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      return;
    }

    const dedupeKey = normalizedValue.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    normalized.push(normalizedValue);
  });

  return normalized;
}

function normalizePhoneNumbers(phoneNumbers: string[]): string[] {
  return Array.from(
    new Set(
      phoneNumbers
        .map((phoneNumber) => String(phoneNumber || '').replace(/\D/g, '').trim())
        .filter((phoneNumber) => phoneNumber.length > 0),
    ),
  );
}

function buildBlastRequestId(content: string, recipientKeys: string[]): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        content: content.trim(),
        recipients: normalizeList(recipientKeys).sort((left, right) => left.localeCompare(right)),
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

function buildPersonalizedBlastRequestId(
  recipients: Array<{ recipientPhoneNumber: string; content: string }>,
): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify(
        recipients
          .map((recipient) => ({
            recipientPhoneNumber: String(recipient.recipientPhoneNumber || '').replace(/\D/g, '').trim(),
            content: String(recipient.content || '').trim(),
          }))
          .filter((recipient) => recipient.recipientPhoneNumber && recipient.content)
          .sort((left, right) => left.recipientPhoneNumber.localeCompare(right.recipientPhoneNumber)),
      ),
    )
    .digest('hex')
    .slice(0, 24);
}

function buildBlastSourceId(requestId: string, recipientPhoneNumber: string): string {
  return `blast:${requestId}:${recipientPhoneNumber}`;
}

function isUniqueViolation(error: PostgrestError): boolean {
  return error.code === '23505';
}

async function loadBlastOutboundMessageBySourceId(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  sourceId: string,
): Promise<OutboundMessageRecord | null> {
  const { data, error } = await supabase
    .from('outbound_messages')
    .select('*')
    .eq('source_type', 'blast')
    .eq('source_id', sourceId)
    .maybeSingle();

  if (error) {
    throw toRepositoryError('Failed to load existing blast delivery ledger entry.', error);
  }

  return (data as OutboundMessageRecord | null) ?? null;
}

async function markOutboundMessageAsQueued(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  outboundMessageId: string,
): Promise<void> {
  await supabase
    .from('outbound_messages')
    .update({
      delivery_status: 'queued',
      next_retry_at: null,
      last_delivery_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', outboundMessageId);
}

async function createOrReuseBlastOutboundMessage(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    requestId: string;
    recipientPhoneNumber: string;
    content: string;
  },
): Promise<{
  outboundMessage: OutboundMessageRecord;
  shouldEnqueue: boolean;
  alreadyAccepted: boolean;
}> {
  const now = new Date().toISOString();
  const outboundMessage: OutboundMessageRecord = {
    id: crypto.randomUUID(),
    client_id: null,
    idempotency_key: null,
    request_fingerprint: null,
    source_type: 'blast',
    source_id: buildBlastSourceId(input.requestId, input.recipientPhoneNumber),
    ticket_id: null,
    whatsapp_instance_id: DEFAULT_WHATSAPP_INSTANCE_ID,
    priority: BLAST_PRIORITY,
    recipient_phone_number: input.recipientPhoneNumber,
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

  const { data, error } = await supabase
    .from('outbound_messages')
    .insert(outboundMessage)
    .select('*')
    .single();

  if (!error) {
    return {
      outboundMessage: data as OutboundMessageRecord,
      shouldEnqueue: true,
      alreadyAccepted: false,
    };
  }

  if (!isUniqueViolation(error)) {
    throw toRepositoryError('Failed to write blast delivery ledger entry.', error);
  }

  const existingMessage = await loadBlastOutboundMessageBySourceId(supabase, outboundMessage.source_id);

  if (!existingMessage) {
    throw new NotificationRepositoryError(
      'Blast delivery ledger entry already exists but could not be reloaded.',
      error.code,
    );
  }

  if (existingMessage.delivery_status === 'failed' && existingMessage.delivery_attempts === 0) {
    await markOutboundMessageAsQueued(supabase, existingMessage.id);
    return {
      outboundMessage: {
        ...existingMessage,
        delivery_status: 'queued',
        next_retry_at: null,
        last_delivery_error: null,
        updated_at: new Date().toISOString(),
      },
      shouldEnqueue: true,
      alreadyAccepted: false,
    };
  }

  return {
    outboundMessage: existingMessage,
    shouldEnqueue: false,
    alreadyAccepted: true,
  };
}

async function dispatchBlastMessages(
  recipientPhoneNumbers: string[],
  content: string,
  requestId: string,
): Promise<BlastDispatchResult> {
  return dispatchPersonalizedBlastMessages(
    normalizePhoneNumbers(recipientPhoneNumbers).map((recipientPhoneNumber) => ({
      recipientPhoneNumber,
      content,
    })),
    requestId,
  );
}

async function dispatchPersonalizedBlastMessages(
  recipients: Array<{ recipientPhoneNumber: string; content: string }>,
  requestId: string,
): Promise<BlastDispatchResult> {
  const supabase = getSupabaseAdminClient();
  const normalizedRecipients = Array.from(
    recipients.reduce((deduped, recipient) => {
      const normalizedPhoneNumber = String(recipient.recipientPhoneNumber || '').replace(/\D/g, '').trim();
      const normalizedContent = String(recipient.content || '').trim();

      if (!normalizedPhoneNumber || !normalizedContent) {
        return deduped;
      }

      deduped.set(normalizedPhoneNumber, {
        recipientPhoneNumber: normalizedPhoneNumber,
        content: normalizedContent,
      });
      return deduped;
    }, new Map<string, { recipientPhoneNumber: string; content: string }>()),
  ).map(([, value]) => value);

  if (!normalizedRecipients.length) {
    return {
      totalRecipients: 0,
      acceptedCount: 0,
      queuedCount: 0,
      alreadyAcceptedCount: 0,
      failedCount: 0,
      trackedMessageIds: [],
    };
  }

  let queuedCount = 0;
  let alreadyAcceptedCount = 0;
  let failedCount = 0;
  const trackedMessageIds: string[] = [];

  for (const recipient of normalizedRecipients) {
    const { outboundMessage, shouldEnqueue, alreadyAccepted } =
      await createOrReuseBlastOutboundMessage(supabase, {
        requestId,
        recipientPhoneNumber: recipient.recipientPhoneNumber,
        content: recipient.content,
      });

    trackedMessageIds.push(outboundMessage.id);

    if (alreadyAccepted) {
      alreadyAcceptedCount += 1;
      continue;
    }

    if (!shouldEnqueue) {
      failedCount += 1;
      continue;
    }

    try {
      await enqueueOutboundDispatchJob(buildOutboundDispatchJobData(outboundMessage));
      await incrementPendingOutboundCounts(outboundMessage.source_type, outboundMessage.client_id);
      queuedCount += 1;
    } catch (queueError) {
      await markOutboundMessageAsFailed(
        supabase,
        outboundMessage.id,
        summarizeOperationalQueueError(queueError),
      );
      failedCount += 1;
    }
  }

  return {
    totalRecipients: normalizedRecipients.length,
    acceptedCount: queuedCount + alreadyAcceptedCount,
    queuedCount,
    alreadyAcceptedCount,
    failedCount,
    trackedMessageIds,
  };
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
      await getOrCreateDefaultWhatsappInstance();
      const outboundMessage: OutboundMessageRecord = {
        id: crypto.randomUUID(),
        client_id: input.clientId,
        idempotency_key: input.idempotencyKey,
        request_fingerprint: input.requestFingerprint,
        source_type: 'api_notification',
        source_id: buildApiNotificationSourceId(input.clientId, input.idempotencyKey),
        ticket_id: null,
        whatsapp_instance_id: DEFAULT_WHATSAPP_INSTANCE_ID,
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
): Promise<BlastDispatchResult> {
  const supabase = getSupabaseAdminClient();
  const targetGroups = normalizeList(input.groupNames);

  if (!targetGroups.length) {
    return {
      totalRecipients: 0,
      acceptedCount: 0,
      queuedCount: 0,
      alreadyAcceptedCount: 0,
      failedCount: 0,
      trackedMessageIds: [],
    };
  }

  const { data, error } = await supabase
    .from('csv_contacts')
    .select('no_telp')
    .overlaps('group_names', targetGroups)
    .order('created_at', { ascending: false });

  if (error) {
    throw toRepositoryError('Failed to load blast recipients.', error);
  }

  const recipientPhoneNumbers = (data || []).map((record) => String(record.no_telp || '').trim());

  return dispatchBlastMessages(
    recipientPhoneNumbers,
    input.content,
    buildBlastRequestId(input.content, targetGroups.map((groupName) => `group:${groupName}`)),
  );
}

export async function createDirectBlastOutboundMessages(
  input: CreateDirectBlastOutboundMessagesInput,
): Promise<BlastDispatchResult> {
  const normalizedPhoneNumbers = normalizePhoneNumbers(input.recipientPhoneNumbers);

  return dispatchBlastMessages(
    normalizedPhoneNumbers,
    input.content,
    buildBlastRequestId(input.content, normalizedPhoneNumbers),
  );
}

export async function createPersonalizedBlastOutboundMessages(
  input: CreatePersonalizedBlastOutboundMessagesInput,
): Promise<BlastDispatchResult> {
  const normalizedRecipients = input.recipients
    .map((recipient) => ({
      recipientPhoneNumber: String(recipient.recipientPhoneNumber || '').replace(/\D/g, '').trim(),
      content: String(recipient.content || '').trim(),
    }))
    .filter((recipient) => recipient.recipientPhoneNumber && recipient.content);

  return dispatchPersonalizedBlastMessages(
    normalizedRecipients,
    buildPersonalizedBlastRequestId(normalizedRecipients),
  );
}

export async function createTicketReplyOutboundMessage(
  input: CreateTicketReplyOutboundMessageInput,
): Promise<OutboundMessageRecord> {
  const supabase = getSupabaseAdminClient();
  await getOrCreateDefaultWhatsappInstance();
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
      whatsapp_instance_id: input.whatsappInstanceId,
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

export async function getOrCreateDefaultWhatsappInstance(): Promise<WhatsappInstanceRecord> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .upsert({
      id: DEFAULT_WHATSAPP_INSTANCE_ID,
      label: DEFAULT_WHATSAPP_INSTANCE_LABEL,
      status: 'starting',
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) {
    throw toRepositoryError('Failed to initialize default WhatsApp instance.', error);
  }

  return data as WhatsappInstanceRecord;
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
