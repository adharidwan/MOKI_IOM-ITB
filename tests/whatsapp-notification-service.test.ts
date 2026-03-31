import { describe, expect, it } from 'vitest';

import {
  handleWhatsappNotificationRequest,
  NotificationRepository,
  NotificationRepositoryError,
} from '../app/lib/whatsapp-notification-service';
import type {
  ApiClientRecord,
  OutboundMessageRecord,
} from '../app/lib/whatsapp-notification-utils';
import {
  API_NOTIFICATION_PRIORITY,
  DEFAULT_MAX_PENDING_MESSAGES,
  DEFAULT_MAX_REQUESTS_PER_MINUTE,
  buildApiNotificationSourceId,
  createRequestFingerprint,
  hashApiKey,
} from '../app/lib/whatsapp-notification-utils';

const FIXED_NOW = new Date('2026-03-31T05:30:00.000Z');

class InMemoryNotificationRepository implements NotificationRepository {
  clients: ApiClientRecord[];
  outboundMessages: OutboundMessageRecord[];

  constructor(clients: ApiClientRecord[]) {
    this.clients = clients;
    this.outboundMessages = [];
  }

  async findApiClientByKeyPrefix(keyPrefix: string): Promise<ApiClientRecord | null> {
    return this.clients.find((client) => client.key_prefix === keyPrefix) ?? null;
  }

  async touchApiClientLastUsedAt(clientId: string, isoTimestamp: string): Promise<void> {
    const client = this.clients.find((item) => item.id === clientId);

    if (!client) {
      throw new Error('Client not found.');
    }

    client.last_used_at = isoTimestamp;
    client.updated_at = isoTimestamp;
  }

  async findOutboundMessageByIdempotency(
    clientId: string,
    idempotencyKey: string,
  ): Promise<OutboundMessageRecord | null> {
    return (
      this.outboundMessages.find(
        (message) =>
          message.client_id === clientId &&
          message.source_type === 'api_notification' &&
          message.idempotency_key === idempotencyKey,
      ) ?? null
    );
  }

  async countRecentAcceptedApiNotifications(
    clientId: string,
    sinceIsoTimestamp: string,
  ): Promise<number> {
    return this.outboundMessages.filter(
      (message) =>
        message.client_id === clientId &&
        message.source_type === 'api_notification' &&
        message.created_at >= sinceIsoTimestamp,
    ).length;
  }

  async countPendingApiNotifications(clientId: string): Promise<number> {
    return this.outboundMessages.filter(
      (message) =>
        message.client_id === clientId &&
        message.source_type === 'api_notification' &&
        ['queued', 'retrying'].includes(message.delivery_status),
    ).length;
  }

  async createOutboundMessage(input: {
    clientId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    recipientPhoneNumber: string;
    content: string;
    clientReference: string | null;
  }): Promise<OutboundMessageRecord> {
    const duplicate = this.outboundMessages.find(
      (message) =>
        message.client_id === input.clientId &&
        message.idempotency_key === input.idempotencyKey,
    );

    if (duplicate) {
      throw new NotificationRepositoryError('Duplicate idempotency key.', '23505');
    }

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
      created_at: FIXED_NOW.toISOString(),
      updated_at: FIXED_NOW.toISOString(),
    };

    this.outboundMessages.push(outboundMessage);
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
  } = {},
): Promise<Response> {
  const headers = new Headers();

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
    FIXED_NOW,
  );
}

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
    expect(repository.clients[0].last_used_at).toBe(FIXED_NOW.toISOString());
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

  it('deduplicates exact idempotent replays', async () => {
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
    expect(repository.outboundMessages).toHaveLength(1);
  });

  it('returns 429 when the client exceeds the per-minute request rate', async () => {
    const { apiKey, record } = createApiClient();
    record.max_requests_per_minute = 1;
    const repository = new InMemoryNotificationRepository([record]);

    repository.outboundMessages.push({
      id: 'outbound-existing',
      client_id: record.id,
      idempotency_key: 'existing-idem',
      request_fingerprint: 'existing-fingerprint',
      source_type: 'api_notification',
      source_id: buildApiNotificationSourceId(record.id, 'existing-idem'),
      ticket_id: null,
      priority: API_NOTIFICATION_PRIORITY,
      recipient_phone_number: '6281234567890',
      recipient_chat_id: null,
      content: 'Previous request',
      client_reference: null,
      delivery_status: 'queued',
      delivery_attempts: 0,
      next_retry_at: null,
      last_delivery_error: null,
      whatsapp_message_id: null,
      delivered_at: null,
      created_at: FIXED_NOW.toISOString(),
      updated_at: FIXED_NOW.toISOString(),
    });

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

    repository.outboundMessages.push({
      id: 'outbound-pending',
      client_id: record.id,
      idempotency_key: 'existing-idem',
      request_fingerprint: 'existing-fingerprint',
      source_type: 'api_notification',
      source_id: buildApiNotificationSourceId(record.id, 'existing-idem'),
      ticket_id: null,
      priority: API_NOTIFICATION_PRIORITY,
      recipient_phone_number: '6281234567890',
      recipient_chat_id: null,
      content: 'Pending request',
      client_reference: null,
      delivery_status: 'queued',
      delivery_attempts: 0,
      next_retry_at: null,
      last_delivery_error: null,
      whatsapp_message_id: null,
      delivered_at: null,
      created_at: FIXED_NOW.toISOString(),
      updated_at: FIXED_NOW.toISOString(),
    });

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

    repository.outboundMessages.push({
      id: 'outbound-replay',
      client_id: record.id,
      idempotency_key: 'idem-existing',
      request_fingerprint: createRequestFingerprint({
        recipientPhoneNumber: '6281234567890',
        message: 'Transfer successful.',
        clientReference: 'trx-123',
      }),
      source_type: 'api_notification',
      source_id: buildApiNotificationSourceId(record.id, 'idem-existing'),
      ticket_id: null,
      priority: API_NOTIFICATION_PRIORITY,
      recipient_phone_number: '6281234567890',
      recipient_chat_id: null,
      content: 'Transfer successful.',
      client_reference: 'trx-123',
      delivery_status: 'queued',
      delivery_attempts: 0,
      next_retry_at: null,
      last_delivery_error: null,
      whatsapp_message_id: null,
      delivered_at: null,
      created_at: FIXED_NOW.toISOString(),
      updated_at: FIXED_NOW.toISOString(),
    });

    const response = await sendRequest(repository, {
      apiKey,
      idempotencyKey: 'idem-existing',
    });

    expect(response.status).toBe(202);
    expect((await response.json()).idempotent_replay).toBe(true);
  });
});
