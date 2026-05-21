import 'server-only';

import crypto from 'node:crypto';

import { sql } from 'drizzle-orm';

import type { BlastMediaInput } from './blast-media';
import type { TicketMediaInput } from './ticket-media';
import { db } from './db/client';
import { enqueueOutboundDispatchJob, getOutboundDispatchQueue } from './outbound-dispatch-queue';
import {
  cacheApiClientByKeyPrefix,
  clearApiNotificationIdempotency,
  completeApiNotificationIdempotency,
  countRecentAcceptedApiNotifications as countRecentAcceptedApiNotificationsInRedis,
  decrementPendingOutboundCounts,
  getCachedApiClientByKeyPrefix,
  getPendingApiNotificationCount,
  getPendingOutboundMessageCountBySource,
  incrementPendingOutboundCounts,
  recordAcceptedApiNotification,
  reserveApiNotificationIdempotency,
} from './outbound-dispatch-redis';
import { buildOutboundDispatchJobData } from './outbound-dispatch-job';
import { readWhatsappInstanceRuntime, WHATSAPP_RUNTIME_TTL_SECONDS } from './whatsapp-ops-runtime';
import {
  API_NOTIFICATION_PRIORITY,
  BLAST_PRIORITY,
  ApiClientRecord,
  DEFAULT_WHATSAPP_INSTANCE_ID,
  DEFAULT_WHATSAPP_INSTANCE_LABEL,
  DEFAULT_DISPATCH_SETTINGS_ID,
  DEFAULT_GLOBAL_MESSAGES_PER_MINUTE,
  DispatchSettingsRecord,
  OutboundMessageRecord,
  OutboundMessageSourceType,
  TICKET_REPLY_PRIORITY,
  WhatsappInstanceRecord,
  buildApiNotificationSourceId,
} from './whatsapp-notification-utils';
import {
  CreateOutboundMessageInput,
  NotificationRepository,
  NotificationRepositoryError,
} from './whatsapp-notification-service';

type PgErrorLike = {
  code?: string;
  message?: string;
};

export interface UpdateDispatchSettingsInput {
  global_messages_per_minute?: number;
  api_notifications_paused?: boolean;
}

export interface CreateTicketReplyOutboundMessageInput {
  replyId: string;
  ticketId: string;
  whatsappInstanceId: string;
  recipientPhoneNumber: string | null;
  recipientChatId: string;
  content: string;
  media?: TicketMediaInput | null;
}

export interface CreateGroupBlastOutboundMessagesInput {
  groupNames: string[];
  content: string;
}

export interface CreateDirectBlastOutboundMessagesInput {
  recipientPhoneNumbers: string[];
  content: string;
  media?: BlastMediaInput | null;
}

export interface CreatePersonalizedBlastOutboundMessagesInput {
  recipients: Array<{
    recipientPhoneNumber: string;
    content: string;
  }>;
  media?: BlastMediaInput | null;
}

export interface BlastDispatchResult {
  batchId: string;
  totalRecipients: number;
  acceptedCount: number;
  queuedCount: number;
  alreadyAcceptedCount: number;
  failedCount: number;
  trackedMessageIds: string[];
}

interface EligibleWhatsappInstance {
  id: string;
  queuedCount: number;
}

function normalizeList(values: string[] | null | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  (values || []).forEach((value) => {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      return;
    }

    const dedupeKey = normalizedValue.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    normalized.push(normalizedValue);
  });

  return normalized;
}

function normalizePhoneNumbers(phoneNumbers: string[]): string[] {
  return Array.from(
    new Set(
      phoneNumbers
        .map((phoneNumber) => String(phoneNumber || '').replace(/\D/g, '').trim())
        .filter((phoneNumber) => phoneNumber.length > 0),
    ),
  );
}

function normalizeMediaKey(media?: BlastMediaInput | null) {
  return media
    ? {
        bucket: media.bucket,
        path: media.path,
        mimeType: media.mimeType,
        fileName: media.fileName,
      }
    : null;
}

function buildBlastRequestId(content: string, recipientKeys: string[], media?: BlastMediaInput | null): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        content: content.trim(),
        media: normalizeMediaKey(media),
        recipients: normalizeList(recipientKeys).sort((left, right) => left.localeCompare(right)),
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

function buildPersonalizedBlastRequestId(
  recipients: Array<{ recipientPhoneNumber: string; content: string }>,
  media?: BlastMediaInput | null,
): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        recipients: recipients
          .map((recipient) => ({
            recipientPhoneNumber: String(recipient.recipientPhoneNumber || '').replace(/\D/g, '').trim(),
            content: String(recipient.content || '').trim(),
          }))
          .filter((recipient) => recipient.recipientPhoneNumber && (recipient.content || media))
          .sort((left, right) => left.recipientPhoneNumber.localeCompare(right.recipientPhoneNumber)),
        media: normalizeMediaKey(media),
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

function buildBlastSourceId(requestId: string, recipientPhoneNumber: string): string {
  return `blast:${requestId}:${recipientPhoneNumber}`;
}

function rowsFromResult<T>(result: { rows?: unknown[] }): T[] {
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}

function firstRowFromResult<T>(result: { rows?: unknown[] }): T | null {
  return rowsFromResult<T>(result)[0] ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as PgErrorLike).code === '23505';
}

async function loadBlastOutboundMessageBySourceId(
  sourceId: string,
): Promise<OutboundMessageRecord | null> {
  const result = await db.execute(sql`
    select *
    from public.outbound_messages
    where source_type = 'blast'
      and source_id = ${sourceId}
    limit 1
  `);

  return firstRowFromResult<OutboundMessageRecord>(result);
}

async function markOutboundMessageAsQueued(
  outboundMessageId: string,
): Promise<void> {
  await db.execute(sql`
    update public.outbound_messages
    set
      delivery_status = 'queued',
      next_retry_at = null,
      last_delivery_error = null,
      updated_at = ${new Date().toISOString()}
    where id = ${outboundMessageId}
  `);
}

async function createOrReuseBlastOutboundMessage(
  input: {
    requestId: string;
    recipientPhoneNumber: string;
    content: string;
    whatsappInstanceId: string;
    media?: BlastMediaInput | null;
  },
): Promise<{
  outboundMessage: OutboundMessageRecord;
  shouldEnqueue: boolean;
  alreadyAccepted: boolean;
}> {
  const now = new Date().toISOString();
  const outboundMessage: OutboundMessageRecord = {
    id: crypto.randomUUID(),
    client_id: null,
    idempotency_key: null,
    request_fingerprint: null,
    source_type: 'blast',
    source_id: buildBlastSourceId(input.requestId, input.recipientPhoneNumber),
    ticket_id: null,
    whatsapp_instance_id: input.whatsappInstanceId,
    priority: BLAST_PRIORITY,
    recipient_phone_number: input.recipientPhoneNumber,
    recipient_chat_id: null,
    content: input.content,
    media_bucket: input.media?.bucket || null,
    media_path: input.media?.path || null,
    media_mime_type: input.media?.mimeType || null,
    media_file_name: input.media?.fileName || null,
    client_reference: null,
    delivery_status: 'queued',
    delivery_attempts: 0,
    next_retry_at: null,
    last_delivery_error: null,
    whatsapp_message_id: null,
    delivered_at: null,
    created_at: now,
    updated_at: now,
  };

  try {
    const data = await insertOutboundMessage(outboundMessage);
    return {
      outboundMessage: data,
      shouldEnqueue: true,
      alreadyAccepted: false,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw toRepositoryError('Failed to write blast delivery ledger entry.', error);
    }

    const existingMessage = await loadBlastOutboundMessageBySourceId(outboundMessage.source_id);

    if (!existingMessage) {
      throw new NotificationRepositoryError(
        'Blast delivery ledger entry already exists but could not be reloaded.',
        getErrorCode(error),
      );
    }

    if (existingMessage.delivery_status === 'failed' && existingMessage.delivery_attempts === 0) {
      await markOutboundMessageAsQueued(existingMessage.id);
      return {
        outboundMessage: {
          ...existingMessage,
          delivery_status: 'queued',
          next_retry_at: null,
          last_delivery_error: null,
          updated_at: new Date().toISOString(),
        },
        shouldEnqueue: true,
        alreadyAccepted: false,
      };
    }

    return {
      outboundMessage: existingMessage,
      shouldEnqueue: false,
      alreadyAccepted: true,
    };
  }
}

function isRuntimeHeartbeatStale(lastHeartbeatAt: string | null, nowMs = Date.now()): boolean {
  if (!lastHeartbeatAt) {
    return true;
  }

  const lastHeartbeatMs = Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(lastHeartbeatMs)) {
    return true;
  }

  return nowMs - lastHeartbeatMs > WHATSAPP_RUNTIME_TTL_SECONDS * 1000;
}

async function insertOutboundMessage(outboundMessage: OutboundMessageRecord): Promise<OutboundMessageRecord> {
  const result = await db.execute(sql`
    insert into public.outbound_messages (
      id,
      client_id,
      idempotency_key,
      request_fingerprint,
      source_type,
      source_id,
      ticket_id,
      whatsapp_instance_id,
      priority,
      recipient_phone_number,
      recipient_chat_id,
      content,
      media_bucket,
      media_path,
      media_mime_type,
      media_file_name,
      client_reference,
      delivery_status,
      delivery_attempts,
      next_retry_at,
      last_delivery_error,
      whatsapp_message_id,
      delivered_at,
      created_at,
      updated_at
    )
    values (
      ${outboundMessage.id},
      ${outboundMessage.client_id},
      ${outboundMessage.idempotency_key},
      ${outboundMessage.request_fingerprint},
      ${outboundMessage.source_type},
      ${outboundMessage.source_id},
      ${outboundMessage.ticket_id},
      ${outboundMessage.whatsapp_instance_id},
      ${outboundMessage.priority},
      ${outboundMessage.recipient_phone_number},
      ${outboundMessage.recipient_chat_id},
      ${outboundMessage.content},
      ${outboundMessage.media_bucket},
      ${outboundMessage.media_path},
      ${outboundMessage.media_mime_type},
      ${outboundMessage.media_file_name},
      ${outboundMessage.client_reference},
      ${outboundMessage.delivery_status},
      ${outboundMessage.delivery_attempts},
      ${outboundMessage.next_retry_at},
      ${outboundMessage.last_delivery_error},
      ${outboundMessage.whatsapp_message_id},
      ${outboundMessage.delivered_at},
      ${outboundMessage.created_at},
      ${outboundMessage.updated_at}
    )
    returning *
  `);

  const row = firstRowFromResult<OutboundMessageRecord>(result);
  if (!row) {
    throw new NotificationRepositoryError('Failed to write outbound delivery ledger entry.');
  }

  return row;
}

async function countQueuedOutboundMessagesForInstance(
  whatsappInstanceId: string,
): Promise<number> {
  const result = await db.execute(sql`
    select count(*)::integer as count
    from public.outbound_messages
    where whatsapp_instance_id = ${whatsappInstanceId}
      and delivery_status = any(${['queued', 'retrying']}::text[])
  `);

  return Number(firstRowFromResult<{ count: number }>(result)?.count || 0);
}

async function listEligibleWhatsappInstances(): Promise<EligibleWhatsappInstance[]> {
  const result = await db.execute(sql`
    select *
    from public.whatsapp_instances
    where is_enabled = true
    order by id asc
  `);
  const instances = rowsFromResult<WhatsappInstanceRecord>(result);
  const eligibleInstances = await Promise.all(
    instances.map(async (instance) => {
      const runtime = await readWhatsappInstanceRuntime(instance.id);

      if (
        !runtime ||
        runtime.status !== 'ready' ||
        runtime.has_worker_conflict ||
        isRuntimeHeartbeatStale(runtime.last_heartbeat_at)
      ) {
        return null;
      }

      return {
        id: instance.id,
        queuedCount: await countQueuedOutboundMessagesForInstance(instance.id),
      };
    }),
  );

  return eligibleInstances
    .filter((instance): instance is EligibleWhatsappInstance => Boolean(instance))
    .sort((left, right) => {
      if (left.queuedCount !== right.queuedCount) {
        return left.queuedCount - right.queuedCount;
      }

      return left.id.localeCompare(right.id);
    });
}

async function selectWhatsappInstanceForOutbound(): Promise<string> {
  const eligibleInstances = await listEligibleWhatsappInstances();

  if (!eligibleInstances.length) {
    throw new NotificationRepositoryError(
      'No ready enabled WhatsApp instance is available.',
      'no_eligible_whatsapp_instance',
    );
  }

  return eligibleInstances[0].id;
}

async function dispatchBlastMessages(
  recipientPhoneNumbers: string[],
  content: string,
  requestId: string,
  media?: BlastMediaInput | null,
): Promise<BlastDispatchResult> {
  return dispatchPersonalizedBlastMessages(
    normalizePhoneNumbers(recipientPhoneNumbers).map((recipientPhoneNumber) => ({
      recipientPhoneNumber,
      content,
    })),
    requestId,
    media,
  );
}

async function dispatchPersonalizedBlastMessages(
  recipients: Array<{ recipientPhoneNumber: string; content: string }>,
  requestId: string,
  media?: BlastMediaInput | null,
): Promise<BlastDispatchResult> {
  const normalizedRecipients = Array.from(
    recipients.reduce((deduped, recipient) => {
      const normalizedPhoneNumber = String(recipient.recipientPhoneNumber || '').replace(/\D/g, '').trim();
      const normalizedContent = String(recipient.content || '').trim();

      if (!normalizedPhoneNumber || (!normalizedContent && !media)) {
        return deduped;
      }

      deduped.set(normalizedPhoneNumber, {
        recipientPhoneNumber: normalizedPhoneNumber,
        content: normalizedContent,
      });
      return deduped;
    }, new Map<string, { recipientPhoneNumber: string; content: string }>()),
  ).map(([, value]) => value);

  if (!normalizedRecipients.length) {
    return {
      batchId: requestId,
      totalRecipients: 0,
      acceptedCount: 0,
      queuedCount: 0,
      alreadyAcceptedCount: 0,
      failedCount: 0,
      trackedMessageIds: [],
    };
  }

  let queuedCount = 0;
  let alreadyAcceptedCount = 0;
  let failedCount = 0;
  const trackedMessageIds: string[] = [];
  const eligibleInstances = await listEligibleWhatsappInstances();

  if (!eligibleInstances.length) {
    throw new NotificationRepositoryError(
      'No ready enabled WhatsApp instance is available.',
      'no_eligible_whatsapp_instance',
    );
  }

  for (const [index, recipient] of normalizedRecipients.entries()) {
    const whatsappInstanceId = eligibleInstances[index % eligibleInstances.length].id;
    const { outboundMessage, shouldEnqueue, alreadyAccepted } =
      await createOrReuseBlastOutboundMessage({
        requestId,
        recipientPhoneNumber: recipient.recipientPhoneNumber,
        content: recipient.content,
        whatsappInstanceId,
        media,
      });

    trackedMessageIds.push(outboundMessage.id);

    if (alreadyAccepted) {
      alreadyAcceptedCount += 1;
      continue;
    }

    if (!shouldEnqueue) {
      failedCount += 1;
      continue;
    }

    try {
      await enqueueOutboundDispatchJob(buildOutboundDispatchJobData(outboundMessage));
      await incrementPendingOutboundCounts(outboundMessage.source_type, outboundMessage.client_id);
      queuedCount += 1;
    } catch (queueError) {
      await markOutboundMessageAsFailed(
        outboundMessage.id,
        summarizeOperationalQueueError(queueError),
      );
      failedCount += 1;
    }
  }

  return {
    batchId: requestId,
    totalRecipients: normalizedRecipients.length,
    acceptedCount: queuedCount + alreadyAcceptedCount,
    queuedCount,
    alreadyAcceptedCount,
    failedCount,
    trackedMessageIds,
  };
}

export function createSupabaseNotificationRepository(): NotificationRepository {
  return {
    async findApiClientByKeyPrefix(keyPrefix: string): Promise<ApiClientRecord | null> {
      const cachedClient = await getCachedApiClientByKeyPrefix(keyPrefix);

      if (cachedClient) {
        return cachedClient;
      }

      const result = await db.execute(sql`
        select *
        from public.api_clients
        where key_prefix = ${keyPrefix}
        limit 1
      `);
      const apiClient = firstRowFromResult<ApiClientRecord>(result);

      if (apiClient) {
        void cacheApiClientByKeyPrefix(apiClient);
      }

      return apiClient;
    },

    async touchApiClientLastUsedAt(clientId: string, isoTimestamp: string): Promise<void> {
      await db.execute(sql`
        update public.api_clients
        set last_used_at = ${isoTimestamp}, updated_at = ${isoTimestamp}
        where id = ${clientId}
      `);
    },

    reserveApiNotificationIdempotency,
    completeApiNotificationIdempotency,
    clearApiNotificationIdempotency,

    async countRecentAcceptedApiNotifications(clientId: string, nowMs: number): Promise<number> {
      return countRecentAcceptedApiNotificationsInRedis(clientId, nowMs);
    },

    async countPendingApiNotifications(clientId: string): Promise<number> {
      return getPendingApiNotificationCount(clientId);
    },

    async createOutboundMessage(
      input: CreateOutboundMessageInput,
    ): Promise<OutboundMessageRecord> {
      await getOrCreateDefaultWhatsappInstance();
      const whatsappInstanceId = await selectWhatsappInstanceForOutbound();
      const outboundMessage: OutboundMessageRecord = {
        id: crypto.randomUUID(),
        client_id: input.clientId,
        idempotency_key: input.idempotencyKey,
        request_fingerprint: input.requestFingerprint,
        source_type: 'api_notification',
        source_id: buildApiNotificationSourceId(input.clientId, input.idempotencyKey),
        ticket_id: null,
        whatsapp_instance_id: whatsappInstanceId,
        priority: API_NOTIFICATION_PRIORITY,
        recipient_phone_number: input.recipientPhoneNumber,
        recipient_chat_id: null,
        content: input.content,
        media_bucket: null,
        media_path: null,
        media_mime_type: null,
        media_file_name: null,
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

      await insertOutboundMessage(outboundMessage);

      try {
        await enqueueOutboundDispatchJob(buildOutboundDispatchJobData(outboundMessage));
        await incrementPendingOutboundCounts(outboundMessage.source_type, outboundMessage.client_id);
        await recordAcceptedApiNotification(outboundMessage.client_id!, input.acceptedAt);
      } catch (queueError) {
        await markOutboundMessageAsFailed(
          outboundMessage.id,
          summarizeOperationalQueueError(queueError),
        );

        throw toOperationalRepositoryError('Failed to queue outbound message.', queueError);
      }

      return outboundMessage;
    },
  };
}

export async function createGroupBlastOutboundMessages(
  input: CreateGroupBlastOutboundMessagesInput,
): Promise<BlastDispatchResult> {
  const targetGroups = normalizeList(input.groupNames);

  if (!targetGroups.length) {
    return {
      batchId: 'empty',
      totalRecipients: 0,
      acceptedCount: 0,
      queuedCount: 0,
      alreadyAcceptedCount: 0,
      failedCount: 0,
      trackedMessageIds: [],
    };
  }

  const result = await db.execute(sql`
    select *
    from public.resolve_csv_contact_group_recipients(
      ${targetGroups}::text[],
      null,
      'created_at'
    )
  `);

  const recipientPhoneNumbers = rowsFromResult<{ no_telp?: unknown }>(result).map((record) =>
    String(record.no_telp || '').trim(),
  );

  return dispatchBlastMessages(
    recipientPhoneNumbers,
    input.content,
    buildBlastRequestId(input.content, targetGroups.map((groupName) => `group:${groupName}`)),
  );
}

export async function createDirectBlastOutboundMessages(
  input: CreateDirectBlastOutboundMessagesInput,
): Promise<BlastDispatchResult> {
  const normalizedPhoneNumbers = normalizePhoneNumbers(input.recipientPhoneNumbers);

  return dispatchBlastMessages(
    normalizedPhoneNumbers,
    input.content,
    buildBlastRequestId(input.content, normalizedPhoneNumbers, input.media),
    input.media,
  );
}

export async function createPersonalizedBlastOutboundMessages(
  input: CreatePersonalizedBlastOutboundMessagesInput,
): Promise<BlastDispatchResult> {
  const normalizedRecipients = input.recipients
    .map((recipient) => ({
      recipientPhoneNumber: String(recipient.recipientPhoneNumber || '').replace(/\D/g, '').trim(),
      content: String(recipient.content || '').trim(),
    }))
    .filter((recipient) => recipient.recipientPhoneNumber && (recipient.content || input.media));

  return dispatchPersonalizedBlastMessages(
    normalizedRecipients,
    buildPersonalizedBlastRequestId(normalizedRecipients, input.media),
    input.media,
  );
}

export async function createTicketReplyOutboundMessage(
  input: CreateTicketReplyOutboundMessageInput,
): Promise<OutboundMessageRecord> {
  await getOrCreateDefaultWhatsappInstance();
  const now = new Date().toISOString();
  const media = input.media || null;
  const outboundMessage = await insertOutboundMessage({
    id: crypto.randomUUID(),
    client_id: null,
    idempotency_key: null,
    request_fingerprint: null,
    source_type: 'ticket_reply',
    source_id: input.replyId,
    ticket_id: input.ticketId,
    whatsapp_instance_id: input.whatsappInstanceId,
    priority: TICKET_REPLY_PRIORITY,
    recipient_phone_number: input.recipientPhoneNumber || '',
    recipient_chat_id: input.recipientChatId,
    content: input.content,
    media_bucket: media?.bucket || null,
    media_path: media?.path || null,
    media_mime_type: media?.mimeType || null,
    media_file_name: media?.fileName || null,
    client_reference: null,
    delivery_status: 'queued',
    delivery_attempts: 0,
    next_retry_at: null,
    last_delivery_error: null,
    whatsapp_message_id: null,
    delivered_at: null,
    created_at: now,
    updated_at: now,
  });

  try {
    await enqueueOutboundDispatchJob(buildOutboundDispatchJobData(outboundMessage));
    await incrementPendingOutboundCounts(outboundMessage.source_type, outboundMessage.client_id);
  } catch (queueError) {
    await markOutboundMessageAsFailed(
      outboundMessage.id,
      summarizeOperationalQueueError(queueError),
    );

    throw toOperationalRepositoryError(
      'Failed to queue ticket reply outbound message.',
      queueError,
    );
  }

  return outboundMessage;
}

export async function getDispatchSettings(): Promise<DispatchSettingsRecord> {
  const result = await db.execute(sql`
    select *
    from public.bot_dispatch_settings
    where id = ${DEFAULT_DISPATCH_SETTINGS_ID}
    limit 1
  `);
  const data = firstRowFromResult<DispatchSettingsRecord>(result);

  if (data) {
    return data as DispatchSettingsRecord;
  }

  return upsertDefaultDispatchSettings();
}

export async function updateDispatchSettings(
  patch: UpdateDispatchSettingsInput,
): Promise<DispatchSettingsRecord> {
  const current = await getDispatchSettings();
  const now = new Date().toISOString();
  const result = await db.execute(sql`
    insert into public.bot_dispatch_settings (
      id,
      global_messages_per_minute,
      api_notifications_paused,
      updated_at
    )
    values (
      ${DEFAULT_DISPATCH_SETTINGS_ID},
      ${patch.global_messages_per_minute ?? current.global_messages_per_minute},
      ${patch.api_notifications_paused ?? current.api_notifications_paused},
      ${now}
    )
    on conflict (id) do update
    set
      global_messages_per_minute = excluded.global_messages_per_minute,
      api_notifications_paused = excluded.api_notifications_paused,
      updated_at = excluded.updated_at
    returning *
  `);

  return firstRowFromResult<DispatchSettingsRecord>(result)!;
}

export async function countQueuedOutboundMessagesBySource(
  sourceType: OutboundMessageSourceType,
): Promise<number> {
  return getPendingOutboundMessageCountBySource(sourceType);
}

export async function getOrCreateDefaultWhatsappInstance(): Promise<WhatsappInstanceRecord> {
  const now = new Date().toISOString();
  const result = await db.execute(sql`
    insert into public.whatsapp_instances (
      id,
      label,
      status,
      updated_at
    )
    values (
      ${DEFAULT_WHATSAPP_INSTANCE_ID},
      ${DEFAULT_WHATSAPP_INSTANCE_LABEL},
      'starting',
      ${now}
    )
    on conflict (id) do update
    set
      label = excluded.label,
      updated_at = excluded.updated_at
    returning *
  `);

  return firstRowFromResult<WhatsappInstanceRecord>(result)!;
}

export async function releasePendingOutboundMessageCounts(
  sourceType: OutboundMessageSourceType,
  clientId: string | null,
): Promise<void> {
  await decrementPendingOutboundCounts(sourceType, clientId);
}

async function markOutboundMessageAsFailed(outboundMessageId: string, errorMessage: string): Promise<void> {
  await db.execute(sql`
    update public.outbound_messages
    set
      delivery_status = 'failed',
      delivery_attempts = 0,
      next_retry_at = null,
      last_delivery_error = ${errorMessage},
      updated_at = ${new Date().toISOString()}
    where id = ${outboundMessageId}
  `);
}

function summarizeOperationalQueueError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? (error as PgErrorLike).code : undefined;
}

function toRepositoryError(message: string, error: unknown): NotificationRepositoryError {
  const suffix = error instanceof Error ? error.message : String(error);
  return new NotificationRepositoryError(`${message} ${suffix}`, getErrorCode(error));
}

function toOperationalRepositoryError(
  message: string,
  error: unknown,
): NotificationRepositoryError {
  const suffix = error instanceof Error ? error.message : String(error);
  return new NotificationRepositoryError(`${message} ${suffix}`);
}

async function upsertDefaultDispatchSettings(): Promise<DispatchSettingsRecord> {
  const now = new Date().toISOString();
  const result = await db.execute(sql`
    insert into public.bot_dispatch_settings (
      id,
      global_messages_per_minute,
      api_notifications_paused,
      updated_at
    )
    values (
      ${DEFAULT_DISPATCH_SETTINGS_ID},
      ${DEFAULT_GLOBAL_MESSAGES_PER_MINUTE},
      false,
      ${now}
    )
    on conflict (id) do update
    set updated_at = excluded.updated_at
    returning *
  `);

  return firstRowFromResult<DispatchSettingsRecord>(result)!;
}

export async function closeOutboundDispatchQueue(): Promise<void> {
  await getOutboundDispatchQueue().close();
}
