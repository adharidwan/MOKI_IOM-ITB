import {
  API_NOTIFICATION_PRIORITY,
  ApiClientRecord,
  OutboundMessageRecord,
  createRequestFingerprint,
  extractApiKeyPrefix,
  extractBearerToken,
  formatZodIssues,
  hashApiKey,
  normalizeIdempotencyKey,
  parseQueueWhatsappMessagePayload,
  safeEqual,
} from './whatsapp-notification-utils';
import {
  API_IDEMPOTENCY_TTL_SECONDS,
  QueueWhatsappMessageResponse,
  StoredApiIdempotencyRecord,
} from './outbound-dispatch-job';

export interface CreateOutboundMessageInput {
  clientId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  recipientPhoneNumber: string;
  content: string;
  clientReference: string | null;
  acceptedAt: string;
}

export interface NotificationRepository {
  findApiClientByKeyPrefix(keyPrefix: string): Promise<ApiClientRecord | null>;
  touchApiClientLastUsedAt(clientId: string, isoTimestamp: string): Promise<void>;
  reserveApiNotificationIdempotency(
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
  >;
  completeApiNotificationIdempotency(
    clientId: string,
    idempotencyKey: string,
    requestFingerprint: string,
    response: QueueWhatsappMessageResponse,
    ttlSeconds: number,
  ): Promise<void>;
  clearApiNotificationIdempotency(
    clientId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<void>;
  countRecentAcceptedApiNotifications(clientId: string, nowMs: number): Promise<number>;
  countPendingApiNotifications(clientId: string): Promise<number>;
  createOutboundMessage(input: CreateOutboundMessageInput): Promise<OutboundMessageRecord>;
}

export class PublicApiError extends Error {
  status: number;
  code: string;
  details?: string[];

  constructor(status: number, code: string, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NotificationRepositoryError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export async function authenticateApiClient(
  authorizationHeader: string | null,
  repository: NotificationRepository,
  now = new Date(),
): Promise<ApiClientRecord> {
  const { apiKey, keyPrefix } = extractApiKeyAndPrefix(authorizationHeader);
  const client = await repository.findApiClientByKeyPrefix(keyPrefix);

  if (!client) {
    throw new PublicApiError(401, 'invalid_api_key', 'Missing or invalid API key.');
  }

  validateApiClient(apiKey, client);
  void repository.touchApiClientLastUsedAt(client.id, now.toISOString()).catch((error) => {
    console.error(
      JSON.stringify({
        event: 'api_client_usage_metadata_update_failed',
        client_id: client.id,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  });

  return client;
}

export async function queueWhatsappMessage(
  body: unknown,
  idempotencyHeader: string | null,
  client: ApiClientRecord,
  repository: NotificationRepository,
  now = new Date(),
): Promise<QueueWhatsappMessageResponse> {
  const idempotencyKey = normalizeIdempotencyKey(idempotencyHeader);

  if (!idempotencyKey) {
    throw new PublicApiError(
      422,
      'invalid_idempotency_key',
      'Missing or invalid Idempotency-Key header.',
    );
  }

  const parsedBody = parseAndFingerprintPayload(body);

  const idempotencyReservation = await repository.reserveApiNotificationIdempotency(
    client.id,
    idempotencyKey,
    parsedBody.requestFingerprint,
    API_IDEMPOTENCY_TTL_SECONDS,
  );

  if (idempotencyReservation.status === 'replay') {
    return buildStoredIdempotentResponse(idempotencyReservation.record, parsedBody.requestFingerprint);
  }

  if (idempotencyReservation.status === 'conflict') {
    throw new PublicApiError(
      409,
      'idempotency_conflict',
      'This Idempotency-Key has already been used for a different request payload.',
    );
  }

  try {
    const acceptedInLastMinute = await repository.countRecentAcceptedApiNotifications(
      client.id,
      now.getTime(),
    );

    if (acceptedInLastMinute >= client.max_requests_per_minute) {
      console.log(
        JSON.stringify({
          event: 'api_notification_throttled',
          reason: 'request_rate_limit_exceeded',
          client_id: client.id,
          max_requests_per_minute: client.max_requests_per_minute,
        }),
      );
      throw new PublicApiError(
        429,
        'request_rate_limit_exceeded',
        'API client exceeded the per-minute request limit.',
      );
    }

    const pendingMessages = await repository.countPendingApiNotifications(client.id);

    if (pendingMessages >= client.max_pending_messages) {
      console.log(
        JSON.stringify({
          event: 'api_notification_throttled',
          reason: 'pending_queue_limit_exceeded',
          client_id: client.id,
          max_pending_messages: client.max_pending_messages,
        }),
      );
      throw new PublicApiError(
        429,
        'pending_queue_limit_exceeded',
        'API client exceeded the pending outbound message limit.',
      );
    }

    const queuedMessage = await repository.createOutboundMessage({
      clientId: client.id,
      idempotencyKey,
      requestFingerprint: parsedBody.requestFingerprint,
      recipientPhoneNumber: parsedBody.recipientPhoneNumber,
      content: parsedBody.message,
      clientReference: parsedBody.clientReference,
      acceptedAt: now.toISOString(),
    });

    const responseBody = buildQueueResponse(queuedMessage, false);

    await repository.completeApiNotificationIdempotency(
      client.id,
      idempotencyKey,
      parsedBody.requestFingerprint,
      responseBody,
      API_IDEMPOTENCY_TTL_SECONDS,
    );

    console.log(
      JSON.stringify({
        event: 'api_notification_accepted',
        client_id: client.id,
        outbound_message_id: queuedMessage.id,
        source_type: queuedMessage.source_type,
        source_id: queuedMessage.source_id,
        priority: queuedMessage.priority ?? API_NOTIFICATION_PRIORITY,
      }),
    );

    return responseBody;
  } catch (error) {
    await repository.clearApiNotificationIdempotency(
      client.id,
      idempotencyKey,
      parsedBody.requestFingerprint,
    );
    throw error;
  }
}

export async function handleWhatsappNotificationRequest(
  request: Request,
  repository: NotificationRepository,
  now = new Date(),
): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type');

    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      throw new PublicApiError(
        415,
        'unsupported_media_type',
        'Content-Type must be application/json.',
      );
    }

    const client = await authenticateApiClient(request.headers.get('authorization'), repository, now);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new PublicApiError(422, 'invalid_json', 'Request body must be valid JSON.');
    }

    const responseBody = await queueWhatsappMessage(
      body,
      request.headers.get('idempotency-key'),
      client,
      repository,
      now,
    );
    return Response.json(responseBody, { status: 202 });
  } catch (error) {
    if (error instanceof PublicApiError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details ?? [],
          },
        },
        { status: error.status },
      );
    }

    if (error instanceof NotificationRepositoryError && error.code === 'no_eligible_whatsapp_instance') {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: [],
          },
        },
        { status: 503 },
      );
    }

    throw error;
  }
}

function extractApiKeyAndPrefix(
  authorizationHeader: string | null,
): { apiKey: string; keyPrefix: string } {
  const apiKey = extractBearerToken(authorizationHeader);

  if (!apiKey) {
    throw new PublicApiError(401, 'invalid_api_key', 'Missing or invalid API key.');
  }

  const keyPrefix = extractApiKeyPrefix(apiKey);

  if (!keyPrefix) {
    throw new PublicApiError(401, 'invalid_api_key', 'Missing or invalid API key.');
  }

  return { apiKey, keyPrefix };
}

function validateApiClient(apiKey: string, client: ApiClientRecord): void {
  const hashedApiKey = hashApiKey(apiKey);

  if (!safeEqual(hashedApiKey, client.key_hash)) {
    throw new PublicApiError(401, 'invalid_api_key', 'Missing or invalid API key.');
  }

  if (client.status !== 'active') {
    throw new PublicApiError(403, 'api_client_disabled', 'API client is disabled.');
  }
}

function parseAndFingerprintPayload(body: unknown): {
  recipientPhoneNumber: string;
  message: string;
  clientReference: string | null;
  requestFingerprint: string;
} {
  const parsedBody = parseQueueWhatsappMessagePayload(body);

  if (!parsedBody.success) {
    throw new PublicApiError(
      422,
      'invalid_request_body',
      'Request body validation failed.',
      formatZodIssues(parsedBody.error),
    );
  }

  return {
    recipientPhoneNumber: parsedBody.data.recipientPhoneNumber,
    message: parsedBody.data.message,
    clientReference: parsedBody.data.clientReference,
    requestFingerprint: createRequestFingerprint(parsedBody.data),
  };
}

function buildStoredIdempotentResponse(
  record: StoredApiIdempotencyRecord,
  requestFingerprint: string,
): QueueWhatsappMessageResponse {
  if (record.request_fingerprint !== requestFingerprint || !record.response) {
    throw new PublicApiError(
      409,
      'idempotency_conflict',
      'This Idempotency-Key has already been used for a different request payload.',
    );
  }

  return {
    ...record.response,
    idempotent_replay: true,
  };
}

function buildQueueResponse(
  outboundMessage: OutboundMessageRecord,
  idempotentReplay: boolean,
): QueueWhatsappMessageResponse {
  return {
    message_id: outboundMessage.id,
    status: 'queued',
    accepted_at: outboundMessage.created_at,
    client_reference: outboundMessage.client_reference,
    idempotent_replay: idempotentReplay,
  };
}
