import crypto from 'node:crypto';

import { z } from 'zod';

export const API_CLIENT_KEY_PATTERN = /^wapi_([A-Za-z0-9]+)_[A-Za-z0-9\-_]+$/;
export const API_CLIENT_STATUSES = ['active', 'disabled'] as const;
export const OUTBOUND_MESSAGE_STATUSES = ['queued', 'retrying', 'sent', 'failed'] as const;
export const WHATSAPP_INSTANCE_STATUSES = [
  'starting',
  'qr_required',
  'connecting',
  'ready',
  'degraded',
  'disconnected',
  'auth_failed',
] as const;
export const OUTBOUND_MESSAGE_SOURCE_TYPES = ['api_notification', 'ticket_reply', 'blast'] as const;
export const MAX_MESSAGE_LENGTH = 4096;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
export const MAX_CLIENT_REFERENCE_LENGTH = 255;
export const DEFAULT_GLOBAL_MESSAGES_PER_MINUTE = 24;
export const DEFAULT_MAX_REQUESTS_PER_MINUTE = 60;
export const DEFAULT_MAX_PENDING_MESSAGES = 100;
export const TICKET_REPLY_PRIORITY = 10;
export const BLAST_PRIORITY = 50;
export const API_NOTIFICATION_PRIORITY = 100;
export const DEFAULT_DISPATCH_SETTINGS_ID = 'default';
export const DEFAULT_WHATSAPP_INSTANCE_ID = 'default';
export const DEFAULT_WHATSAPP_INSTANCE_LABEL = 'Primary WhatsApp';

export type ApiClientStatus = (typeof API_CLIENT_STATUSES)[number];
export type OutboundMessageStatus = (typeof OUTBOUND_MESSAGE_STATUSES)[number];
export type OutboundMessageSourceType = (typeof OUTBOUND_MESSAGE_SOURCE_TYPES)[number];
export type WhatsappInstanceStatus = (typeof WHATSAPP_INSTANCE_STATUSES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ApiClientRecord {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  status: ApiClientStatus;
  max_requests_per_minute: number;
  max_pending_messages: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutboundMessageRecord {
  id: string;
  client_id: string | null;
  idempotency_key: string | null;
  request_fingerprint: string | null;
  source_type: OutboundMessageSourceType;
  source_id: string;
  ticket_id: string | null;
  whatsapp_instance_id: string;
  priority: number;
  recipient_phone_number: string;
  recipient_chat_id: string | null;
  content: string;
  client_reference: string | null;
  delivery_status: OutboundMessageStatus;
  delivery_attempts: number;
  next_retry_at: string | null;
  last_delivery_error: string | null;
  whatsapp_message_id: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DispatchSettingsRecord {
  id: string;
  global_messages_per_minute: number;
  api_notifications_paused: boolean;
  updated_at: string;
}

export interface WhatsappInstanceRecord {
  id: string;
  label: string;
  status: WhatsappInstanceStatus;
  last_known_phone_number: string | null;
  last_known_chat_id: string | null;
  last_ready_at: string | null;
  last_qr_at: string | null;
  last_disconnect_at: string | null;
  last_error: string | null;
  assigned_worker_id: string | null;
  updated_at: string;
}

export interface WhatsappInstanceEventRecord {
  id: string;
  whatsapp_instance_id: string;
  event_type:
    | 'qr_issued'
    | 'ready'
    | 'disconnected'
    | 'auth_failed'
    | 'worker_stale'
    | 'reconnect_started';
  message: string | null;
  metadata: JsonValue | null;
  created_at: string;
}

export interface WhatsappInstanceRuntime {
  instance_id: string;
  status: WhatsappInstanceStatus;
  worker_id: string | null;
  worker_host: string | null;
  worker_version: string | null;
  assigned_worker_id: string | null;
  last_heartbeat_at: string | null;
  qr_code: string | null;
  qr_terminal: string | null;
  qr_generated_at: string | null;
  qr_expires_at: string | null;
  last_error: string | null;
  last_disconnect_at: string | null;
  reconnect_count_24h: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  has_worker_conflict: boolean;
}

export interface WhatsappInstanceQueueSummary {
  queued_ticket_replies: number;
  queued_api_notifications: number;
  queued_blast_messages: number;
  retrying_messages: number;
  failed_messages: number;
  sent_messages: number;
  oldest_queued_at: string | null;
}

export interface WhatsappInstanceStaffSummary {
  active_ticket_count: number;
  latest_ticket_id: string | null;
  latest_ticket_subject: string | null;
  latest_ticket_updated_at: string | null;
  latest_inbound_preview: string | null;
  latest_inbound_at: string | null;
  latest_outbound_reply_status: OutboundMessageStatus | null;
}

export interface WhatsappInstanceSummary {
  instance: WhatsappInstanceRecord;
  runtime: WhatsappInstanceRuntime | null;
  derived_status: WhatsappInstanceStatus;
  has_qr: boolean;
  queue: WhatsappInstanceQueueSummary;
  staff: WhatsappInstanceStaffSummary;
}

export interface WhatsappDashboardSummary {
  total_instances: number;
  ready_instances: number;
  qr_required_instances: number;
  degraded_instances: number;
  queued_ticket_replies: number;
  queued_api_notifications: number;
  queued_blast_messages: number;
  oldest_queued_at: string | null;
  failed_or_retrying_messages: number;
}

export interface WhatsappDashboardOverview {
  summary: WhatsappDashboardSummary;
  instances: WhatsappInstanceSummary[];
}

export interface WhatsappOutboundSummary {
  queued: number;
  retrying: number;
  failed: number;
  sent: number;
  ticket_reply: number;
  api_notification: number;
  blast: number;
}

export interface OutboundTrackerSummary {
  queued: number;
  retrying: number;
  failed: number;
  sent: number;
  active: number;
  total: number;
  ticket_reply: number;
  api_notification: number;
  blast: number;
  queued_ticket_replies: number;
  queued_api_notifications: number;
  queued_blast_messages: number;
  effective_min_gap_ms: number;
  api_notifications_paused: boolean;
  estimated_completion_seconds: number | null;
  updated_at: string;
}

export interface OutboundTrackerResponse {
  summary: OutboundTrackerSummary;
  items: WhatsappOutboundListItem[];
}

export interface WhatsappOutboundListItem {
  id: string;
  whatsapp_instance_id: string;
  instance_label: string | null;
  ticket_id: string | null;
  source_type: OutboundMessageSourceType;
  delivery_status: OutboundMessageStatus;
  recipient_phone_number: string;
  client_reference: string | null;
  created_at: string;
  delivered_at: string | null;
  last_delivery_error: string | null;
}

export interface ValidatedQueueWhatsappMessagePayload {
  recipientPhoneNumber: string;
  message: string;
  clientReference: string | null;
}

type QueueWhatsappMessageParseResult =
  | {
      success: true;
      data: ValidatedQueueWhatsappMessagePayload;
    }
  | {
      success: false;
      error: z.ZodError;
    };

const queueWhatsappMessageSchema = z
  .object({
    to: z
      .string()
      .trim()
      .min(1, 'Field `to` is required.')
      .transform((value, ctx) => {
        const normalizedPhoneNumber = normalizePhoneNumber(value);

        if (!normalizedPhoneNumber) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Field `to` must contain a valid international phone number.',
          });
          return z.NEVER;
        }

        return normalizedPhoneNumber;
      }),
    message: z
      .string()
      .trim()
      .min(1, 'Field `message` is required.')
      .max(
        MAX_MESSAGE_LENGTH,
        `Field \`message\` must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      ),
    client_reference: z
      .string()
      .trim()
      .min(1, 'Field `client_reference` cannot be empty.')
      .max(
        MAX_CLIENT_REFERENCE_LENGTH,
        `Field \`client_reference\` must be ${MAX_CLIENT_REFERENCE_LENGTH} characters or fewer.`,
      )
      .optional(),
  })
  .strict();

export function normalizePhoneNumber(value: string): string | null {
  const digitsOnly = String(value || '').replace(/\D/g, '');

  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return null;
  }

  return digitsOnly;
}

export function parseQueueWhatsappMessagePayload(
  value: unknown,
): QueueWhatsappMessageParseResult {
  const parsed = queueWhatsappMessageSchema.safeParse(value);

  if (!parsed.success) {
    return parsed;
  }

  return {
    success: true,
    data: {
      recipientPhoneNumber: parsed.data.to,
      message: parsed.data.message,
      clientReference: parsed.data.client_reference ?? null,
    },
  };
}

export function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const token = match[1].trim();
  return token || null;
}

export function extractApiKeyPrefix(apiKey: string): string | null {
  const match = apiKey.match(API_CLIENT_KEY_PATTERN);
  return match?.[1] || null;
}

export function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashApiKey(apiKey: string): string {
  return hashValue(apiKey);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function normalizeIdempotencyKey(value: string | null): string | null {
  const normalized = String(value || '').trim();

  if (!normalized || normalized.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return null;
  }

  return normalized;
}

export function createRequestFingerprint(payload: ValidatedQueueWhatsappMessagePayload): string {
  return hashValue(
    JSON.stringify({
      recipientPhoneNumber: payload.recipientPhoneNumber,
      message: payload.message,
      clientReference: payload.clientReference,
    }),
  );
}

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    if (!issue.path.length) {
      return issue.message;
    }

    return `${issue.path.join('.')}: ${issue.message}`;
  });
}

export function buildApiNotificationSourceId(clientId: string, idempotencyKey: string): string {
  return `api:${clientId}:${idempotencyKey}`;
}

export function computeEffectiveMinGapMs(globalMessagesPerMinute: number): number {
  return Math.ceil(60000 / Math.max(1, globalMessagesPerMinute));
}
