import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleWhatsappNotificationRequest,
  NotificationRepository,
} from '../app/lib/whatsapp-notification-service';
import type {
  ApiClientRecord,
  OutboundMessageRecord,
} from '../app/lib/whatsapp-notification-utils';
import {
  API_IDEMPOTENCY_TTL_SECONDS,
  type QueueWhatsappMessageResponse,
  type StoredApiIdempotencyRecord,
} from '../app/lib/outbound-dispatch-job';
import {
  API_NOTIFICATION_PRIORITY,
  DEFAULT_MAX_PENDING_MESSAGES,
  DEFAULT_MAX_REQUESTS_PER_MINUTE,
  buildApiNotificationSourceId,
  createRequestFingerprint,
  hashApiKey,
} from '../app/lib/whatsapp-notification-utils';

const FIXED_NOW = new Date('2026-03-31T05:30:00.000Z');

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

class InMemoryNotificationRepository implements NotificationRepository {
  clients: ApiClientRecord[];
  outboundMessages: OutboundMessageRecord[];
  idempotencyRecords = new Map<
    string,
    {
      record: StoredApiIdempotencyRecord;
      expiresAtMs: number;
    }
  >();
  acceptedByClient = new Map<string, number[]>();
  pendingByClient = new Map<string, number>();
  nowMs = FIXED_NOW.getTime();
  touchMode: 'immediate' | 'deferred' | 'reject' = 'immediate';
  touchStarted = false;
  touchResolved = false;
  touchErrorMessage = 'touch failed';
  private touchDeferredResolver: (() => void) | null = null;

  constructor(clients: ApiClientRecord[]) {
    this.clients = clients;
    this.outboundMessages = [];
  }

  async findApiClientByKeyPrefix(keyPrefix: string): Promise<ApiClientRecord | null> {
    return this.clients.find((client) => client.key_prefix === keyPrefix) ?? null;
  }

  resolveDeferredTouch(): void {
    this.touchDeferredResolver?.();
    this.touchDeferredResolver = null;
  }

  async touchApiClientLastUsedAt(clientId: string, isoTimestamp: string): Promise<void> {
    this.touchStarted = true;

    if (this.touchMode === 'reject') {
      throw new Error(this.touchErrorMessage);
    }

    if (this.touchMode === 'deferred') {
      await new Promise<void>((resolve) => {
        this.touchDeferredResolver = resolve;
      });
    }

    const client = this.clients.find((item) => item.id === clientId);

    if (!client) {
      throw new Error('Client not found.');
    }

    client.last_used_at = isoTimestamp;
    client.updated_at = isoTimestamp;
    this.touchResolved = true;
  }

  async reserveApiNotificationIdempotency(
    clientId: string,
    idempotencyKey: string,
    requestFingerprint: string,
    ttlSeconds: number,
  ): Promise<
    | {
        status: 'acquired';
      }
    | {
        status: 'replay';
        record: StoredApiIdempotencyRecord;
      }
    | {
        status: 'conflict';
      }
  > {
    const mapKey = `${clientId}:${idempotencyKey}`;
    const existing = this.idempotencyRecords.get(mapKey);
    const nowMs = this.nowMs;

    if (existing && existing.expiresAtMs > nowMs) {
      if (existing.record.request_fingerprint !== requestFingerprint) {
        return { status: 'conflict' };
      }

      if (existing.record.state === 'completed') {
        return { status: 'replay', record: existing.record };
      }
    }

    this.idempotencyRecords.set(mapKey, {
      record: {
        state: 'inflight',
        request_fingerprint: requestFingerprint,
        response: null,
        updated_at: FIXED_NOW.toISOString(),
      },
      expiresAtMs: nowMs + ttlSeconds * 1000,
    });

    return { status: 'acquired' };
  }

  async completeApiNotificationIdempotency(
    clientId: string,
    idempotencyKey: string,
    requestFingerprint: string,
    response: QueueWhatsappMessageResponse,
    ttlSeconds: number,
  ): Promise<void> {
    this.idempotencyRecords.set(`${clientId}:${idempotencyKey}`, {
      record: {
        state: 'completed',
        request_fingerprint: requestFingerprint,
        response: {
          ...response,
          idempotent_replay: false,
        },
        updated_at: FIXED_NOW.toISOString(),
      },
      expiresAtMs: this.nowMs + ttlSeconds * 1000,
    });
  }

  async clearApiNotificationIdempotency(
    clientId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<void> {
    const mapKey = `${clientId}:${idempotencyKey}`;
    const existing = this.idempotencyRecords.get(mapKey);

    if (
      existing &&
      existing.record.state === 'inflight' &&
      existing.record.request_fingerprint === requestFingerprint
    ) {
      this.idempotencyRecords.delete(mapKey);
    }
  }

  async countRecentAcceptedApiNotifications(clientId: string, nowMs: number): Promise<number> {
    return (this.acceptedByClient.get(clientId) || []).filter((value) => value > nowMs - 60_000)
      .length;
  }

  async countPendingApiNotifications(clientId: string): Promise<number> {
    return this.pendingByClient.get(clientId) || 0;
  }

  async createOutboundMessage(input: {
    clientId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    recipientPhoneNumber: string;
    content: string;
    clientReference: string | null;
    acceptedAt: string;
  }): Promise<OutboundMessageRecord> {
    const outboundMessage: OutboundMessageRecord = {
      id: `outbound-${this.outboundMessages.length + 1}`,
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

    this.outboundMessages.push(outboundMessage);
    this.acceptedByClient.set(input.clientId, [
      ...(this.acceptedByClient.get(input.clientId) || []),
      Date.parse(input.acceptedAt),
    ]);
    this.pendingByClient.set(input.clientId, (this.pendingByClient.get(input.clientId) || 0) + 1);

    return outboundMessage;
  }
}

function createApiClient(status: 'active' | 'disabled' = 'active'): {
  apiKey: string;
  record: ApiClientRecord;
} {
  const apiKey = 'wapi_payments_1234567890abcdefghijklmnopqrst';

  return {
    apiKey,
    record: {
      id: 'client-1',
      name: 'Payments Service',
      key_prefix: 'payments',
      key_hash: hashApiKey(apiKey),
      status,
      max_requests_per_minute: DEFAULT_MAX_REQUESTS_PER_MINUTE,
      max_pending_messages: DEFAULT_MAX_PENDING_MESSAGES,
      last_used_at: null,
      created_at: FIXED_NOW.toISOString(),
      updated_at: FIXED_NOW.toISOString(),
    },
  };
}

async function sendRequest(
  repository: NotificationRepository,
  options: {
    apiKey?: string;
    body?: unknown;
    rawBody?: string;
    authorizationHeader?: string;
    contentType?: string;
    idempotencyKey?: string;
    now?: Date;
  } = {},
): Promise<Response> {
  const headers = new Headers();
  const requestNow = options.now ?? FIXED_NOW;

  if (repository instanceof InMemoryNotificationRepository) {
    repository.nowMs = requestNow.getTime();
  }

  headers.set('content-type', options.contentType ?? 'application/json');

  if (options.authorizationHeader) {
    headers.set('authorization', options.authorizationHeader);
  } else if (options.apiKey) {
    headers.set('authorization', `Bearer ${options.apiKey}`);
  }

  if (options.idempotencyKey !== undefined) {
    headers.set('idempotency-key', options.idempotencyKey);
  } else {
    headers.set('idempotency-key', 'idem-1');
  }

  return handleWhatsappNotificationRequest(
    new Request('http://localhost/api/v1/messages/whatsapp', {
      method: 'POST',
      headers,
      body: options.rawBody ?? JSON.stringify(
        options.body ?? {
          to: '+6281234567890',
          message: 'Transfer successful.',
          client_reference: 'trx-123',
        },
      ),
    }),
    repository,
    requestNow,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleWhatsappNotificationRequest', () => {
  it('queues a message for a valid API client', async () => {
    const { apiKey, record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);

    const response = await sendRequest(repository, { apiKey });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      message_id: 'outbound-1',
      status: 'queued',
      accepted_at: FIXED_NOW.toISOString(),
      client_reference: 'trx-123',
      idempotent_replay: false,
    });
    expect(repository.outboundMessages).toHaveLength(1);
    await flushAsyncWork();
    expect(repository.clients[0].last_used_at).toBe(FIXED_NOW.toISOString());
  });

  it('does not await api client usage metadata updates before returning 202', async () => {
    const { apiKey, record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);
    repository.touchMode = 'deferred';

    const response = await sendRequest(repository, { apiKey });

    expect(response.status).toBe(202);
    expect(repository.touchStarted).toBe(true);
    expect(repository.touchResolved).toBe(false);

    repository.resolveDeferredTouch();
    await flushAsyncWork();
    expect(repository.touchResolved).toBe(true);
  });

  it('does not fail a valid request when the async usage metadata update fails', async () => {
    const { apiKey, record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);
    repository.touchMode = 'reject';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await sendRequest(repository, { apiKey });

    expect(response.status).toBe(202);
    await flushAsyncWork();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"api_client_usage_metadata_update_failed"'),
    );
  });

  it('rejects missing or malformed API keys', async () => {
    const { record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);

    const missingKeyResponse = await sendRequest(repository, {
      authorizationHeader: '',
    });
    const malformedKeyResponse = await sendRequest(repository, {
      authorizationHeader: 'Basic not-a-bearer-token',
    });

    expect(missingKeyResponse.status).toBe(401);
    expect((await missingKeyResponse.json()).error.code).toBe('invalid_api_key');
    expect(malformedKeyResponse.status).toBe(401);
    expect((await malformedKeyResponse.json()).error.code).toBe('invalid_api_key');
  });

  it('rejects disabled API clients', async () => {
    const { apiKey, record } = createApiClient('disabled');
    const repository = new InMemoryNotificationRepository([record]);

    const response = await sendRequest(repository, { apiKey });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('api_client_disabled');
  });

  it('rejects unsupported media types and malformed JSON payloads', async () => {
    const { apiKey, record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);

    const unsupportedMediaTypeResponse = await sendRequest(repository, {
      apiKey,
      contentType: 'text/plain',
      rawBody: 'hello',
    });
    const invalidJsonResponse = await sendRequest(repository, {
      apiKey,
      rawBody: '{"message":',
    });

    expect(unsupportedMediaTypeResponse.status).toBe(415);
    expect((await unsupportedMediaTypeResponse.json()).error.code).toBe(
      'unsupported_media_type',
    );
    expect(invalidJsonResponse.status).toBe(422);
    expect((await invalidJsonResponse.json()).error.code).toBe('invalid_json');
  });

  it('rejects invalid request bodies', async () => {
    const { apiKey, record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);

    const response = await sendRequest(repository, {
      apiKey,
      body: {
        to: 'abc',
        message: '   ',
      },
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('invalid_request_body');
    expect(body.error.details).toContain('to: Field `to` must contain a valid international phone number.');
    expect(body.error.details).toContain('message: Field `message` is required.');
  });

  it('deduplicates exact idempotent replays within the redis ttl window', async () => {
    const { apiKey, record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);

    const firstResponse = await sendRequest(repository, { apiKey, idempotencyKey: 'idem-replay' });
    const secondResponse = await sendRequest(repository, { apiKey, idempotencyKey: 'idem-replay' });

    expect(firstResponse.status).toBe(202);
    expect(secondResponse.status).toBe(202);
    expect(repository.outboundMessages).toHaveLength(1);
    expect((await secondResponse.json()).idempotent_replay).toBe(true);
  });

  it('rejects idempotency reuse for a different payload', async () => {
    const { apiKey, record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);

    await sendRequest(repository, { apiKey, idempotencyKey: 'idem-conflict' });
    const conflictResponse = await sendRequest(repository, {
      apiKey,
      idempotencyKey: 'idem-conflict',
      body: {
        to: '+6281234567890',
        message: 'A different message body.',
      },
    });

    expect(conflictResponse.status).toBe(409);
    expect((await conflictResponse.json()).error.code).toBe('idempotency_conflict');
  });

  it('returns 429 when the client exceeds the per-minute request rate', async () => {
    const { apiKey, record } = createApiClient();
    record.max_requests_per_minute = 1;
    const repository = new InMemoryNotificationRepository([record]);
    repository.acceptedByClient.set(record.id, [FIXED_NOW.getTime()]);

    const response = await sendRequest(repository, {
      apiKey,
      idempotencyKey: 'idem-rate-limit',
    });

    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('request_rate_limit_exceeded');
  });

  it('returns 429 when the client exceeds the pending queue cap', async () => {
    const { apiKey, record } = createApiClient();
    record.max_pending_messages = 1;
    const repository = new InMemoryNotificationRepository([record]);
    repository.pendingByClient.set(record.id, 1);

    const response = await sendRequest(repository, {
      apiKey,
      idempotencyKey: 'idem-pending-limit',
    });

    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('pending_queue_limit_exceeded');
  });

  it('returns an exact idempotent replay even when the client is currently over limit', async () => {
    const { apiKey, record } = createApiClient();
    record.max_requests_per_minute = 1;
    record.max_pending_messages = 1;
    const repository = new InMemoryNotificationRepository([record]);

    await repository.completeApiNotificationIdempotency(
      record.id,
      'idem-existing',
      'fp-1',
      {
        message_id: 'outbound-1',
        status: 'queued',
        accepted_at: FIXED_NOW.toISOString(),
        client_reference: 'trx-123',
        idempotent_replay: false,
      },
      API_IDEMPOTENCY_TTL_SECONDS,
    );
    repository.idempotencyRecords.get(`${record.id}:idem-existing`)!.record.request_fingerprint =
      createRequestFingerprint({
        recipientPhoneNumber: '6281234567890',
        message: 'Transfer successful.',
        clientReference: 'trx-123',
      });
    repository.acceptedByClient.set(record.id, [FIXED_NOW.getTime()]);
    repository.pendingByClient.set(record.id, 1);

    const response = await sendRequest(repository, {
      apiKey,
      idempotencyKey: 'idem-existing',
    });

    expect(response.status).toBe(202);
    expect((await response.json()).idempotent_replay).toBe(true);
  });

  it('treats an expired redis idempotency key as a new request', async () => {
    const { apiKey, record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);

    await sendRequest(repository, { apiKey, idempotencyKey: 'idem-expired' });
    repository.idempotencyRecords.get(`${record.id}:idem-expired`)!.expiresAtMs =
      FIXED_NOW.getTime() - 1;

    const later = new Date(FIXED_NOW.getTime() + API_IDEMPOTENCY_TTL_SECONDS * 1000 + 1000);
    const response = await sendRequest(repository, {
      apiKey,
      idempotencyKey: 'idem-expired',
      now: later,
    });

    expect(response.status).toBe(202);
    expect(repository.outboundMessages).toHaveLength(2);
    expect((await response.json()).message_id).toBe('outbound-2');
  });

  it('returns validation errors without debug timing headers', async () => {
    const { apiKey, record } = createApiClient();
    const repository = new InMemoryNotificationRepository([record]);

    const response = await sendRequest(repository, {
      apiKey,
      body: {
        to: 'abc',
        message: '   ',
      },
    });

    expect(response.status).toBe(422);
    expect(response.headers.get('server-timing')).toBeNull();
    expect(response.headers.get('x-whatsapp-api-timing')).toBeNull();
  });
});
