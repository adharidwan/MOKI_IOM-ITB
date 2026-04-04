import type IORedis from 'ioredis';

import { getRedisClient } from './redis-server';
import {
  type JsonObject,
  type WhatsappInstanceRuntime,
  type WhatsappInstanceStatus,
} from './whatsapp-notification-utils';

export const WHATSAPP_RUNTIME_TTL_SECONDS = 30;
export const WHATSAPP_QR_TTL_SECONDS = 60;
export const WHATSAPP_RECONNECT_WINDOW_SECONDS = 24 * 60 * 60;

type RedisLike = Pick<IORedis, 'get' | 'ttl'>;

interface RuntimeSnapshotPayload {
  status: WhatsappInstanceStatus;
  worker_id: string | null;
  worker_host: string | null;
  worker_version: string | null;
  assigned_worker_id: string | null;
  last_heartbeat_at: string | null;
  last_error: string | null;
  last_disconnect_at: string | null;
  reconnect_count_24h: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}

interface QrSnapshotPayload {
  qr_code: string;
  qr_terminal: string | null;
  generated_at: string;
}

function parseJson<T>(rawValue: string | null): T | null {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

export function buildWhatsappRuntimeKey(instanceId: string): string {
  return `whatsapp:instance:${instanceId}:runtime`;
}

export function buildWhatsappQrKey(instanceId: string): string {
  return `whatsapp:instance:${instanceId}:qr`;
}

export function buildWhatsappHeartbeatKey(instanceId: string): string {
  return `whatsapp:instance:${instanceId}:heartbeat`;
}

export function buildWhatsappReconnectCountKey(instanceId: string): string {
  return `whatsapp:instance:${instanceId}:reconnects_24h`;
}

export function sanitizeWhatsappMetadata(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as JsonObject;
}

export async function readWhatsappInstanceRuntime(
  instanceId: string,
  redis?: RedisLike,
): Promise<WhatsappInstanceRuntime | null> {
  const client = redis || getRedisClient();
  const [runtimeRaw, qrRaw, qrTtlSeconds] = await Promise.all([
    client.get(buildWhatsappRuntimeKey(instanceId)),
    client.get(buildWhatsappQrKey(instanceId)),
    client.ttl(buildWhatsappQrKey(instanceId)),
  ]);

  const runtimePayload = parseJson<RuntimeSnapshotPayload>(runtimeRaw);
  const qrPayload = parseJson<QrSnapshotPayload>(qrRaw);

  if (!runtimePayload && !qrPayload) {
    return null;
  }

  const qrExpiresAt =
    qrPayload && qrTtlSeconds > 0
      ? new Date(Date.now() + qrTtlSeconds * 1000).toISOString()
      : null;

  return {
    instance_id: instanceId,
    status: runtimePayload?.status || 'qr_required',
    worker_id: runtimePayload?.worker_id || null,
    worker_host: runtimePayload?.worker_host || null,
    worker_version: runtimePayload?.worker_version || null,
    assigned_worker_id: runtimePayload?.assigned_worker_id || null,
    last_heartbeat_at: runtimePayload?.last_heartbeat_at || null,
    qr_code: qrPayload?.qr_code || null,
    qr_terminal: qrPayload?.qr_terminal || null,
    qr_generated_at: qrPayload?.generated_at || null,
    qr_expires_at: qrExpiresAt,
    last_error: runtimePayload?.last_error || null,
    last_disconnect_at: runtimePayload?.last_disconnect_at || null,
    reconnect_count_24h: runtimePayload?.reconnect_count_24h || 0,
    last_inbound_at: runtimePayload?.last_inbound_at || null,
    last_outbound_at: runtimePayload?.last_outbound_at || null,
    has_worker_conflict:
      Boolean(runtimePayload?.assigned_worker_id) &&
      Boolean(runtimePayload?.worker_id) &&
      runtimePayload?.assigned_worker_id !== runtimePayload?.worker_id,
  };
}
