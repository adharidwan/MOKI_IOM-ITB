/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');

const HELP_MESSAGE = [
  'Hello, thank you for contacting us.',
  'To create a ticket, please send:',
  '!make_ticket',
  'Subject: <your subject>',
  'Description: <your message>',
].join('\n');

const RETRY_DELAYS_MS = [10000, 30000, 60000, 300000, 900000];
const BOT_POLL_INTERVAL_MS = 5000;

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

async function handleInvalidMessage(client, supabase, msg) {
  const phoneNumber = normalizePhone(msg.from);
  const now = new Date().toISOString();
  const contact = await loadWhatsappContact(supabase, phoneNumber);
  const invalidCount = (contact?.invalid_message_count || 0) + 1;
  const shouldSendHelp = invalidCount === 1 || invalidCount >= 3;

  await upsertWhatsappContact(supabase, {
    phone_number: phoneNumber,
    chat_id: msg.from,
    invalid_message_count: shouldSendHelp ? 0 : invalidCount,
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

async function processOutboundReplies(client, supabase) {
  const { data: replies, error } = await supabase
    .from('replies')
    .select('id, ticket_id, content, delivery_status, delivery_attempts, next_retry_at, tickets!inner(id, channel, whatsapp_chat_id)')
    .eq('sender_type', 'admin')
    .in('delivery_status', ['queued', 'retrying'])
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Failed to fetch outbound replies: ${error.message}`);
  }

  const now = Date.now();
  const pendingReply = (replies || []).find((reply) => {
    const retryAt = reply.next_retry_at ? Date.parse(reply.next_retry_at) : null;
    return !retryAt || retryAt <= now;
  });

  if (!pendingReply) {
    return;
  }

  const attemptNumber = (pendingReply.delivery_attempts || 0) + 1;
  const ticket = Array.isArray(pendingReply.tickets) ? pendingReply.tickets[0] : pendingReply.tickets;

  if (!ticket?.whatsapp_chat_id || ticket.channel !== 'whatsapp') {
    const { error: updateError } = await supabase
      .from('replies')
      .update({
        delivery_status: 'not_applicable',
        delivery_attempts: attemptNumber,
        last_delivery_error: null,
        next_retry_at: null,
      })
      .eq('id', pendingReply.id);

    if (updateError) {
      throw new Error(`Failed to mark non-WhatsApp reply: ${updateError.message}`);
    }

    return;
  }

  try {
    const result = await client.sendMessage(ticket.whatsapp_chat_id, pendingReply.content);

    const { error: updateError } = await supabase
      .from('replies')
      .update({
        delivery_status: 'sent',
        delivery_attempts: attemptNumber,
        delivered_at: new Date().toISOString(),
        last_delivery_error: null,
        next_retry_at: null,
        whatsapp_message_id: result?.id?._serialized || null,
      })
      .eq('id', pendingReply.id);

    if (updateError) {
      throw new Error(`Message sent but reply status update failed: ${updateError.message}`);
    }
  } catch (error) {
    const retryState = getNextRetryState(
      attemptNumber,
      error instanceof Error ? error.message : 'Unknown send error',
    );

    const { error: updateError } = await supabase
      .from('replies')
      .update(retryState)
      .eq('id', pendingReply.id);

    if (updateError) {
      throw new Error(`Failed to update retry state: ${updateError.message}`);
    }
  }
}

async function main() {
  const chromiumPath = process.env.WHATSAPP_CHROMIUM_PATH || '/snap/bin/chromium';
  const supabase = getSupabaseClient();
  let outboundLoopBusy = false;

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

    setInterval(async () => {
      if (outboundLoopBusy) return;
      outboundLoopBusy = true;

      try {
        await processOutboundReplies(client, supabase);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      } finally {
        outboundLoopBusy = false;
      }
    }, BOT_POLL_INTERVAL_MS);
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return;

    try {
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
