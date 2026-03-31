import 'server-only';

import { PostgrestError } from '@supabase/supabase-js';

import { getSupabaseAdminClient } from './supabase-server';
import {
  API_NOTIFICATION_PRIORITY,
  ApiClientRecord,
  DEFAULT_DISPATCH_SETTINGS_ID,
  DEFAULT_GLOBAL_MESSAGES_PER_MINUTE,
  OutboundMessageRecord,
  DispatchSettingsRecord,
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

export function createSupabaseNotificationRepository(): NotificationRepository {
  const supabase = getSupabaseAdminClient();

  return {
    async findApiClientByKeyPrefix(keyPrefix: string): Promise<ApiClientRecord | null> {
      const { data, error } = await supabase
        .from('api_clients')
        .select('*')
        .eq('key_prefix', keyPrefix)
        .maybeSingle();

      if (error) {
        throw toRepositoryError('Failed to load API client.', error);
      }

      return (data as ApiClientRecord | null) ?? null;
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

    async findOutboundMessageByIdempotency(
      clientId: string,
      idempotencyKey: string,
    ): Promise<OutboundMessageRecord | null> {
      const { data, error } = await supabase
        .from('outbound_messages')
        .select('*')
        .eq('client_id', clientId)
        .eq('source_type', 'api_notification')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (error) {
        throw toRepositoryError('Failed to load outbound message.', error);
      }

      return (data as OutboundMessageRecord | null) ?? null;
    },

    async countRecentAcceptedApiNotifications(
      clientId: string,
      sinceIsoTimestamp: string,
    ): Promise<number> {
      const { count, error } = await supabase
        .from('outbound_messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('source_type', 'api_notification')
        .gte('created_at', sinceIsoTimestamp);

      if (error) {
        throw toRepositoryError('Failed to count recent outbound messages.', error);
      }

      return count ?? 0;
    },

    async countPendingApiNotifications(clientId: string): Promise<number> {
      const { count, error } = await supabase
        .from('outbound_messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('source_type', 'api_notification')
        .in('delivery_status', ['queued', 'retrying']);

      if (error) {
        throw toRepositoryError('Failed to count pending outbound messages.', error);
      }

      return count ?? 0;
    },

    async createOutboundMessage(
      input: CreateOutboundMessageInput,
    ): Promise<OutboundMessageRecord> {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('outbound_messages')
        .insert({
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
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();

      if (error) {
        throw toRepositoryError('Failed to queue outbound message.', error);
      }

      return data as OutboundMessageRecord;
    },
  };
}

function toRepositoryError(message: string, error: PostgrestError): NotificationRepositoryError {
  const repositoryError = new NotificationRepositoryError(
    `${message} ${error.message}`,
    error.code,
  );

  return repositoryError;
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
    throw toRepositoryError('Failed to queue ticket reply outbound message.', error);
  }

  return data as OutboundMessageRecord;
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
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from('outbound_messages')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', sourceType)
    .in('delivery_status', ['queued', 'retrying']);

  if (error) {
    throw toRepositoryError('Failed to count queued outbound messages.', error);
  }

  return count ?? 0;
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
