import 'server-only';

import { normalizeBlastMediaInput, type BlastMediaInput } from './blast-media';
import { sql } from 'drizzle-orm';

import { db } from './db/client';
import {
  BlastDispatchError,
  dispatchBlastMessage,
  normalizeBlastRecipients,
  normalizeGroupNames,
  type BlastRecipientInput,
  type BlastSource,
} from './blast-dispatch-service';

export type ScheduledBlastStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type ScheduledBlastScheduleType = 'once' | 'recurring';
export type ScheduledBlastRecurrenceType = 'daily' | 'weekly' | 'monthly';

interface ScheduledBlastRecord {
  id: string;
  name: string;
  message_template: string;
  source_type: BlastSource;
  source_config: { groupNames?: string[]; sourceFile?: string; media?: BlastMediaInput | null } | null;
  schedule_type: ScheduledBlastScheduleType;
  recurrence_type: ScheduledBlastRecurrenceType | null;
  timezone: string;
  run_at: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  status: ScheduledBlastStatus;
  save_to_group: boolean;
  save_group_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ScheduledBlastRunRecord {
  id: string;
  scheduled_blast_id: string;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  status: 'running' | 'queued' | 'partial' | 'failed' | 'skipped';
  batch_id: string | null;
  total_recipients: number;
  accepted_count: number;
  failed_count: number;
  tracked_message_ids: string[];
  error_message: string | null;
  created_at: string;
}

interface ScheduledBlastRecipientRecord {
  recipient_phone_number: string;
  recipient_name: string | null;
  recipient_group_names: string[] | null;
}

function rowsFromResult<T>(result: { rows?: unknown[] }): T[] {
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}

function firstRowFromResult<T>(result: { rows?: unknown[] }): T | null {
  return rowsFromResult<T>(result)[0] ?? null;
}

export interface ScheduledBlastSummary {
  id: string;
  name: string;
  message: string;
  source: BlastSource;
  groupNames: string[];
  sourceFile: string | null;
  scheduleType: ScheduledBlastScheduleType;
  recurrenceType: ScheduledBlastRecurrenceType | null;
  timezone: string;
  runAt: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  status: ScheduledBlastStatus;
  saveToGroup: boolean;
  saveGroupName: string | null;
  recipientCount: number;
  lastRun: ScheduledBlastRunRecord | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListScheduledBlastsInput {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ScheduledBlastStatus | 'all';
  source?: BlastSource | 'all';
  scheduleType?: ScheduledBlastScheduleType | 'all';
}

export interface ListScheduledBlastsResult {
  items: ScheduledBlastSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SaveScheduledBlastInput {
  name?: string;
  message?: string;
  source?: BlastSource;
  recipients?: BlastRecipientInput[];
  groupNames?: string[];
  sourceFile?: string;
  scheduleType?: ScheduledBlastScheduleType;
  recurrenceType?: ScheduledBlastRecurrenceType | null;
  runAt?: string | null;
  timezone?: string;
  status?: ScheduledBlastStatus;
  saveToGroup?: boolean;
  saveGroupName?: string;
  media?: BlastMediaInput | null;
}

function parseSourceConfig(value: ScheduledBlastRecord['source_config']) {
  return {
    groupNames: normalizeGroupNames(Array.isArray(value?.groupNames) ? value.groupNames : []),
    sourceFile: String(value?.sourceFile || '').trim() || null,
    media: normalizeBlastMediaInput(value?.media || null),
  };
}

function toSummary(
  record: ScheduledBlastRecord,
  recipientCount: number,
  lastRun: ScheduledBlastRunRecord | null,
): ScheduledBlastSummary {
  const sourceConfig = parseSourceConfig(record.source_config);

  return {
    id: record.id,
    name: record.name,
    message: record.message_template,
    source: record.source_type,
    groupNames: sourceConfig.groupNames,
    sourceFile: sourceConfig.sourceFile,
    scheduleType: record.schedule_type,
    recurrenceType: record.recurrence_type,
    timezone: record.timezone,
    runAt: record.run_at,
    nextRunAt: record.next_run_at,
    lastRunAt: record.last_run_at,
    status: record.status,
    saveToGroup: record.save_to_group,
    saveGroupName: record.save_group_name,
    recipientCount,
    lastRun,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function addRecurrence(date: Date, recurrenceType: ScheduledBlastRecurrenceType): Date {
  const nextDate = new Date(date.getTime());

  if (recurrenceType === 'daily') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  } else if (recurrenceType === 'weekly') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  } else {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  }

  return nextDate;
}

export function computeNextRunAt(input: {
  scheduleType: ScheduledBlastScheduleType;
  runAt?: string | null;
  recurrenceType?: ScheduledBlastRecurrenceType | null;
  from?: string | null;
  now?: Date;
}): string | null {
  const now = input.now || new Date();

  if (input.scheduleType === 'once') {
    const runAt = input.runAt ? new Date(input.runAt) : null;
    return runAt && Number.isFinite(runAt.getTime()) ? runAt.toISOString() : null;
  }

  if (!input.recurrenceType) {
    return null;
  }

  const from = input.from ? new Date(input.from) : now;
  if (Number.isFinite(from.getTime()) && from.getTime() > now.getTime()) {
    return from.toISOString();
  }

  let nextRunAt = Number.isFinite(from.getTime()) ? addRecurrence(from, input.recurrenceType) : addRecurrence(now, input.recurrenceType);

  while (nextRunAt.getTime() <= now.getTime()) {
    nextRunAt = addRecurrence(nextRunAt, input.recurrenceType);
  }

  return nextRunAt.toISOString();
}

function validateScheduleInput(input: SaveScheduledBlastInput, partial = false): void {
  if (!partial || input.name !== undefined) {
    if (!String(input.name || '').trim()) {
      throw new Error('Nama schedule wajib diisi.');
    }
  }

  if (!partial || input.message !== undefined) {
    if (!String(input.message || '').trim() && !input.media) {
      throw new Error('Pesan atau image schedule wajib diisi.');
    }
  }

  if (!partial || input.scheduleType !== undefined || input.runAt !== undefined || input.recurrenceType !== undefined) {
    if (input.scheduleType === 'once' && !input.runAt) {
      throw new Error('Waktu kirim wajib diisi untuk schedule sekali jalan.');
    }

    if (input.scheduleType === 'recurring' && !input.recurrenceType) {
      throw new Error('Pola pengulangan wajib diisi untuk schedule periodik.');
    }
  }
}

async function insertScheduledRecipients(
  scheduledBlastId: string,
  recipients: BlastRecipientInput[],
): Promise<void> {
  if (!recipients.length) {
    return;
  }

  await db.execute(sql`
    insert into public.scheduled_blast_recipients (
      scheduled_blast_id,
      recipient_phone_number,
      recipient_name,
      recipient_group_names
    )
    select
      ${scheduledBlastId}::uuid,
      recipient_phone_number,
      recipient_name,
      recipient_group_names
    from jsonb_to_recordset(${JSON.stringify(recipients.map((recipient) => ({
      recipient_phone_number: recipient.no_telp,
      recipient_name: recipient.nama || null,
      recipient_group_names: recipient.group_names || [],
    })))}::jsonb) as input(
      recipient_phone_number text,
      recipient_name text,
      recipient_group_names text[]
    )
  `);
}

export async function listScheduledBlasts(input: ListScheduledBlastsInput = {}): Promise<ListScheduledBlastsResult> {
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(100, Math.max(5, Number(input.pageSize || 10)));
  const offset = (page - 1) * pageSize;
  const search = String(input.search || '').trim();
  const result = await db.execute(sql`
    select *, count(*) over ()::integer as total_count
    from public.scheduled_blasts
    where deleted_at is null
      and (${search || null}::text is null or name ilike ${`%${search}%`} or message_template ilike ${`%${search}%`})
      and (${input.status && input.status !== 'all' ? input.status : null}::text is null or status = ${input.status && input.status !== 'all' ? input.status : null})
      and (${input.source && input.source !== 'all' ? input.source : null}::text is null or source_type = ${input.source && input.source !== 'all' ? input.source : null})
      and (${input.scheduleType && input.scheduleType !== 'all' ? input.scheduleType : null}::text is null or schedule_type = ${input.scheduleType && input.scheduleType !== 'all' ? input.scheduleType : null})
    order by created_at desc
    limit ${pageSize}
    offset ${offset}
  `);

  const records = rowsFromResult<ScheduledBlastRecord & { total_count?: number }>(result);

  const items = await Promise.all(
    records.map(async (record) => {
      const [recipientCountResult, runsResult] = await Promise.all([
        db.execute(sql`
          select count(*)::integer as count
          from public.scheduled_blast_recipients
          where scheduled_blast_id = ${record.id}
        `),
        db.execute(sql`
          select *
          from public.scheduled_blast_runs
          where scheduled_blast_id = ${record.id}
          order by created_at desc
          limit 1
        `),
      ]);

      return toSummary(
        record,
        Number(firstRowFromResult<{ count: number }>(recipientCountResult)?.count || 0),
        firstRowFromResult<ScheduledBlastRunRecord>(runsResult),
      );
    }),
  );

  const total = Number(records[0]?.total_count || 0);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createScheduledBlast(input: SaveScheduledBlastInput): Promise<ScheduledBlastSummary> {
  validateScheduleInput(input);
  const source = input.source || 'manual';
  const message = String(input.message || '').trim();
  const scheduleType = input.scheduleType || 'once';
  const recurrenceType = scheduleType === 'recurring' ? input.recurrenceType || 'daily' : null;
  const runAt = input.runAt ? new Date(String(input.runAt)).toISOString() : null;
  const nextRunAt = computeNextRunAt({ scheduleType, runAt, recurrenceType, from: runAt || undefined });
  const groupNames = normalizeGroupNames(Array.isArray(input.groupNames) ? input.groupNames : []);
  const recipients = normalizeBlastRecipients(Array.isArray(input.recipients) ? input.recipients : []);
  const media = normalizeBlastMediaInput(input.media);

  if (source === 'group' && !groupNames.length) {
    throw new Error('Pilih minimal satu grup penerima.');
  }

  if (source !== 'group' && !recipients.length) {
    throw new Error('Tidak ada nomor tujuan valid untuk schedule.');
  }

  const now = new Date().toISOString();
  const sourceConfig = {
    groupNames,
    sourceFile: String(input.sourceFile || '').trim() || undefined,
    media: media || undefined,
  };
  const result = await db.execute(sql`
    insert into public.scheduled_blasts (
      name,
      message_template,
      source_type,
      source_config,
      schedule_type,
      recurrence_type,
      timezone,
      run_at,
      next_run_at,
      status,
      save_to_group,
      save_group_name,
      created_at,
      updated_at
    )
    values (
      ${String(input.name || '').trim()},
      ${message},
      ${source},
      ${JSON.stringify(sourceConfig)}::jsonb,
      ${scheduleType},
      ${recurrenceType},
      ${String(input.timezone || 'Asia/Jakarta')},
      ${runAt},
      ${nextRunAt},
      ${input.status || 'active'},
      ${Boolean(input.saveToGroup)},
      ${input.saveToGroup ? String(input.saveGroupName || '').trim() : null},
      ${now},
      ${now}
    )
    returning *
  `);

  const record = firstRowFromResult<ScheduledBlastRecord>(result)!;

  if (source !== 'group') {
    await insertScheduledRecipients(record.id, recipients);
  }

  return toSummary(record, source === 'group' ? 0 : recipients.length, null);
}

export async function updateScheduledBlast(id: string, input: SaveScheduledBlastInput): Promise<ScheduledBlastSummary> {
  validateScheduleInput(input, true);
  const loadResult = await db.execute(sql`
    select *
    from public.scheduled_blasts
    where id = ${id}
      and deleted_at is null
    limit 1
  `);
  const existing = firstRowFromResult<ScheduledBlastRecord>(loadResult);

  if (!existing) {
    throw new Error('Scheduled blast tidak ditemukan.');
  }

  const current = existing;
  const scheduleType = input.scheduleType || current.schedule_type;
  const recurrenceType = scheduleType === 'recurring' ? input.recurrenceType || current.recurrence_type || 'daily' : null;
  const runAt = input.runAt ? new Date(input.runAt).toISOString() : current.run_at;
  const nextRunAt = input.status === 'paused' || input.status === 'cancelled'
    ? current.next_run_at
    : computeNextRunAt({ scheduleType, runAt, recurrenceType, from: runAt || current.next_run_at });
  const source = input.source || current.source_type;
  const currentSourceConfig = parseSourceConfig(current.source_config);
  const groupNames = input.groupNames ? normalizeGroupNames(input.groupNames) : currentSourceConfig.groupNames;
  const recipients = input.recipients ? normalizeBlastRecipients(input.recipients) : null;
  const media = input.media !== undefined ? normalizeBlastMediaInput(input.media) : currentSourceConfig.media;

  if (source === 'group' && !groupNames.length) {
    throw new Error('Pilih minimal satu grup penerima.');
  }

  if (source !== 'group' && recipients && !recipients.length) {
    throw new Error('Tidak ada nomor tujuan valid untuk schedule.');
  }

  const sourceConfig = {
    groupNames,
    sourceFile: input.sourceFile !== undefined ? String(input.sourceFile || '').trim() || undefined : currentSourceConfig.sourceFile || undefined,
    media: media || undefined,
  };
  const updateResult = await db.execute(sql`
    update public.scheduled_blasts
    set
      name = ${input.name !== undefined ? String(input.name).trim() : current.name},
      message_template = ${input.message !== undefined ? String(input.message).trim() : current.message_template},
      source_type = ${source},
      source_config = ${JSON.stringify(sourceConfig)}::jsonb,
      schedule_type = ${scheduleType},
      recurrence_type = ${recurrenceType},
      timezone = ${input.timezone || current.timezone},
      run_at = ${runAt},
      next_run_at = ${nextRunAt},
      status = ${input.status || current.status},
      save_to_group = ${input.saveToGroup !== undefined ? Boolean(input.saveToGroup) : current.save_to_group},
      save_group_name = ${input.saveToGroup ? String(input.saveGroupName || '').trim() : input.saveToGroup === false ? null : current.save_group_name},
      updated_at = ${new Date().toISOString()}
    where id = ${id}
    returning *
  `);

  if (recipients) {
    await db.execute(sql`delete from public.scheduled_blast_recipients where scheduled_blast_id = ${id}`);

    if (source !== 'group') {
      await insertScheduledRecipients(id, recipients);
    }
  }

  const updated = firstRowFromResult<ScheduledBlastRecord>(updateResult)!;
  const count = source === 'group' ? 0 : (recipients?.length ?? 0);
  return toSummary(updated, count, null);
}

export async function deleteScheduledBlast(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(sql`
    update public.scheduled_blasts
    set status = 'cancelled', deleted_at = ${now}, updated_at = ${now}
    where id = ${id}
  `);
}

async function loadScheduledRecipients(scheduledBlastId: string): Promise<BlastRecipientInput[]> {
  const result = await db.execute(sql`
    select *
    from public.scheduled_blast_recipients
    where scheduled_blast_id = ${scheduledBlastId}
    order by created_at asc
  `);

  return rowsFromResult<ScheduledBlastRecipientRecord>(result).map((recipient) => ({
    no_telp: String(recipient.recipient_phone_number || ''),
    nama: String(recipient.recipient_name || '').trim() || undefined,
    group_names: Array.isArray(recipient.recipient_group_names) ? recipient.recipient_group_names : [],
  }));
}

export async function runScheduledBlast(id: string, options: { force?: boolean; scheduledFor?: string } = {}) {
  const loadResult = await db.execute(sql`
    select *
    from public.scheduled_blasts
    where id = ${id}
      and deleted_at is null
    limit 1
  `);
  const schedule = firstRowFromResult<ScheduledBlastRecord>(loadResult);

  if (!schedule) {
    throw new Error('Scheduled blast tidak ditemukan.');
  }

  if (!options.force && schedule.status !== 'active') {
    throw new Error('Scheduled blast tidak aktif.');
  }

  const scheduledFor = options.scheduledFor || schedule.next_run_at || new Date().toISOString();
  const runResult = await db.execute(sql`
    insert into public.scheduled_blast_runs (
      scheduled_blast_id,
      scheduled_for,
      started_at,
      status
    )
    values (${schedule.id}, ${scheduledFor}, ${new Date().toISOString()}, 'running')
    returning *
  `);

  const run = firstRowFromResult<ScheduledBlastRunRecord>(runResult)!;

  try {
    const sourceConfig = parseSourceConfig(schedule.source_config);
    const recipients = schedule.source_type === 'group' ? [] : await loadScheduledRecipients(schedule.id);
    const result = await dispatchBlastMessage({
      message: schedule.message_template,
      source: schedule.source_type,
      recipients,
      groupNames: sourceConfig.groupNames,
      saveToGroup: schedule.save_to_group,
      groupName: schedule.save_group_name || undefined,
      sourceFile: sourceConfig.sourceFile || `scheduled-blast-${schedule.id}`,
      media: sourceConfig.media,
    });

    const finishedAt = new Date().toISOString();
    await db.execute(sql`
      update public.scheduled_blast_runs
      set
        finished_at = ${finishedAt},
        status = ${result.failedCount > 0 ? 'partial' : 'queued'},
        batch_id = ${result.batchId},
        total_recipients = ${result.totalRecipients},
        accepted_count = ${result.acceptedCount},
        failed_count = ${result.failedCount},
        tracked_message_ids = ${result.trackedMessageIds}::text[]
      where id = ${run.id}
    `);

    const nextRunAt = schedule.schedule_type === 'recurring'
      ? computeNextRunAt({
          scheduleType: schedule.schedule_type,
          recurrenceType: schedule.recurrence_type,
          from: scheduledFor,
        })
      : null;

    await db.execute(sql`
      update public.scheduled_blasts
      set
        last_run_at = ${finishedAt},
        next_run_at = ${nextRunAt},
        status = ${schedule.schedule_type === 'once' ? 'completed' : schedule.status},
        updated_at = ${finishedAt}
      where id = ${schedule.id}
    `);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menjalankan scheduled blast.';
    const status = error instanceof BlastDispatchError && error.result?.failedCount ? 'partial' : 'failed';
    await db.execute(sql`
      update public.scheduled_blast_runs
      set
        finished_at = ${new Date().toISOString()},
        status = ${status},
        error_message = ${message}
      where id = ${run.id}
    `);

    throw error;
  }
}

export async function runDueScheduledBlasts(limit = 5) {
  const now = new Date().toISOString();
  const dueResult = await db.execute(sql`
    select *
    from public.scheduled_blasts
    where status = 'active'
      and deleted_at is null
      and next_run_at is not null
      and next_run_at <= ${now}
    order by next_run_at asc
    limit ${limit}
  `);

  const results = [];
  for (const schedule of rowsFromResult<ScheduledBlastRecord>(dueResult)) {
    const claimResult = await db.execute(sql`
      update public.scheduled_blasts
      set next_run_at = null, updated_at = ${new Date().toISOString()}
      where id = ${schedule.id}
        and next_run_at = ${schedule.next_run_at}
      returning id
    `);
    const claimed = firstRowFromResult<{ id: string }>(claimResult);

    if (!claimed) {
      continue;
    }

    try {
      const result = await runScheduledBlast(schedule.id, { scheduledFor: schedule.next_run_at || undefined });
      results.push({ id: schedule.id, success: true, result });
    } catch (runError) {
      const nextRunAt = schedule.schedule_type === 'recurring'
        ? computeNextRunAt({
            scheduleType: schedule.schedule_type,
            recurrenceType: schedule.recurrence_type,
            from: schedule.next_run_at,
          })
        : schedule.next_run_at;

      await db.execute(sql`
        update public.scheduled_blasts
        set next_run_at = ${nextRunAt}, updated_at = ${new Date().toISOString()}
        where id = ${schedule.id}
      `);

      results.push({
        id: schedule.id,
        success: false,
        error: runError instanceof Error ? runError.message : 'Gagal menjalankan scheduled blast.',
      });
    }
  }

  return results;
}
