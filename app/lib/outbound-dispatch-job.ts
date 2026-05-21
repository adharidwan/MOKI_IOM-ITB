import type {
  OutboundMessageRecord,
  OutboundMessageSourceType,
} from './whatsapp-notification-utils';

export const OUTBOUND_DISPATCH_QUEUE_NAME = 'outbound-dispatch';
export const API_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const DISPATCH_CONTROL_RECHECK_DELAY_MS = 1000;
export const OUTBOUND_REDIS_KEY_PREFIX = 'outbound_dispatch';

export interface QueueWhatsappMessageResponse {
  message_id: string;
  status: 'queued';
  accepted_at: string;
  client_reference: string | null;
  idempotent_replay: boolean;
}

export interface OutboundDispatchJobData {
  outbound_message_id: string;
  client_id: string | null;
  idempotency_key: string | null;
  source_type: OutboundMessageSourceType;
  source_id: string;
  ticket_id: string | null;
  whatsapp_instance_id: string;
  recipient_phone_number: string;
  recipient_chat_id: string | null;
  content: string;
  media_bucket: string | null;
  media_path: string | null;
  media_mime_type: string | null;
  media_file_name: string | null;
  priority: number;
  attempt_number: number;
  client_reference: string | null;
  accepted_at: string;
}

export interface StoredApiIdempotencyRecord {
  state: 'inflight' | 'completed';
  request_fingerprint: string;
  response: QueueWhatsappMessageResponse | null;
  updated_at: string;
}

export function buildOutboundDispatchJobData(
  message: OutboundMessageRecord,
): OutboundDispatchJobData {
  return {
    outbound_message_id: message.id,
    client_id: message.client_id,
    idempotency_key: message.idempotency_key,
    source_type: message.source_type,
    source_id: message.source_id,
    ticket_id: message.ticket_id,
    whatsapp_instance_id: message.whatsapp_instance_id,
    recipient_phone_number: message.recipient_phone_number,
    recipient_chat_id: message.recipient_chat_id,
    content: message.content,
    media_bucket: message.media_bucket,
    media_path: message.media_path,
    media_mime_type: message.media_mime_type,
    media_file_name: message.media_file_name,
    priority: message.priority,
    attempt_number: message.delivery_attempts,
    client_reference: message.client_reference,
    accepted_at: message.created_at,
  };
}

export function buildSourcePendingCountKey(sourceType: OutboundMessageSourceType): string {
  return `${OUTBOUND_REDIS_KEY_PREFIX}:source:${sourceType}:pending_count`;
}

export function buildClientPendingCountKey(clientId: string): string {
  return `${OUTBOUND_REDIS_KEY_PREFIX}:client:${clientId}:pending_count`;
}

export function buildClientAcceptedSetKey(clientId: string): string {
  return `${OUTBOUND_REDIS_KEY_PREFIX}:client:${clientId}:accepted_timestamps`;
}

export function buildIdempotencyKey(clientId: string, idempotencyKey: string): string {
  return `${OUTBOUND_REDIS_KEY_PREFIX}:client:${clientId}:idempotency:${idempotencyKey}`;
}
