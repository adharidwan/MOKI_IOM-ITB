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

export interface CreateOutboundMessageInput {
  clientId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  recipientPhoneNumber: string;
  content: string;
  clientReference: string | null;
}

export interface NotificationRepository {
  findApiClientByKeyPrefix(keyPrefix: string): Promise<ApiClientRecord | null>;
  touchApiClientLastUsedAt(clientId: string, isoTimestamp: string): Promise<void>;
  findOutboundMessageByIdempotency(
    clientId: string,
    idempotencyKey: string,
  ): Promise<OutboundMessageRecord | null>;
  countRecentAcceptedApiNotifications(clientId: string, sinceIsoTimestamp: string): Promise<number>;
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

interface QueueWhatsappMessageResponse {
  message_id: string;
  status: 'queued';
  accepted_at: string;
  client_reference: string | null;
  idempotent_replay: boolean;
}

export async function authenticateApiClient(
  authorizationHeader: string | null,
  repository: NotificationRepository,
  now = new Date(),
): Promise<ApiClientRecord> {
  const apiKey = extractBearerToken(authorizationHeader);

  if (!apiKey) {
    throw new PublicApiError(401, 'invalid_api_key', 'Missing or invalid API key.');
  }

  const keyPrefix = extractApiKeyPrefix(apiKey);

  if (!keyPrefix) {
    throw new PublicApiError(401, 'invalid_api_key', 'Missing or invalid API key.');
  }

  const client = await repository.findApiClientByKeyPrefix(keyPrefix);

  if (!client) {
    throw new PublicApiError(401, 'invalid_api_key', 'Missing or invalid API key.');
  }

  const hashedApiKey = hashApiKey(apiKey);

  if (!safeEqual(hashedApiKey, client.key_hash)) {
    throw new PublicApiError(401, 'invalid_api_key', 'Missing or invalid API key.');
  }

  if (client.status !== 'active') {
    throw new PublicApiError(403, 'api_client_disabled', 'API client is disabled.');
  }

  await repository.touchApiClientLastUsedAt(client.id, now.toISOString());

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

  const parsedBody = parseQueueWhatsappMessagePayload(body);

  if (!parsedBody.success) {
    throw new PublicApiError(
      422,
      'invalid_request_body',
      'Request body validation failed.',
      formatZodIssues(parsedBody.error),
    );
  }

  const requestFingerprint = createRequestFingerprint(parsedBody.data);
  const existingMessage = await repository.findOutboundMessageByIdempotency(client.id, idempotencyKey);

  if (existingMessage) {
    return buildIdempotentResponse(existingMessage, requestFingerprint);
  }

  const quotaWindowStartIso = new Date(now.getTime() - 60_000).toISOString();
  const acceptedInLastMinute = await repository.countRecentAcceptedApiNotifications(
    client.id,
    quotaWindowStartIso,
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

  try {
    const queuedMessage = await repository.createOutboundMessage({
      clientId: client.id,
      idempotencyKey,
      requestFingerprint,
      recipientPhoneNumber: parsedBody.data.recipientPhoneNumber,
      content: parsedBody.data.message,
      clientReference: parsedBody.data.clientReference,
    });

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

    return buildQueueResponse(queuedMessage, false);
  } catch (error) {
    if (
      error instanceof NotificationRepositoryError &&
      error.code === '23505'
    ) {
      const duplicateMessage = await repository.findOutboundMessageByIdempotency(
        client.id,
        idempotencyKey,
      );

      if (duplicateMessage) {
        return buildIdempotentResponse(duplicateMessage, requestFingerprint);
      }
    }

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

    const client = await authenticateApiClient(
      request.headers.get('authorization'),
      repository,
      now,
    );

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

    throw error;
  }
}

function buildIdempotentResponse(
  existingMessage: OutboundMessageRecord,
  requestFingerprint: string,
): QueueWhatsappMessageResponse {
  if (existingMessage.request_fingerprint !== requestFingerprint) {
    throw new PublicApiError(
      409,
      'idempotency_conflict',
      'This Idempotency-Key has already been used for a different request payload.',
    );
  }

  return buildQueueResponse(existingMessage, true);
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
