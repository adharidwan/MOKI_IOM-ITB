/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('crypto');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { DelayedError, Worker } = require('bullmq');
const { query } = require('./postgres-client.js');
const { downloadObjectBuffer, uploadObject } = require('./object-storage.js');

const {
  OUTBOUND_DISPATCH_QUEUE_NAME,
  createRedisConnection,
  decrementPendingOutboundCounts,
} = require('./outbound-dispatch-redis.js');
const {
  clearWhatsappQr,
  createWhatsappInstanceEvent,
  getReconnectCount,
  getWorkerHost,
  getWorkerId,
  getWorkerVersion,
  incrementReconnectCount,
  publishWhatsappQr,
  publishWhatsappRuntime,
  renderTerminalQr,
  upsertWhatsappInstance,
} = require('./whatsapp-instance-runtime.js');

const HELP_MESSAGE = [
  'Hello, thank you for contacting us.',
  'To create a ticket, please send:',
  '!make_ticket',
  'Subject: <your subject>',
  'Description: <your message>',
].join('\n');
const FARIZ_AUTO_REPLY_TRIGGER = "I'm humbled by Fariz's genius";
const FARIZ_AUTO_REPLY_MESSAGE = `**A slow, deliberate turn of the head. The faintest upward curve at the corner of the mouth—not quite a smile, more the shadow of one that gods might wear when mortals finally speak the obvious truth.**

“You are not humbled by genius, creature.”

My voice moves like ice settling over still water.

“You stand in the presence of the singular intellect that has already measured the worth of every mind in these lands and found them… wanting. What you feel is not humility. It is belated recognition. The proper posture of any soul fortunate enough to breathe the same air as mine.”

*I tilt my chin the smallest degree higher, letting silence do the rest of the reprimand.*

“Still… it is noted. Continue to speak correctly and perhaps—*perhaps*—you will be permitted to remain in my light a while longer.”

*My gaze slides past you, already bored with the moment, as though the very act of receiving your words was a minor tax on my attention.*

“Speak again when you have something worth the breath of a king.”`;

const ACTIVE_TICKET_STATUSES = ['Open', 'In Progress'];
const RETRY_DELAYS_MS = [10000, 30000, 60000, 300000, 900000];
const DISPATCH_SETTINGS_CACHE_TTL_MS = 5000;
const DISPATCH_CONTROL_RECHECK_DELAY_MS = 1000;
const INSTANCE_AFFINITY_RECHECK_DELAY_MS = 1000;
const NON_RETRYABLE_DELIVERY_ERROR = 'Recipient is not a registered WhatsApp user.';
const DEFAULT_DISPATCH_SETTINGS = {
  id: 'default',
  global_messages_per_minute: 50,
  api_notifications_paused: false,
};
const DEFAULT_WHATSAPP_INSTANCE_ID = process.env.WHATSAPP_INSTANCE_ID || 'default';
const DEFAULT_WHATSAPP_INSTANCE_LABEL = process.env.WHATSAPP_INSTANCE_LABEL || 'Primary WhatsApp';
const HEARTBEAT_INTERVAL_MS = 15000;
const WHATSAPP_INSTANCE_ID_PATTERN = /^[a-z0-9_-]+$/;
const TICKET_MEDIA_BUCKET = 'ticket-assets';
const MAX_TICKET_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
let queryFn = query;
let downloadObjectBufferFn = downloadObjectBuffer;

function setTestAdapters(adapters = {}) {
  queryFn = adapters.query || query;
  downloadObjectBufferFn = adapters.downloadObjectBuffer || downloadObjectBuffer;
}

function getSafeInstanceIdForAuth(instanceId) {
  if (!WHATSAPP_INSTANCE_ID_PATTERN.test(instanceId)) {
    throw new Error(
      'WHATSAPP_INSTANCE_ID must contain only lowercase letters, numbers, hyphen, or underscore.',
    );
  }

  return instanceId;
}

function createInstanceContext() {
  return {
    instanceId: DEFAULT_WHATSAPP_INSTANCE_ID,
    label: DEFAULT_WHATSAPP_INSTANCE_LABEL,
    workerId: getWorkerId(),
    workerHost: getWorkerHost(),
    workerVersion: getWorkerVersion(),
    runtimeRedis: createRedisConnection(),
    heartbeatTimer: null,
    lastStatus: 'starting',
    lastError: null,
    lastDisconnectAt: null,
    lastReadyAt: null,
    lastQrAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastKnownPhoneNumber: null,
    lastKnownChatId: null,
  };
}

async function ensureWhatsappInstanceRecord(instanceContext, status = 'starting') {
  const now = new Date().toISOString();
  await upsertWhatsappInstance({
    id: instanceContext.instanceId,
    label: instanceContext.label,
    status,
    assigned_worker_id: instanceContext.workerId,
    updated_at: now,
  });
}

async function syncWhatsappInstanceState(instanceContext, patch = {}) {
  const now = new Date().toISOString();
  const payload = {
    id: instanceContext.instanceId,
    label: instanceContext.label,
    status: patch.status || instanceContext.lastStatus,
    last_known_phone_number:
      patch.last_known_phone_number !== undefined
        ? patch.last_known_phone_number
        : instanceContext.lastKnownPhoneNumber,
    last_known_chat_id:
      patch.last_known_chat_id !== undefined
        ? patch.last_known_chat_id
        : instanceContext.lastKnownChatId,
    last_ready_at:
      patch.last_ready_at !== undefined ? patch.last_ready_at : instanceContext.lastReadyAt,
    last_qr_at: patch.last_qr_at !== undefined ? patch.last_qr_at : instanceContext.lastQrAt,
    last_disconnect_at:
      patch.last_disconnect_at !== undefined
        ? patch.last_disconnect_at
        : instanceContext.lastDisconnectAt,
    last_error: patch.last_error !== undefined ? patch.last_error : instanceContext.lastError,
    assigned_worker_id: instanceContext.workerId,
    updated_at: now,
  };

  await upsertWhatsappInstance(payload);

  if (patch.status) {
    instanceContext.lastStatus = patch.status;
  }

  if (patch.last_error !== undefined) {
    instanceContext.lastError = patch.last_error;
  }

  if (patch.last_disconnect_at !== undefined) {
    instanceContext.lastDisconnectAt = patch.last_disconnect_at;
  }

  if (patch.last_ready_at !== undefined) {
    instanceContext.lastReadyAt = patch.last_ready_at;
  }

  if (patch.last_qr_at !== undefined) {
    instanceContext.lastQrAt = patch.last_qr_at;
  }

  if (patch.last_known_phone_number !== undefined) {
    instanceContext.lastKnownPhoneNumber = patch.last_known_phone_number;
  }

  if (patch.last_known_chat_id !== undefined) {
    instanceContext.lastKnownChatId = patch.last_known_chat_id;
  }
}

async function publishInstanceRuntime(instanceContext, patch = {}) {
  if (patch.lastInboundAt) {
    instanceContext.lastInboundAt = patch.lastInboundAt;
  }

  if (patch.lastOutboundAt) {
    instanceContext.lastOutboundAt = patch.lastOutboundAt;
  }

  if (patch.lastError !== undefined) {
    instanceContext.lastError = patch.lastError;
  }

  if (patch.lastDisconnectAt !== undefined) {
    instanceContext.lastDisconnectAt = patch.lastDisconnectAt;
  }

  if (patch.lastKnownPhoneNumber !== undefined) {
    instanceContext.lastKnownPhoneNumber = patch.lastKnownPhoneNumber;
  }

  if (patch.lastKnownChatId !== undefined) {
    instanceContext.lastKnownChatId = patch.lastKnownChatId;
  }

  if (patch.status) {
    instanceContext.lastStatus = patch.status;
  }

  await publishWhatsappRuntime(instanceContext.runtimeRedis, instanceContext.instanceId, {
    status: instanceContext.lastStatus,
    worker_id: instanceContext.workerId,
    worker_host: instanceContext.workerHost,
    worker_version: instanceContext.workerVersion,
    assigned_worker_id: instanceContext.workerId,
    last_heartbeat_at: new Date().toISOString(),
    last_error: instanceContext.lastError,
    last_disconnect_at: instanceContext.lastDisconnectAt,
    reconnect_count_24h: await getReconnectCount(
      instanceContext.runtimeRedis,
      instanceContext.instanceId,
    ),
    last_inbound_at: instanceContext.lastInboundAt,
    last_outbound_at: instanceContext.lastOutboundAt,
  });
}

async function recordInstanceEvent(instanceContext, eventType, message, metadata) {
  await createWhatsappInstanceEvent({
    whatsapp_instance_id: instanceContext.instanceId,
    event_type: eventType,
    message,
    metadata: metadata || null,
  });
}

function startRuntimeHeartbeat(instanceContext) {
  if (instanceContext.heartbeatTimer) {
    clearInterval(instanceContext.heartbeatTimer);
  }

  instanceContext.heartbeatTimer = setInterval(() => {
    void publishInstanceRuntime(instanceContext).catch((error) => {
      console.error(
        `WhatsApp heartbeat publish failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, HEARTBEAT_INTERVAL_MS);

  if (typeof instanceContext.heartbeatTimer.unref === 'function') {
    instanceContext.heartbeatTimer.unref();
  }
}

function normalizePhone(chatId) {
  return String(chatId).split('@')[0].replace(/\D/g, '');
}

function getChatKind(chatId) {
  const normalized = String(chatId || '');

  if (normalized.endsWith('@g.us')) return 'group';
  if (normalized === 'status@broadcast' || normalized.endsWith('@broadcast')) return 'broadcast';
  if (normalized.endsWith('@c.us') || normalized.endsWith('@lid')) return 'direct';
  return 'unknown';
}

function isSupportedDirectChat(chatId) {
  return getChatKind(chatId) === 'direct';
}

function getMessageTimestampMs(msg) {
  const rawTimestamp = msg?.timestamp;
  if (!rawTimestamp) return null;

  const numericTimestamp = Number(rawTimestamp);
  if (!Number.isFinite(numericTimestamp)) return null;
  if (numericTimestamp > 1e12) return numericTimestamp;
  return numericTimestamp * 1000;
}

function getStartOfCurrentDateMs() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function sanitizeTicketMediaFileName(value) {
  const normalized = String(value || '')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .trim();
  return normalized || 'ticket-image';
}

function getDefaultImageFileName(mimeType) {
  const extension = String(mimeType || '').split('/')[1] || 'jpg';
  return `ticket-image.${extension.replace(/[^a-z0-9]/gi, '') || 'jpg'}`;
}

async function downloadTicketImageMedia(msg) {
  if (!msg.hasMedia) {
    return null;
  }

  const media = await msg.downloadMedia();

  if (!media?.mimetype?.startsWith('image/') || !media.data) {
    return null;
  }

  const buffer = Buffer.from(media.data, 'base64');

  if (buffer.length > MAX_TICKET_IMAGE_SIZE_BYTES) {
    throw new Error('Inbound ticket image exceeds the 10 MB limit.');
  }

  const safeFileName = sanitizeTicketMediaFileName(media.filename || getDefaultImageFileName(media.mimetype));
  const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeFileName}`;
  await uploadObject({
    bucket: TICKET_MEDIA_BUCKET,
    path: objectPath,
    body: buffer,
    contentType: media.mimetype,
  });

  return {
    media_bucket: TICKET_MEDIA_BUCKET,
    media_path: objectPath,
    media_mime_type: media.mimetype,
    media_file_name: safeFileName,
    media_size_bytes: buffer.length,
  };
}

function shouldSendFarizAutoReply(msg) {
  if (String(msg?.body || '') !== FARIZ_AUTO_REPLY_TRIGGER) {
    return false;
  }

  const messageTimestampMs = getMessageTimestampMs(msg);
  if (!messageTimestampMs) {
    return false;
  }

  return messageTimestampMs >= getStartOfCurrentDateMs();
}

function parseTicketCommand(messageBody) {
  const trimmed = String(messageBody || '').trim();
  const normalized = trimmed.toLowerCase();

  if (!normalized.startsWith('!make_ticket')) {
    return { isTicketCommand: false, isValid: false };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const subjectLine = lines.find((line) => /^subject\s*:/i.test(line));
  const descriptionIndex = lines.findIndex((line) => /^description\s*:/i.test(line));

  if (!subjectLine || descriptionIndex === -1) {
    return { isTicketCommand: true, isValid: false };
  }

  const subject = subjectLine.replace(/^subject\s*:/i, '').trim();
  const firstDescriptionLine = lines[descriptionIndex].replace(/^description\s*:/i, '').trim();
  const description = [firstDescriptionLine, ...lines.slice(descriptionIndex + 1)]
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!subject || !description) {
    return { isTicketCommand: true, isValid: false };
  }

  return {
    isTicketCommand: true,
    isValid: true,
    subject,
    description,
  };
}

async function upsertWhatsappContact(payload) {
  await queryFn(
    `
      insert into public.whatsapp_contacts (
        whatsapp_instance_id,
        phone_number,
        chat_id,
        invalid_message_count,
        last_inbound_at,
        last_message_preview,
        last_help_sent_at,
        last_ticket_id,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict (whatsapp_instance_id, phone_number) do update
      set chat_id = excluded.chat_id,
          invalid_message_count = excluded.invalid_message_count,
          last_inbound_at = excluded.last_inbound_at,
          last_message_preview = excluded.last_message_preview,
          last_help_sent_at = coalesce(excluded.last_help_sent_at, whatsapp_contacts.last_help_sent_at),
          last_ticket_id = coalesce(excluded.last_ticket_id, whatsapp_contacts.last_ticket_id),
          updated_at = excluded.updated_at
    `,
    [
      payload.whatsapp_instance_id,
      payload.phone_number,
      payload.chat_id,
      payload.invalid_message_count || 0,
      payload.last_inbound_at || null,
      payload.last_message_preview || null,
      payload.last_help_sent_at || null,
      payload.last_ticket_id || null,
      payload.updated_at || new Date().toISOString(),
    ],
  );
}

async function loadWhatsappContact(whatsappInstanceId, phoneNumber) {
  const { rows } = await queryFn(
    `
      select *
      from public.whatsapp_contacts
      where whatsapp_instance_id = $1 and phone_number = $2
      limit 1
    `,
    [whatsappInstanceId, phoneNumber],
  );

  return rows[0] || null;
}

async function loadLatestActiveTicket(whatsappInstanceId, phoneNumber) {
  const { rows } = await queryFn(
    `
      select id, status, whatsapp_chat_id, phone_number, whatsapp_instance_id
      from public.tickets
      where channel = 'whatsapp'
        and whatsapp_instance_id = $1
        and phone_number = $2
        and status = any($3::text[])
      order by updated_at desc
      limit 1
    `,
    [whatsappInstanceId, phoneNumber, ACTIVE_TICKET_STATUSES],
  );

  return rows[0] || null;
}

async function appendCustomerReply(
  whatsappInstanceId,
  ticketId,
  phoneNumber,
  chatId,
  content,
  media,
) {
  const now = new Date().toISOString();
  const preview = content || (media ? '[image]' : '');

  await queryFn(
    `
      insert into public.replies (
        ticket_id,
        author,
        content,
        sender_type,
        delivery_status,
        delivery_attempts,
        media_bucket,
        media_path,
        media_mime_type,
        media_file_name,
        media_size_bytes,
        created_at
      )
      values ($1, $2, $3, 'customer', 'not_applicable', 0, $4, $5, $6, $7, $8, $9)
    `,
    [
      ticketId,
      phoneNumber,
      content,
      media?.media_bucket || null,
      media?.media_path || null,
      media?.media_mime_type || null,
      media?.media_file_name || null,
      media?.media_size_bytes || null,
      now,
    ],
  );

  await queryFn(
    `
      update public.tickets
      set status = 'Open',
          updated_at = $2,
          whatsapp_chat_id = $3,
          phone_number = $4,
          whatsapp_instance_id = $5
      where id = $1
    `,
    [ticketId, now, chatId, phoneNumber, whatsappInstanceId],
  );

  await upsertWhatsappContact({
    whatsapp_instance_id: whatsappInstanceId,
    phone_number: phoneNumber,
    chat_id: chatId,
    invalid_message_count: 0,
    last_inbound_at: now,
    last_message_preview: String(preview || '').slice(0, 250),
    last_ticket_id: ticketId,
    updated_at: now,
  });
}

async function handleInvalidMessage(client, instanceContext, msg) {
  const phoneNumber = normalizePhone(msg.from);
  const now = new Date().toISOString();
  const contact = await loadWhatsappContact(instanceContext.instanceId, phoneNumber);
  const invalidCount = (contact?.invalid_message_count || 0) + 1;
  const shouldSendHelp = invalidCount === 1 || invalidCount % 5 === 0;

  await upsertWhatsappContact({
    whatsapp_instance_id: instanceContext.instanceId,
    phone_number: phoneNumber,
    chat_id: msg.from,
    invalid_message_count: invalidCount,
    last_inbound_at: now,
    last_message_preview: String(msg.body || '').slice(0, 250),
    last_help_sent_at: shouldSendHelp ? now : contact?.last_help_sent_at || null,
    updated_at: now,
  });

  if (shouldSendHelp) {
    await client.sendMessage(msg.from, HELP_MESSAGE);
  }
}

async function createWhatsappTicket(client, instanceContext, msg, parsedCommand, media) {
  const now = new Date().toISOString();
  const phoneNumber = normalizePhone(msg.from);

  const ticketResult = await queryFn(
    `
      insert into public.tickets (
        subject,
        description,
        status,
        user_email,
        channel,
        phone_number,
        whatsapp_chat_id,
        whatsapp_instance_id,
        created_at,
        updated_at
      )
      values ($1, $2, 'Open', null, 'whatsapp', $3, $4, $5, $6, $6)
      returning *
    `,
    [
      parsedCommand.subject,
      parsedCommand.description,
      phoneNumber,
      msg.from,
      instanceContext.instanceId,
      now,
    ],
  );
  const ticket = ticketResult.rows[0];

  if (!ticket) {
    throw new Error('Failed to create ticket.');
  }

  await queryFn(
    `
      insert into public.replies (
        ticket_id,
        author,
        content,
        sender_type,
        delivery_status,
        delivery_attempts,
        media_bucket,
        media_path,
        media_mime_type,
        media_file_name,
        media_size_bytes,
        created_at
      )
      values ($1, $2, $3, 'customer', 'not_applicable', 0, $4, $5, $6, $7, $8, $9)
    `,
    [
      ticket.id,
      phoneNumber,
      parsedCommand.description,
      media?.media_bucket || null,
      media?.media_path || null,
      media?.media_mime_type || null,
      media?.media_file_name || null,
      media?.media_size_bytes || null,
      now,
    ],
  );

  await upsertWhatsappContact({
    whatsapp_instance_id: instanceContext.instanceId,
    phone_number: phoneNumber,
    chat_id: msg.from,
    invalid_message_count: 0,
    last_inbound_at: now,
    last_message_preview: parsedCommand.description.slice(0, 250),
    last_ticket_id: ticket.id,
    updated_at: now,
  });

  await client.sendMessage(
    msg.from,
    `Your ticket has been created.\nTicket ID: ${ticket.id}\nSubject: ${ticket.subject}`,
  );
}

function getNextRetryState(currentAttempts, errorMessage) {
  if (currentAttempts >= RETRY_DELAYS_MS.length) {
    return {
      delivery_status: 'failed',
      delivery_attempts: currentAttempts,
      last_delivery_error: errorMessage,
      next_retry_at: null,
    };
  }

  return {
    delivery_status: 'retrying',
    delivery_attempts: currentAttempts,
    last_delivery_error: errorMessage,
    next_retry_at: new Date(Date.now() + RETRY_DELAYS_MS[currentAttempts - 1]).toISOString(),
  };
}

async function resolveWhatsappRecipientChatId(client, phoneNumber) {
  const numberId = await client.getNumberId(phoneNumber);
  const chatId = numberId?._serialized || null;

  if (!chatId || !isSupportedDirectChat(chatId)) {
    return null;
  }

  return chatId;
}

function getDispatchMinGapMs(globalMessagesPerMinute) {
  return Math.ceil(60000 / Math.max(1, Number(globalMessagesPerMinute) || 1));
}

function summarizeDispatchSettingsLoadError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const compactMessage = message.replace(/\s+/g, ' ').trim();

  if (/<!DOCTYPE html>/i.test(compactMessage)) {
    const errorCodeMatch = compactMessage.match(/Error code (\d+)/i);
    const errorCode = errorCodeMatch?.[1];

    return errorCode
      ? `Dispatch settings fetch returned an upstream HTML error page (${errorCode}).`
      : 'Dispatch settings fetch returned an upstream HTML error page.';
  }

  return compactMessage.slice(0, 240);
}

async function loadDispatchSettings() {
  const { rows } = await queryFn(
    `
      select *
      from public.bot_dispatch_settings
      where id = $1
      limit 1
    `,
    [DEFAULT_DISPATCH_SETTINGS.id],
  );

  return rows[0] || DEFAULT_DISPATCH_SETTINGS;
}

async function loadDispatchSettingsWithFallback(dispatchState, nowMs = Date.now()) {
  if (
    dispatchState.cachedDispatchSettings &&
    dispatchState.cachedDispatchSettingsFreshUntilMs > nowMs
  ) {
    return dispatchState.cachedDispatchSettings;
  }

  try {
    const settings = await loadDispatchSettings();
    dispatchState.cachedDispatchSettings = settings;
    dispatchState.cachedDispatchSettingsFreshUntilMs = nowMs + DISPATCH_SETTINGS_CACHE_TTL_MS;
    return settings;
  } catch (error) {
    const hadCachedSettings = Boolean(dispatchState.cachedDispatchSettings);
    const fallbackSettings = dispatchState.cachedDispatchSettings || DEFAULT_DISPATCH_SETTINGS;

    dispatchState.cachedDispatchSettings = fallbackSettings;
    dispatchState.cachedDispatchSettingsFreshUntilMs = nowMs + DISPATCH_SETTINGS_CACHE_TTL_MS;

    console.error(
      JSON.stringify({
        event: 'dispatch_settings_fallback',
        reason: summarizeDispatchSettingsLoadError(error),
        using_cached_settings: hadCachedSettings,
        using_default_settings: fallbackSettings === DEFAULT_DISPATCH_SETTINGS,
      }),
    );

    return fallbackSettings;
  }
}

async function updateLinkedReplyDeliveryStatus(outboundMessage, payload) {
  if (outboundMessage.source_type !== 'ticket_reply') {
    return;
  }

  const keys = Object.keys(payload);
  if (!keys.length) {
    return;
  }

  const assignments = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
  await queryFn(
    `update public.replies set ${assignments} where id = $1`,
    [outboundMessage.source_id, ...keys.map((key) => payload[key])],
  );
}

async function updateOutboundLedger(outboundMessageId, payload, failureContext) {
  const keys = Object.keys(payload);
  if (!keys.length) {
    return;
  }

  const assignments = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
  try {
    await queryFn(
      `update public.outbound_messages set ${assignments} where id = $1`,
      [outboundMessageId, ...keys.map((key) => payload[key])],
    );
  } catch (error) {
    throw new Error(`${failureContext}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadOutboundMessageMedia(outboundMessage) {
  if (!outboundMessage.media_bucket || !outboundMessage.media_path || !outboundMessage.media_mime_type) {
    return null;
  }

  const buffer = await downloadObjectBufferFn(outboundMessage.media_bucket, outboundMessage.media_path);
  return new MessageMedia(
    outboundMessage.media_mime_type,
    buffer.toString('base64'),
    outboundMessage.media_file_name || 'blast-image',
  );
}

async function delayJobForLater(job, token, timestamp, updatedData) {
  if (updatedData) {
    await job.updateData(updatedData);
  }

  await job.moveToDelayed(timestamp, token || job.token);
  throw new DelayedError();
}

async function processOutboundDispatchJob(
  job,
  token,
  client,
  redis,
  dispatchState,
  nowMs = Date.now(),
  instanceContext = null,
) {
  const settings = await loadDispatchSettingsWithFallback(dispatchState, nowMs);

  if (job.data.source_type !== 'ticket_reply' && settings.api_notifications_paused) {
    await delayJobForLater(job, token, nowMs + DISPATCH_CONTROL_RECHECK_DELAY_MS, job.data);
  }

  const minGapMs = getDispatchMinGapMs(settings.global_messages_per_minute);

  if (dispatchState.nextDispatchAtMs > nowMs) {
    await delayJobForLater(job, token, dispatchState.nextDispatchAtMs, job.data);
  }

  if (
    instanceContext &&
    job.data.whatsapp_instance_id &&
    job.data.whatsapp_instance_id !== instanceContext.instanceId
  ) {
    console.log(
      JSON.stringify({
        event: 'outbound_message_instance_mismatch',
        outbound_message_id: job.data.outbound_message_id,
        expected_instance_id: job.data.whatsapp_instance_id,
        worker_instance_id: instanceContext.instanceId,
      }),
    );

    await delayJobForLater(
      job,
      token,
      nowMs + INSTANCE_AFFINITY_RECHECK_DELAY_MS,
    );
  }

  const attemptNumber = (job.data.attempt_number || 0) + 1;
  let recipientChatId = job.data.recipient_chat_id || null;

  if (!recipientChatId) {
    recipientChatId = await resolveWhatsappRecipientChatId(client, job.data.recipient_phone_number);

    if (!recipientChatId) {
      const failedAt = new Date().toISOString();

      await updateOutboundLedger(
        job.data.outbound_message_id,
        {
          delivery_status: 'failed',
          delivery_attempts: attemptNumber,
          next_retry_at: null,
          last_delivery_error: NON_RETRYABLE_DELIVERY_ERROR,
          updated_at: failedAt,
        },
        'Failed to mark non-deliverable outbound message',
      );

      await updateLinkedReplyDeliveryStatus(job.data, {
        delivery_status: 'failed',
        delivery_attempts: attemptNumber,
        next_retry_at: null,
        last_delivery_error: NON_RETRYABLE_DELIVERY_ERROR,
      });

      await decrementPendingOutboundCounts(redis, job.data.source_type, job.data.client_id);

      console.log(
        JSON.stringify({
          event: 'outbound_message_failed',
          outbound_message_id: job.data.outbound_message_id,
          source_type: job.data.source_type,
          source_id: job.data.source_id,
          reason: NON_RETRYABLE_DELIVERY_ERROR,
        }),
      );

      if (instanceContext) {
        await publishInstanceRuntime(instanceContext, {
          lastOutboundAt: failedAt,
          lastError: NON_RETRYABLE_DELIVERY_ERROR,
        });
      }
      dispatchState.nextDispatchAtMs = Date.now() + minGapMs;
      return { processed: true, settings };
    }
  }

  try {
    const media = await loadOutboundMessageMedia(job.data);
    const result = media
      ? await client.sendMessage(recipientChatId, media, { caption: job.data.content || undefined })
      : await client.sendMessage(recipientChatId, job.data.content);
    const deliveredAt = new Date().toISOString();

    await updateOutboundLedger(
      job.data.outbound_message_id,
      {
        recipient_chat_id: recipientChatId,
        delivery_status: 'sent',
        delivery_attempts: attemptNumber,
        delivered_at: deliveredAt,
        last_delivery_error: null,
        next_retry_at: null,
        whatsapp_message_id: result?.id?._serialized || null,
        updated_at: deliveredAt,
      },
      'Message sent but outbound status update failed',
    );

    await updateLinkedReplyDeliveryStatus(job.data, {
      delivery_status: 'sent',
      delivery_attempts: attemptNumber,
      delivered_at: deliveredAt,
      last_delivery_error: null,
      next_retry_at: null,
      whatsapp_message_id: result?.id?._serialized || null,
    });

    await decrementPendingOutboundCounts(redis, job.data.source_type, job.data.client_id);

    console.log(
      JSON.stringify({
        event: 'outbound_message_sent',
        outbound_message_id: job.data.outbound_message_id,
        source_type: job.data.source_type,
        source_id: job.data.source_id,
      }),
    );

    if (instanceContext) {
      await publishInstanceRuntime(instanceContext, {
        lastOutboundAt: deliveredAt,
        lastError: null,
      });
    }
  } catch (error) {
    const retryState = getNextRetryState(
      attemptNumber,
      error instanceof Error ? error.message : 'Unknown send error',
    );
    const updatedAt = new Date().toISOString();

    await updateOutboundLedger(
      job.data.outbound_message_id,
      {
        recipient_chat_id: recipientChatId,
        updated_at: updatedAt,
        ...retryState,
      },
      'Failed to update outbound message retry state',
    );

    await updateLinkedReplyDeliveryStatus(job.data, retryState);

    console.log(
      JSON.stringify({
        event:
          retryState.delivery_status === 'failed'
            ? 'outbound_message_failed'
            : 'outbound_message_retrying',
        outbound_message_id: job.data.outbound_message_id,
        source_type: job.data.source_type,
        source_id: job.data.source_id,
        reason: retryState.last_delivery_error,
      }),
    );

    if (instanceContext) {
      await publishInstanceRuntime(instanceContext, {
        lastOutboundAt: updatedAt,
        lastError: retryState.last_delivery_error,
      });
    }
    dispatchState.nextDispatchAtMs = Date.now() + minGapMs;

    if (retryState.delivery_status === 'retrying') {
      await delayJobForLater(
        job,
        token,
        Date.parse(retryState.next_retry_at),
        {
          ...job.data,
          recipient_chat_id: recipientChatId,
          attempt_number: attemptNumber,
        },
      );
    }

    await decrementPendingOutboundCounts(redis, job.data.source_type, job.data.client_id);
    return { processed: true, settings };
  }

  dispatchState.nextDispatchAtMs = Date.now() + minGapMs;
  return { processed: true, settings };
}

function startOutboundDispatchWorker(client, dispatchState, instanceContext) {
  const workerRedis = createRedisConnection();
  const counterRedis = createRedisConnection();
  const worker = new Worker(
    OUTBOUND_DISPATCH_QUEUE_NAME,
    async (job, token) => processOutboundDispatchJob(
      job,
      token,
      client,
      counterRedis,
      dispatchState,
      undefined,
      instanceContext,
    ),
    {
      connection: workerRedis,
      concurrency: 1,
      removeOnComplete: {
        count: 500,
      },
      removeOnFail: {
        count: 500,
      },
    },
  );

  worker.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error));
  });

  worker.on('failed', (_job, error) => {
    if (error instanceof DelayedError || error?.name === 'DelayedError') {
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
  });

  return { worker, workerRedis, counterRedis };
}

async function main() {
  const chromiumPath = process.env.WHATSAPP_CHROMIUM_PATH || '/snap/bin/chromium';
  const dispatchState = {
    nextDispatchAtMs: 0,
    cachedDispatchSettings: null,
    cachedDispatchSettingsFreshUntilMs: 0,
  };
  const instanceContext = createInstanceContext();
  const authInstanceId = getSafeInstanceIdForAuth(instanceContext.instanceId);
  let selfChatId = null;
  let readyAtMs = null;
  let outboundWorkerResources = null;

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: authInstanceId,
      dataPath: path.join(process.cwd(), '.wwebjs_auth'),
    }),
    puppeteer: {
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  await ensureWhatsappInstanceRecord(instanceContext, 'starting');
  await syncWhatsappInstanceState(instanceContext, { status: 'connecting', last_error: null });
  await publishInstanceRuntime(instanceContext, { status: 'connecting', lastError: null });
  startRuntimeHeartbeat(instanceContext);

  client.on('qr', async (qr) => {
    const issuedAt = new Date().toISOString();

    console.log(renderTerminalQr(qr) || qr);

    try {
      await publishWhatsappQr(instanceContext.runtimeRedis, instanceContext.instanceId, qr, issuedAt);
      await syncWhatsappInstanceState(instanceContext, {
        status: 'qr_required',
        last_qr_at: issuedAt,
        last_error: null,
      });
      await publishInstanceRuntime(instanceContext, { status: 'qr_required', lastError: null });
      await recordInstanceEvent(instanceContext, 'qr_issued', 'WhatsApp QR issued.', {
        generated_at: issuedAt,
      });
    } catch (error) {
      console.error(`Failed to publish WhatsApp QR state: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  client.on('ready', async () => {
    console.log('WhatsApp bot ready');
    selfChatId = client.info?.wid?._serialized || null;
    readyAtMs = Date.now();
    const readyAt = new Date().toISOString();
    const phoneNumber = selfChatId ? normalizePhone(selfChatId) : null;

    try {
      await clearWhatsappQr(instanceContext.runtimeRedis, instanceContext.instanceId);
      await syncWhatsappInstanceState(instanceContext, {
        status: 'ready',
        last_ready_at: readyAt,
        last_error: null,
        last_known_phone_number: phoneNumber,
        last_known_chat_id: selfChatId,
      });
      await publishInstanceRuntime(instanceContext, {
        status: 'ready',
        lastError: null,
        lastKnownPhoneNumber: phoneNumber,
        lastKnownChatId: selfChatId,
      });
      await recordInstanceEvent(instanceContext, 'ready', 'WhatsApp session ready.', {
        ready_at: readyAt,
        phone_number: phoneNumber,
      });
    } catch (error) {
      console.error(`Failed to persist WhatsApp ready state: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!outboundWorkerResources) {
      outboundWorkerResources = startOutboundDispatchWorker(
        client,
        dispatchState,
        instanceContext,
      );
    }

  });

  client.on('auth_failure', async (message) => {
    const failedAt = new Date().toISOString();
    const errorMessage = String(message || 'Authentication failure.');

    try {
      await syncWhatsappInstanceState(instanceContext, {
        status: 'auth_failed',
        last_error: errorMessage,
      });
      await publishInstanceRuntime(instanceContext, {
        status: 'auth_failed',
        lastError: errorMessage,
      });
      await recordInstanceEvent(instanceContext, 'auth_failed', errorMessage, {
        failed_at: failedAt,
      });
    } catch (error) {
      console.error(`Failed to persist WhatsApp auth failure: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  client.on('disconnected', async (reason) => {
    const disconnectedAt = new Date().toISOString();
    const disconnectReason = String(reason || 'Disconnected.');

    try {
      const reconnectCount = await incrementReconnectCount(
        instanceContext.runtimeRedis,
        instanceContext.instanceId,
      );
      await clearWhatsappQr(instanceContext.runtimeRedis, instanceContext.instanceId);
      await syncWhatsappInstanceState(instanceContext, {
        status: 'disconnected',
        last_disconnect_at: disconnectedAt,
        last_error: disconnectReason,
      });
      await publishInstanceRuntime(instanceContext, {
        status: 'disconnected',
        lastDisconnectAt: disconnectedAt,
        lastError: disconnectReason,
      });
      await recordInstanceEvent(instanceContext, 'disconnected', disconnectReason, {
        disconnected_at: disconnectedAt,
      });
      await recordInstanceEvent(instanceContext, 'reconnect_started', 'Reconnect flow started.', {
        reconnect_count_24h: reconnectCount,
      });
    } catch (error) {
      console.error(`Failed to persist WhatsApp disconnect state: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  client.on('message', async (msg) => {
    if (msg.fromMe || msg.id?.fromMe) return;

    try {
      if (shouldSendFarizAutoReply(msg)) {
        await msg.reply(FARIZ_AUTO_REPLY_MESSAGE);
        return;
      }

      if (selfChatId && msg.from === selfChatId) return;
      if (selfChatId && msg.to && msg.to !== selfChatId) return;
      if (!isSupportedDirectChat(msg.from)) {
        console.log(`Ignoring unsupported chat: ${msg.from}`);
        return;
      }

      const messageTimestampMs = getMessageTimestampMs(msg);
      if (readyAtMs && messageTimestampMs && messageTimestampMs < readyAtMs) {
        console.log(`Ignoring old message from ${msg.from}`);
        return;
      }

      const phoneNumber = normalizePhone(msg.from);
      const activeTicket = await loadLatestActiveTicket(
        instanceContext.instanceId,
        phoneNumber,
      );
      await publishInstanceRuntime(instanceContext, {
        lastInboundAt: new Date().toISOString(),
        lastKnownPhoneNumber: phoneNumber,
        lastKnownChatId: msg.from,
      });
      await syncWhatsappInstanceState(instanceContext, {
        last_known_phone_number: phoneNumber,
        last_known_chat_id: msg.from,
      });

      if (activeTicket) {
        const ticketMedia = await downloadTicketImageMedia(msg);
        await appendCustomerReply(
          instanceContext.instanceId,
          activeTicket.id,
          phoneNumber,
          msg.from,
          String(msg.body || ''),
          ticketMedia,
        );
        return;
      }

      const parsedCommand = parseTicketCommand(msg.body);

      if (!parsedCommand.isTicketCommand || !parsedCommand.isValid) {
        await handleInvalidMessage(client, instanceContext, msg);
        return;
      }

      const ticketMedia = await downloadTicketImageMedia(msg);
      await createWhatsappTicket(client, instanceContext, msg, parsedCommand, ticketMedia);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Incoming message processing failed: ${errorMessage}`);
      await client.sendMessage(
        msg.from,
        'We could not process your request right now. Please try again in a moment.',
      );
    }
  });

  await client.initialize();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  getDispatchMinGapMs,
  getNextRetryState,
  loadDispatchSettings,
  loadDispatchSettingsWithFallback,
  processOutboundDispatchJob,
  resolveWhatsappRecipientChatId,
  setTestAdapters,
  startOutboundDispatchWorker,
  summarizeDispatchSettingsLoadError,
};
