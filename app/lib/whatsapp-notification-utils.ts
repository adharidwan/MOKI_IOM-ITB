import crypto from 'node:crypto';

import { z } from 'zod';

export const API_CLIENT_KEY_PATTERN = /^wapi_([A-Za-z0-9]+)_[A-Za-z0-9\-_]+$/;
export const API_CLIENT_STATUSES = ['active', 'disabled'] as const;
export const OUTBOUND_MESSAGE_STATUSES = ['queued', 'retrying', 'sent', 'failed'] as const;
export const OUTBOUND_MESSAGE_SOURCE_TYPES = ['api_notification', 'ticket_reply'] as const;
export const MAX_MESSAGE_LENGTH = 4096;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
export const MAX_CLIENT_REFERENCE_LENGTH = 255;
export const DEFAULT_GLOBAL_MESSAGES_PER_MINUTE = 24;
export const DEFAULT_MAX_REQUESTS_PER_MINUTE = 60;
export const DEFAULT_MAX_PENDING_MESSAGES = 100;
export const TICKET_REPLY_PRIORITY = 10;
export const API_NOTIFICATION_PRIORITY = 100;
export const DEFAULT_DISPATCH_SETTINGS_ID = 'default';

export type ApiClientStatus = (typeof API_CLIENT_STATUSES)[number];
export type OutboundMessageStatus = (typeof OUTBOUND_MESSAGE_STATUSES)[number];
export type OutboundMessageSourceType = (typeof OUTBOUND_MESSAGE_SOURCE_TYPES)[number];

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
