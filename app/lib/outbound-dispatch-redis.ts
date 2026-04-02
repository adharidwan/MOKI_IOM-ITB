import 'server-only';

import crypto from 'node:crypto';

import type IORedis from 'ioredis';

import {
  API_IDEMPOTENCY_TTL_SECONDS,
  type ApiClientRecord,
  buildClientAcceptedSetKey,
  buildClientPendingCountKey,
  buildIdempotencyKey,
  buildSourcePendingCountKey,
  type QueueWhatsappMessageResponse,
  type StoredApiIdempotencyRecord,
} from './outbound-dispatch-job';
import { getRedisClient } from './redis-server';
import type { OutboundMessageSourceType } from './whatsapp-notification-utils';

const ACCEPTED_RATE_WINDOW_MS = 60_000;
const ACCEPTED_RATE_WINDOW_SECONDS = 60;
const API_CLIENT_CACHE_TTL_SECONDS = 60;
const IDEMPOTENCY_POLL_INTERVAL_MS = 50;
const IDEMPOTENCY_POLL_ATTEMPTS = 20;
const DECREMENT_COUNTER_LUA = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  if current <= 1 then
    redis.call('SET', KEYS[1], '0')
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
    return 0
  end

  local next = current - 1
  redis.call('SET', KEYS[1], tostring(next))
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  return next
`;

export type ApiIdempotencyReservationResult =
  | {
      status: 'acquired';
    }
  | {
      status: 'replay';
      record: StoredApiIdempotencyRecord;
    }
  | {
      status: 'conflict';
    };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getClient(redis?: IORedis): IORedis {
  return redis || getRedisClient();
}

function buildApiClientCacheKey(keyPrefix: string): string {
  return `outbound_dispatch:api_client:${keyPrefix}`;
}

function parseIdempotencyRecord(rawValue: string | null): StoredApiIdempotencyRecord | null {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoredApiIdempotencyRecord;
  } catch {
    return null;
  }
}

async function getStoredIdempotencyRecord(
  redis: IORedis,
  clientId: string,
  idempotencyKey: string,
): Promise<StoredApiIdempotencyRecord | null> {
  const rawRecord = await redis.get(buildIdempotencyKey(clientId, idempotencyKey));
  return parseIdempotencyRecord(rawRecord);
}

export async function reserveApiNotificationIdempotency(
  clientId: string,
  idempotencyKey: string,
  requestFingerprint: string,
  ttlSeconds = API_IDEMPOTENCY_TTL_SECONDS,
  redis?: IORedis,
): Promise<ApiIdempotencyReservationResult> {
  const client = getClient(redis);
  const key = buildIdempotencyKey(clientId, idempotencyKey);
  const reservation: StoredApiIdempotencyRecord = {
    state: 'inflight',
    request_fingerprint: requestFingerprint,
    response: null,
    updated_at: new Date().toISOString(),
  };

  const acquired = await client.set(key, JSON.stringify(reservation), 'EX', ttlSeconds, 'NX');

  if (acquired === 'OK') {
    return { status: 'acquired' };
  }

  for (let attempt = 0; attempt < IDEMPOTENCY_POLL_ATTEMPTS; attempt += 1) {
    const existingRecord = await getStoredIdempotencyRecord(client, clientId, idempotencyKey);

    if (!existingRecord) {
      const retryAcquire = await client.set(
        key,
        JSON.stringify(reservation),
        'EX',
        ttlSeconds,
        'NX',
      );

      if (retryAcquire === 'OK') {
        return { status: 'acquired' };
      }

      await sleep(IDEMPOTENCY_POLL_INTERVAL_MS);
      continue;
    }

    if (existingRecord.request_fingerprint !== requestFingerprint) {
      return { status: 'conflict' };
    }

    if (existingRecord.state === 'completed' && existingRecord.response) {
      return {
        status: 'replay',
        record: existingRecord,
      };
    }

    await sleep(IDEMPOTENCY_POLL_INTERVAL_MS);
  }

  throw new Error('Timed out while waiting for the idempotency reservation to complete.');
}

export async function completeApiNotificationIdempotency(
  clientId: string,
  idempotencyKey: string,
  requestFingerprint: string,
  response: QueueWhatsappMessageResponse,
  ttlSeconds = API_IDEMPOTENCY_TTL_SECONDS,
  redis?: IORedis,
): Promise<void> {
  const client = getClient(redis);
  const key = buildIdempotencyKey(clientId, idempotencyKey);
  const storedRecord: StoredApiIdempotencyRecord = {
    state: 'completed',
    request_fingerprint: requestFingerprint,
    response: {
      ...response,
      idempotent_replay: false,
    },
    updated_at: new Date().toISOString(),
  };

  await client.set(key, JSON.stringify(storedRecord), 'EX', ttlSeconds);
}

export async function clearApiNotificationIdempotency(
  clientId: string,
  idempotencyKey: string,
  requestFingerprint: string,
  redis?: IORedis,
): Promise<void> {
  const client = getClient(redis);
  const key = buildIdempotencyKey(clientId, idempotencyKey);
  const existingRecord = await getStoredIdempotencyRecord(client, clientId, idempotencyKey);

  if (
    existingRecord &&
    existingRecord.state === 'inflight' &&
    existingRecord.request_fingerprint === requestFingerprint
  ) {
    await client.del(key);
  }
}

export async function countRecentAcceptedApiNotifications(
  clientId: string,
  nowMs = Date.now(),
  redis?: IORedis,
): Promise<number> {
  const client = getClient(redis);
  const key = buildClientAcceptedSetKey(clientId);
  const windowStartMs = nowMs - ACCEPTED_RATE_WINDOW_MS;

  await client.zremrangebyscore(key, 0, windowStartMs);
  return client.zcard(key);
}

export async function recordAcceptedApiNotification(
  clientId: string,
  acceptedAtIso: string,
  redis?: IORedis,
): Promise<void> {
  const client = getClient(redis);
  const key = buildClientAcceptedSetKey(clientId);
  const acceptedAtMs = Date.parse(acceptedAtIso);
  const member = `${acceptedAtMs}:${crypto.randomUUID()}`;

  await client
    .multi()
    .zadd(key, acceptedAtMs, member)
    .zremrangebyscore(key, 0, acceptedAtMs - ACCEPTED_RATE_WINDOW_MS)
    .expire(key, ACCEPTED_RATE_WINDOW_SECONDS)
    .exec();
}

export async function getPendingApiNotificationCount(
  clientId: string,
  redis?: IORedis,
): Promise<number> {
  const client = getClient(redis);
  const rawValue = await client.get(buildClientPendingCountKey(clientId));
  return Number.parseInt(rawValue || '0', 10) || 0;
}

export async function getPendingOutboundMessageCountBySource(
  sourceType: OutboundMessageSourceType,
  redis?: IORedis,
): Promise<number> {
  const client = getClient(redis);
  const rawValue = await client.get(buildSourcePendingCountKey(sourceType));
  return Number.parseInt(rawValue || '0', 10) || 0;
}

export async function incrementPendingOutboundCounts(
  sourceType: OutboundMessageSourceType,
  clientId: string | null,
  redis?: IORedis,
): Promise<void> {
  const client = getClient(redis);
  const multi = client.multi();

  multi.incr(buildSourcePendingCountKey(sourceType));
  multi.expire(buildSourcePendingCountKey(sourceType), API_IDEMPOTENCY_TTL_SECONDS);

  if (clientId) {
    multi.incr(buildClientPendingCountKey(clientId));
    multi.expire(buildClientPendingCountKey(clientId), API_IDEMPOTENCY_TTL_SECONDS);
  }

  await multi.exec();
}

export async function decrementPendingOutboundCounts(
  sourceType: OutboundMessageSourceType,
  clientId: string | null,
  redis?: IORedis,
): Promise<void> {
  const client = getClient(redis);
  const keys = [buildSourcePendingCountKey(sourceType)];

  if (clientId) {
    keys.push(buildClientPendingCountKey(clientId));
  }

  await Promise.all(
    keys.map((key) => client.eval(DECREMENT_COUNTER_LUA, 1, key, API_IDEMPOTENCY_TTL_SECONDS)),
  );
}

export async function getCachedApiClientByKeyPrefix(
  keyPrefix: string,
  redis?: IORedis,
): Promise<ApiClientRecord | null> {
  const client = getClient(redis);
  const rawValue = await client.get(buildApiClientCacheKey(keyPrefix));

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as ApiClientRecord;
  } catch {
    await client.del(buildApiClientCacheKey(keyPrefix));
    return null;
  }
}

export async function cacheApiClientByKeyPrefix(
  apiClient: ApiClientRecord,
  redis?: IORedis,
): Promise<void> {
  const client = getClient(redis);
  await client.set(
    buildApiClientCacheKey(apiClient.key_prefix),
    JSON.stringify(apiClient),
    'EX',
    API_CLIENT_CACHE_TTL_SECONDS,
  );
}
