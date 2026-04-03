/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { DelayedError, Worker } = require('bullmq');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');

const {
  OUTBOUND_DISPATCH_QUEUE_NAME,
  createRedisConnection,
  decrementPendingOutboundCounts,
} = require('./outbound-dispatch-redis.js');

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
const NON_RETRYABLE_DELIVERY_ERROR = 'Recipient is not a registered WhatsApp user.';
const DEFAULT_DISPATCH_SETTINGS = {
  id: 'default',
  global_messages_per_minute: 24,
  api_notifications_paused: false,
};

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabaseClient() {
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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

async function upsertWhatsappContact(supabase, payload) {
  const { error } = await supabase
    .from('whatsapp_contacts')
    .upsert(payload, { onConflict: 'phone_number' });

  if (error) {
    throw new Error(`Failed to upsert WhatsApp contact: ${error.message}`);
  }
}

async function loadWhatsappContact(supabase, phoneNumber) {
  const { data, error } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load WhatsApp contact: ${error.message}`);
  }

  return data;
}

async function loadLatestActiveTicket(supabase, phoneNumber) {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, status, whatsapp_chat_id, phone_number')
    .eq('channel', 'whatsapp')
    .eq('phone_number', phoneNumber)
    .in('status', ACTIVE_TICKET_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active ticket: ${error.message}`);
  }

  return data;
}

async function appendCustomerReply(supabase, ticketId, phoneNumber, chatId, content) {
  const now = new Date().toISOString();

  const { error: replyError } = await supabase
    .from('replies')
    .insert({
      ticket_id: ticketId,
      author: phoneNumber,
      content,
      sender_type: 'customer',
      delivery_status: 'not_applicable',
      delivery_attempts: 0,
      created_at: now,
    });

  if (replyError) {
    throw new Error(`Failed to save customer reply: ${replyError.message}`);
  }

  const { error: ticketError } = await supabase
    .from('tickets')
    .update({
      status: 'Open',
      updated_at: now,
      whatsapp_chat_id: chatId,
      phone_number: phoneNumber,
    })
    .eq('id', ticketId);

  if (ticketError) {
    throw new Error(`Reply saved but failed to update ticket: ${ticketError.message}`);
  }

  await upsertWhatsappContact(supabase, {
    phone_number: phoneNumber,
    chat_id: chatId,
    invalid_message_count: 0,
    last_inbound_at: now,
    last_message_preview: String(content || '').slice(0, 250),
    last_ticket_id: ticketId,
    updated_at: now,
  });
}

async function handleInvalidMessage(client, supabase, msg) {
  const phoneNumber = normalizePhone(msg.from);
  const now = new Date().toISOString();
  const contact = await loadWhatsappContact(supabase, phoneNumber);
  const invalidCount = (contact?.invalid_message_count || 0) + 1;
  const shouldSendHelp = invalidCount === 1 || invalidCount % 5 === 0;

  await upsertWhatsappContact(supabase, {
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

async function createWhatsappTicket(client, supabase, msg, parsedCommand) {
  const now = new Date().toISOString();
  const phoneNumber = normalizePhone(msg.from);

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .insert({
      subject: parsedCommand.subject,
      description: parsedCommand.description,
      status: 'Open',
      user_email: null,
      channel: 'whatsapp',
      phone_number: phoneNumber,
      whatsapp_chat_id: msg.from,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (ticketError || !ticket) {
    throw new Error(`Failed to create ticket: ${ticketError?.message || 'Unknown error'}`);
  }

  const { error: replyError } = await supabase
    .from('replies')
    .insert({
      ticket_id: ticket.id,
      author: phoneNumber,
      content: parsedCommand.description,
      sender_type: 'customer',
      delivery_status: 'not_applicable',
      delivery_attempts: 0,
      created_at: now,
    });

  if (replyError) {
    throw new Error(`Ticket created but failed to save first customer reply: ${replyError.message}`);
  }

  await upsertWhatsappContact(supabase, {
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

async function loadDispatchSettings(supabase) {
  const { data, error } = await supabase
    .from('bot_dispatch_settings')
    .select('*')
    .eq('id', DEFAULT_DISPATCH_SETTINGS.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load dispatch settings: ${error.message}`);
  }

  return data || DEFAULT_DISPATCH_SETTINGS;
}

async function loadDispatchSettingsWithFallback(supabase, dispatchState, nowMs = Date.now()) {
  if (
    dispatchState.cachedDispatchSettings &&
    dispatchState.cachedDispatchSettingsFreshUntilMs > nowMs
  ) {
    return dispatchState.cachedDispatchSettings;
  }

  try {
    const settings = await loadDispatchSettings(supabase);
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

async function updateLinkedReplyDeliveryStatus(supabase, outboundMessage, payload) {
  if (outboundMessage.source_type !== 'ticket_reply') {
    return;
  }

  const { error } = await supabase
    .from('replies')
    .update(payload)
    .eq('id', outboundMessage.source_id);

  if (error) {
    throw new Error(`Failed to update linked ticket reply delivery status: ${error.message}`);
  }
}

async function updateOutboundLedger(supabase, outboundMessageId, payload, failureContext) {
  const { error } = await supabase
    .from('outbound_messages')
    .update(payload)
    .eq('id', outboundMessageId);

  if (error) {
    throw new Error(`${failureContext}: ${error.message}`);
  }
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
  supabase,
  redis,
  dispatchState,
  nowMs = Date.now(),
) {
  const settings = await loadDispatchSettingsWithFallback(supabase, dispatchState, nowMs);

  if (job.data.source_type === 'api_notification' && settings.api_notifications_paused) {
    await delayJobForLater(job, token, nowMs + DISPATCH_CONTROL_RECHECK_DELAY_MS, job.data);
  }

  const minGapMs = getDispatchMinGapMs(settings.global_messages_per_minute);

  if (dispatchState.nextDispatchAtMs > nowMs) {
    await delayJobForLater(job, token, dispatchState.nextDispatchAtMs, job.data);
  }

  const attemptNumber = (job.data.attempt_number || 0) + 1;
  let recipientChatId = job.data.recipient_chat_id || null;

  if (!recipientChatId) {
    recipientChatId = await resolveWhatsappRecipientChatId(client, job.data.recipient_phone_number);

    if (!recipientChatId) {
      const failedAt = new Date().toISOString();

      await updateOutboundLedger(
        supabase,
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

      await updateLinkedReplyDeliveryStatus(supabase, job.data, {
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

      dispatchState.nextDispatchAtMs = Date.now() + minGapMs;
      return { processed: true, settings };
    }
  }

  try {
    const result = await client.sendMessage(recipientChatId, job.data.content);
    const deliveredAt = new Date().toISOString();

    await updateOutboundLedger(
      supabase,
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

    await updateLinkedReplyDeliveryStatus(supabase, job.data, {
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
  } catch (error) {
    const retryState = getNextRetryState(
      attemptNumber,
      error instanceof Error ? error.message : 'Unknown send error',
    );
    const updatedAt = new Date().toISOString();

    await updateOutboundLedger(
      supabase,
      job.data.outbound_message_id,
      {
        recipient_chat_id: recipientChatId,
        updated_at: updatedAt,
        ...retryState,
      },
      'Failed to update outbound message retry state',
    );

    await updateLinkedReplyDeliveryStatus(supabase, job.data, retryState);

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

function startOutboundDispatchWorker(client, supabase, dispatchState) {
  const workerRedis = createRedisConnection();
  const counterRedis = createRedisConnection();
  const worker = new Worker(
    OUTBOUND_DISPATCH_QUEUE_NAME,
    async (job, token) => processOutboundDispatchJob(
      job,
      token,
      client,
      supabase,
      counterRedis,
      dispatchState,
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
  const supabase = getSupabaseClient();
  const dispatchState = {
    nextDispatchAtMs: 0,
    cachedDispatchSettings: null,
    cachedDispatchSettingsFreshUntilMs: 0,
  };
  let selfChatId = null;
  let readyAtMs = null;
  let outboundWorkerResources = null;

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(process.cwd(), '.wwebjs_auth'),
    }),
    puppeteer: {
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('WhatsApp bot ready');
    selfChatId = client.info?.wid?._serialized || null;
    readyAtMs = Date.now();

    if (!outboundWorkerResources) {
      outboundWorkerResources = startOutboundDispatchWorker(client, supabase, dispatchState);
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
      const activeTicket = await loadLatestActiveTicket(supabase, phoneNumber);

      if (activeTicket) {
        await appendCustomerReply(supabase, activeTicket.id, phoneNumber, msg.from, String(msg.body || ''));
        return;
      }

      const parsedCommand = parseTicketCommand(msg.body);

      if (!parsedCommand.isTicketCommand || !parsedCommand.isValid) {
        await handleInvalidMessage(client, supabase, msg);
        return;
      }

      await createWhatsappTicket(client, supabase, msg, parsedCommand);
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
  startOutboundDispatchWorker,
  summarizeDispatchSettingsLoadError,
};
