/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('crypto');
const { Queue } = require('bullmq');

const {
  OUTBOUND_DISPATCH_QUEUE_NAME,
  createRedisConnection,
  incrementPendingOutboundCounts,
} = require('./outbound-dispatch-redis.js');

const BLAST_PRIORITY = 200;

function normalizePhoneNumber(rawValue) {
  const digitsOnly = String(rawValue || '').replace(/\D/g, '');
  return digitsOnly.length >= 8 && digitsOnly.length <= 15 ? digitsOnly : null;
}

function normalizeGroupNames(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

function renderBlastMessageTemplate(template, recipient) {
  const groupNames = Array.isArray(recipient.group_names) ? recipient.group_names : [];
  const values = {
    name: recipient.nama || '',
    phone_number: recipient.no_telp || '',
    group_name: groupNames.join(', '),
  };

  return String(template || '').replace(/\{\{\s*(name|phone_number|group_name)\s*\}\}/g, (_match, key) => values[key] || '');
}

function addRecurrence(date, recurrenceType) {
  const nextDate = new Date(date.getTime());
  if (recurrenceType === 'daily') nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  else if (recurrenceType === 'weekly') nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  else nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  return nextDate;
}

function computeNextRunAt(schedule, scheduledFor) {
  if (schedule.schedule_type !== 'recurring' || !schedule.recurrence_type) {
    return null;
  }

  const now = new Date();
  let nextRunAt = addRecurrence(new Date(scheduledFor), schedule.recurrence_type);
  while (nextRunAt.getTime() <= now.getTime()) {
    nextRunAt = addRecurrence(nextRunAt, schedule.recurrence_type);
  }
  return nextRunAt.toISOString();
}

function buildRequestId(scheduleId, scheduledFor, content, recipients) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ scheduleId, scheduledFor, content, recipients }))
    .digest('hex')
    .slice(0, 24);
}

function buildJobData(message) {
  return {
    outbound_message_id: message.id,
    client_id: message.client_id,
    idempotency_key: message.idempotency_key,
    source_type: message.source_type,
    source_id: message.source_id,
    ticket_id: message.ticket_id,
    whatsapp_instance_id: message.whatsapp_instance_id,
    recipient_phone_number: message.recipient_phone_number,
    recipient_chat_id: message.recipient_chat_id,
    content: message.content,
    priority: message.priority,
    attempt_number: message.delivery_attempts,
    client_reference: message.client_reference,
    accepted_at: message.created_at,
  };
}

function normalizeRecipients(recipients) {
  const deduped = new Map();
  for (const recipient of recipients || []) {
    const phoneNumber = normalizePhoneNumber(recipient.no_telp || recipient.recipient_phone_number);
    if (!phoneNumber) continue;
    deduped.set(phoneNumber, {
      no_telp: phoneNumber,
      nama: String(recipient.nama || recipient.recipient_name || '').trim() || undefined,
      group_names: Array.isArray(recipient.group_names)
        ? recipient.group_names
        : Array.isArray(recipient.recipient_group_names)
          ? recipient.recipient_group_names
          : [],
    });
  }
  return Array.from(deduped.values());
}

async function loadRecipients(supabase, schedule) {
  if (schedule.source_type === 'group') {
    const groupNames = normalizeGroupNames(schedule.source_config?.groupNames || []);
    const { data, error } = await supabase.rpc('resolve_csv_contact_group_recipients', {
      p_group_names: groupNames,
      p_limit: null,
      p_sort_by: 'created_at',
    });

    if (error) throw new Error(`Failed to resolve scheduled blast groups: ${error.message}`);
    return normalizeRecipients(data || []);
  }

  const { data, error } = await supabase
    .from('scheduled_blast_recipients')
    .select('*')
    .eq('scheduled_blast_id', schedule.id)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load scheduled blast recipients: ${error.message}`);
  return normalizeRecipients(data || []);
}

async function insertOutboundMessage(supabase, message) {
  const { data, error } = await supabase.from('outbound_messages').insert(message).select('*').single();
  if (!error) return { message: data, inserted: true };
  if (error.code !== '23505') throw new Error(`Failed to insert scheduled blast outbound message: ${error.message}`);

  const { data: existing, error: loadError } = await supabase
    .from('outbound_messages')
    .select('*')
    .eq('source_type', message.source_type)
    .eq('source_id', message.source_id)
    .maybeSingle();

  if (loadError || !existing) {
    throw new Error(`Failed to reload scheduled blast outbound message: ${loadError?.message || 'missing row'}`);
  }

  return { message: existing, inserted: false };
}

async function loadWhatsappInstanceIds(supabase) {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('id')
    .eq('is_enabled', true)
    .order('id', { ascending: true });

  if (error) throw new Error(`Failed to load WhatsApp instances for scheduled blast: ${error.message}`);

  return (data || []).map((instance) => String(instance.id || '').trim()).filter(Boolean);
}

async function runSchedule(supabase, queue, redis, schedule, instanceIds, scheduledFor) {
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from('scheduled_blast_runs')
    .insert({ scheduled_blast_id: schedule.id, scheduled_for: scheduledFor, started_at: startedAt, status: 'running' })
    .select('*')
    .single();

  if (runError) throw new Error(`Failed to create scheduled blast run: ${runError.message}`);

  try {
    const recipients = await loadRecipients(supabase, schedule);
    if (!recipients.length) throw new Error('Scheduled blast has no valid recipients.');
    if (!instanceIds.length) throw new Error('No enabled WhatsApp instance is available for scheduled blast.');

    const personalized = String(schedule.message_template || '').includes('{{');
    const outboundInputs = recipients.map((recipient) => ({
      phoneNumber: recipient.no_telp,
      content: personalized ? renderBlastMessageTemplate(schedule.message_template, recipient) : schedule.message_template,
    }));
    const requestId = buildRequestId(schedule.id, scheduledFor, schedule.message_template, outboundInputs.map((input) => input.phoneNumber).sort());
    const trackedMessageIds = [];
    let queuedCount = 0;
    let failedCount = 0;

    for (const [index, input] of outboundInputs.entries()) {
      const now = new Date().toISOString();
      const sourceId = `blast:scheduled:${requestId}:${input.phoneNumber}`;
      const outboundMessage = {
        id: crypto.randomUUID(),
        client_id: null,
        idempotency_key: null,
        request_fingerprint: null,
        source_type: 'blast',
        source_id: sourceId,
        ticket_id: null,
        whatsapp_instance_id: instanceIds[index % instanceIds.length],
        priority: BLAST_PRIORITY,
        recipient_phone_number: input.phoneNumber,
        recipient_chat_id: null,
        content: input.content,
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
      const { message, inserted } = await insertOutboundMessage(supabase, outboundMessage);
      trackedMessageIds.push(message.id);

      if (!inserted) continue;

      try {
        await queue.add('dispatch', buildJobData(message), {
          jobId: message.source_id,
          priority: message.priority,
          removeOnComplete: true,
          removeOnFail: true,
        });
        await incrementPendingOutboundCounts(redis, 'blast', null);
        queuedCount += 1;
      } catch (error) {
        failedCount += 1;
        await supabase
          .from('outbound_messages')
          .update({ delivery_status: 'failed', last_delivery_error: String(error.message || error).slice(0, 240), updated_at: new Date().toISOString() })
          .eq('id', message.id);
      }
    }

    const finishedAt = new Date().toISOString();
    await supabase
      .from('scheduled_blast_runs')
      .update({
        finished_at: finishedAt,
        status: failedCount > 0 ? 'partial' : 'queued',
        batch_id: requestId,
        total_recipients: outboundInputs.length,
        accepted_count: outboundInputs.length - failedCount,
        failed_count: failedCount,
        tracked_message_ids: trackedMessageIds,
      })
      .eq('id', run.id);

    await supabase
      .from('scheduled_blasts')
      .update({
        last_run_at: finishedAt,
        next_run_at: computeNextRunAt(schedule, scheduledFor),
        status: schedule.schedule_type === 'once' ? 'completed' : schedule.status,
        updated_at: finishedAt,
      })
      .eq('id', schedule.id);

    return { queuedCount, failedCount };
  } catch (error) {
    await supabase
      .from('scheduled_blast_runs')
      .update({ finished_at: new Date().toISOString(), status: 'failed', error_message: String(error.message || error).slice(0, 500) })
      .eq('id', run.id);
    throw error;
  }
}

async function runDueScheduledBlasts(supabase, limit = 5) {
  const queue = new Queue(OUTBOUND_DISPATCH_QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
  });
  const redis = createRedisConnection();

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('scheduled_blasts')
      .select('*')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('next_run_at', 'is', null)
      .lte('next_run_at', now)
      .order('next_run_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(`Failed to load due scheduled blasts: ${error.message}`);

    const instanceIds = await loadWhatsappInstanceIds(supabase);

    for (const schedule of data || []) {
      const scheduledFor = schedule.next_run_at;
      const { data: claimed, error: claimError } = await supabase
        .from('scheduled_blasts')
        .update({ next_run_at: null, updated_at: new Date().toISOString() })
        .eq('id', schedule.id)
        .eq('next_run_at', scheduledFor)
        .select('id')
        .maybeSingle();

      if (claimError || !claimed) continue;

      try {
        await runSchedule(supabase, queue, redis, schedule, instanceIds, scheduledFor);
      } catch (error) {
        console.error(`Failed to run scheduled blast ${schedule.id}: ${error instanceof Error ? error.message : String(error)}`);
        const nextRunAt = schedule.schedule_type === 'recurring' ? computeNextRunAt(schedule, scheduledFor) : scheduledFor;
        await supabase
          .from('scheduled_blasts')
          .update({ next_run_at: nextRunAt, updated_at: new Date().toISOString() })
          .eq('id', schedule.id);
      }
    }
  } finally {
    await queue.close();
    redis.disconnect();
  }
}

module.exports = {
  runDueScheduledBlasts,
};
