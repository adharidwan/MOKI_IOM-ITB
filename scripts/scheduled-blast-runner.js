/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('crypto');
const { Queue } = require('bullmq');
const { query } = require('./postgres-client.js');

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
    media_bucket: message.media_bucket || null,
    media_path: message.media_path || null,
    media_mime_type: message.media_mime_type || null,
    media_file_name: message.media_file_name || null,
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

async function loadRecipients(schedule) {
  if (schedule.source_type === 'group') {
    const groupNames = normalizeGroupNames(schedule.source_config?.groupNames || []);
    const { rows } = await query(
      `
        select no_telp, nama, group_names
        from public.csv_contacts
        where $1::text[] && group_names
        order by created_at asc
      `,
      [groupNames],
    );

    return normalizeRecipients(rows);
  }

  const { rows } = await query(
    `
      select *
      from public.scheduled_blast_recipients
      where scheduled_blast_id = $1
      order by created_at asc
    `,
    [schedule.id],
  );

  return normalizeRecipients(rows);
}

async function insertOutboundMessage(message) {
  const { rows } = await query(
    `
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25
      )
      on conflict (source_type, source_id) do nothing
      returning *
    `,
    [
      message.id,
      message.client_id,
      message.idempotency_key,
      message.request_fingerprint,
      message.source_type,
      message.source_id,
      message.ticket_id,
      message.whatsapp_instance_id,
      message.priority,
      message.recipient_phone_number,
      message.recipient_chat_id,
      message.content,
      message.media_bucket,
      message.media_path,
      message.media_mime_type,
      message.media_file_name,
      message.client_reference,
      message.delivery_status,
      message.delivery_attempts,
      message.next_retry_at,
      message.last_delivery_error,
      message.whatsapp_message_id,
      message.delivered_at,
      message.created_at,
      message.updated_at,
    ],
  );

  if (rows[0]) {
    return { message: rows[0], inserted: true };
  }

  const existing = await query(
    `
      select *
      from public.outbound_messages
      where source_type = $1 and source_id = $2
      limit 1
    `,
    [message.source_type, message.source_id],
  );

  if (!existing.rows[0]) {
    throw new Error('Failed to reload scheduled blast outbound message: missing row');
  }

  return { message: existing.rows[0], inserted: false };
}

async function loadWhatsappInstanceIds() {
  const { rows } = await query(
    `
      select id
      from public.whatsapp_instances
      where is_enabled = true
      order by id asc
    `,
  );

  return rows.map((instance) => String(instance.id || '').trim()).filter(Boolean);
}

async function runSchedule(queue, redis, schedule, instanceIds, scheduledFor) {
  const startedAt = new Date().toISOString();
  const runResult = await query(
    `
      insert into public.scheduled_blast_runs (scheduled_blast_id, scheduled_for, started_at, status)
      values ($1, $2, $3, 'running')
      returning *
    `,
    [schedule.id, scheduledFor, startedAt],
  );
  const run = runResult.rows[0];

  if (!run) throw new Error('Failed to create scheduled blast run.');

  try {
    const recipients = await loadRecipients(schedule);
    if (!recipients.length) throw new Error('Scheduled blast has no valid recipients.');
    if (!instanceIds.length) throw new Error('No enabled WhatsApp instance is available for scheduled blast.');

    const personalized = String(schedule.message_template || '').includes('{{');
    const media = schedule.source_config?.media || null;
    const outboundInputs = recipients.map((recipient) => ({
      phoneNumber: recipient.no_telp,
      content: personalized ? renderBlastMessageTemplate(schedule.message_template, recipient) : schedule.message_template,
    }));
    const requestId = buildRequestId(schedule.id, scheduledFor, schedule.message_template, {
      recipients: outboundInputs.map((input) => input.phoneNumber).sort(),
      media,
    });
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
      };
      const { message, inserted } = await insertOutboundMessage(outboundMessage);
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
        await query(
          `
            update public.outbound_messages
            set delivery_status = 'failed',
                last_delivery_error = $2,
                updated_at = $3
            where id = $1
          `,
          [message.id, String(error.message || error).slice(0, 240), new Date().toISOString()],
        );
      }
    }

    const finishedAt = new Date().toISOString();
    await query(
      `
        update public.scheduled_blast_runs
        set finished_at = $2,
            status = $3,
            batch_id = $4,
            total_recipients = $5,
            accepted_count = $6,
            failed_count = $7,
            tracked_message_ids = $8
        where id = $1
      `,
      [
        run.id,
        finishedAt,
        failedCount > 0 ? 'partial' : 'queued',
        requestId,
        outboundInputs.length,
        outboundInputs.length - failedCount,
        failedCount,
        trackedMessageIds,
      ],
    );

    await query(
      `
        update public.scheduled_blasts
        set last_run_at = $2,
            next_run_at = $3,
            status = $4,
            updated_at = $2
        where id = $1
      `,
      [
        schedule.id,
        finishedAt,
        computeNextRunAt(schedule, scheduledFor),
        schedule.schedule_type === 'once' ? 'completed' : schedule.status,
      ],
    );

    return { queuedCount, failedCount };
  } catch (error) {
    await query(
      `
        update public.scheduled_blast_runs
        set finished_at = $2,
            status = 'failed',
            error_message = $3
        where id = $1
      `,
      [run.id, new Date().toISOString(), String(error.message || error).slice(0, 500)],
    );
    throw error;
  }
}

async function runDueScheduledBlasts(limit = 5) {
  const queue = new Queue(OUTBOUND_DISPATCH_QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
  });
  const redis = createRedisConnection();

  try {
    const now = new Date().toISOString();
    const { rows: schedules } = await query(
      `
        select *
        from public.scheduled_blasts
        where status = 'active'
          and deleted_at is null
          and next_run_at is not null
          and next_run_at <= $1
        order by next_run_at asc
        limit $2
      `,
      [now, limit],
    );

    const instanceIds = await loadWhatsappInstanceIds();

    for (const schedule of schedules) {
      const scheduledFor = schedule.next_run_at;
      const claimed = await query(
        `
          update public.scheduled_blasts
          set next_run_at = null, updated_at = $3
          where id = $1 and next_run_at = $2
          returning id
        `,
        [schedule.id, scheduledFor, new Date().toISOString()],
      );

      if (!claimed.rows[0]) continue;

      try {
        await runSchedule(queue, redis, schedule, instanceIds, scheduledFor);
      } catch (error) {
        console.error(`Failed to run scheduled blast ${schedule.id}: ${error instanceof Error ? error.message : String(error)}`);
        const nextRunAt = schedule.schedule_type === 'recurring' ? computeNextRunAt(schedule, scheduledFor) : scheduledFor;
        await query(
          `
            update public.scheduled_blasts
            set next_run_at = $2, updated_at = $3
            where id = $1
          `,
          [schedule.id, nextRunAt, new Date().toISOString()],
        );
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
