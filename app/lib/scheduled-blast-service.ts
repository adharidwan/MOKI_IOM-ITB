import 'server-only';

import { normalizeBlastMediaInput, type BlastMediaInput } from './blast-media';
import { getSupabaseAdminClient } from './supabase-server';
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

export async function listScheduledBlasts(input: ListScheduledBlastsInput = {}): Promise<ListScheduledBlastsResult> {
  const supabase = getSupabaseAdminClient();
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(100, Math.max(5, Number(input.pageSize || 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = String(input.search || '').trim();
  let query = supabase
    .from('scheduled_blasts')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (search) {
    const escapedSearch = search.replace(/[%_]/g, (value) => `\\${value}`);
    query = query.or(`name.ilike.%${escapedSearch}%,message_template.ilike.%${escapedSearch}%`);
  }

  if (input.status && input.status !== 'all') {
    query = query.eq('status', input.status);
  }

  if (input.source && input.source !== 'all') {
    query = query.eq('source_type', input.source);
  }

  if (input.scheduleType && input.scheduleType !== 'all') {
    query = query.eq('schedule_type', input.scheduleType);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Gagal memuat scheduled blast: ${error.message}`);
  }

  const records = (data || []) as ScheduledBlastRecord[];

  const items = await Promise.all(
    records.map(async (record) => {
      const [{ count }, { data: runs, error: runError }] = await Promise.all([
        supabase
          .from('scheduled_blast_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('scheduled_blast_id', record.id),
        supabase
          .from('scheduled_blast_runs')
          .select('*')
          .eq('scheduled_blast_id', record.id)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (runError) {
        throw new Error(`Gagal memuat histori scheduled blast: ${runError.message}`);
      }

      return toSummary(record, count || 0, ((runs || [])[0] as ScheduledBlastRunRecord | undefined) || null);
    }),
  );

  const total = count || 0;
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
  const supabase = getSupabaseAdminClient();
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
  const { data, error } = await supabase
    .from('scheduled_blasts')
    .insert({
      name: String(input.name || '').trim(),
      message_template: message,
      source_type: source,
      source_config: {
        groupNames,
        sourceFile: String(input.sourceFile || '').trim() || undefined,
        media: media || undefined,
      },
      schedule_type: scheduleType,
      recurrence_type: recurrenceType,
      timezone: String(input.timezone || 'Asia/Jakarta'),
      run_at: runAt,
      next_run_at: nextRunAt,
      status: input.status || 'active',
      save_to_group: Boolean(input.saveToGroup),
      save_group_name: input.saveToGroup ? String(input.saveGroupName || '').trim() : null,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan scheduled blast: ${error.message}`);
  }

  const record = data as ScheduledBlastRecord;

  if (source !== 'group') {
    const { error: recipientError } = await supabase.from('scheduled_blast_recipients').insert(
      recipients.map((recipient) => ({
        scheduled_blast_id: record.id,
        recipient_phone_number: recipient.no_telp,
        recipient_name: recipient.nama,
        recipient_group_names: recipient.group_names || [],
      })),
    );

    if (recipientError) {
      throw new Error(`Gagal menyimpan penerima scheduled blast: ${recipientError.message}`);
    }
  }

  return toSummary(record, source === 'group' ? 0 : recipients.length, null);
}

export async function updateScheduledBlast(id: string, input: SaveScheduledBlastInput): Promise<ScheduledBlastSummary> {
  validateScheduleInput(input, true);
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: loadError } = await supabase
    .from('scheduled_blasts')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (loadError) {
    throw new Error(`Scheduled blast tidak ditemukan: ${loadError.message}`);
  }

  const current = existing as ScheduledBlastRecord;
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

  const { data, error } = await supabase
    .from('scheduled_blasts')
    .update({
      name: input.name !== undefined ? String(input.name).trim() : current.name,
      message_template: input.message !== undefined ? String(input.message).trim() : current.message_template,
      source_type: source,
      source_config: {
        groupNames,
        sourceFile: input.sourceFile !== undefined ? String(input.sourceFile || '').trim() || undefined : currentSourceConfig.sourceFile || undefined,
        media: media || undefined,
      },
      schedule_type: scheduleType,
      recurrence_type: recurrenceType,
      timezone: input.timezone || current.timezone,
      run_at: runAt,
      next_run_at: nextRunAt,
      status: input.status || current.status,
      save_to_group: input.saveToGroup !== undefined ? Boolean(input.saveToGroup) : current.save_to_group,
      save_group_name: input.saveToGroup ? String(input.saveGroupName || '').trim() : input.saveToGroup === false ? null : current.save_group_name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Gagal memperbarui scheduled blast: ${error.message}`);
  }

  if (recipients) {
    await supabase.from('scheduled_blast_recipients').delete().eq('scheduled_blast_id', id);

    if (source !== 'group') {
      const { error: recipientError } = await supabase.from('scheduled_blast_recipients').insert(
        recipients.map((recipient) => ({
          scheduled_blast_id: id,
          recipient_phone_number: recipient.no_telp,
          recipient_name: recipient.nama,
          recipient_group_names: recipient.group_names || [],
        })),
      );

      if (recipientError) {
        throw new Error(`Gagal memperbarui penerima scheduled blast: ${recipientError.message}`);
      }
    }
  }

  const updated = data as ScheduledBlastRecord;
  const count = source === 'group' ? 0 : (recipients?.length ?? 0);
  return toSummary(updated, count, null);
}

export async function deleteScheduledBlast(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('scheduled_blasts')
    .update({
      status: 'cancelled',
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(`Gagal menghapus scheduled blast: ${error.message}`);
  }
}

async function loadScheduledRecipients(scheduledBlastId: string): Promise<BlastRecipientInput[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('scheduled_blast_recipients')
    .select('*')
    .eq('scheduled_blast_id', scheduledBlastId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Gagal memuat penerima scheduled blast: ${error.message}`);
  }

  return ((data || []) as ScheduledBlastRecipientRecord[]).map((recipient) => ({
    no_telp: String(recipient.recipient_phone_number || ''),
    nama: String(recipient.recipient_name || '').trim() || undefined,
    group_names: Array.isArray(recipient.recipient_group_names) ? recipient.recipient_group_names : [],
  }));
}

export async function runScheduledBlast(id: string, options: { force?: boolean; scheduledFor?: string } = {}) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('scheduled_blasts')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) {
    throw new Error(`Scheduled blast tidak ditemukan: ${error.message}`);
  }

  const schedule = data as ScheduledBlastRecord;
  if (!options.force && schedule.status !== 'active') {
    throw new Error('Scheduled blast tidak aktif.');
  }

  const scheduledFor = options.scheduledFor || schedule.next_run_at || new Date().toISOString();
  const { data: runData, error: runCreateError } = await supabase
    .from('scheduled_blast_runs')
    .insert({
      scheduled_blast_id: schedule.id,
      scheduled_for: scheduledFor,
      started_at: new Date().toISOString(),
      status: 'running',
    })
    .select('*')
    .single();

  if (runCreateError) {
    throw new Error(`Gagal mencatat eksekusi scheduled blast: ${runCreateError.message}`);
  }

  const run = runData as ScheduledBlastRunRecord;

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
    await supabase
      .from('scheduled_blast_runs')
      .update({
        finished_at: finishedAt,
        status: result.failedCount > 0 ? 'partial' : 'queued',
        batch_id: result.batchId,
        total_recipients: result.totalRecipients,
        accepted_count: result.acceptedCount,
        failed_count: result.failedCount,
        tracked_message_ids: result.trackedMessageIds,
      })
      .eq('id', run.id);

    const nextRunAt = schedule.schedule_type === 'recurring'
      ? computeNextRunAt({
          scheduleType: schedule.schedule_type,
          recurrenceType: schedule.recurrence_type,
          from: scheduledFor,
        })
      : null;

    await supabase
      .from('scheduled_blasts')
      .update({
        last_run_at: finishedAt,
        next_run_at: nextRunAt,
        status: schedule.schedule_type === 'once' ? 'completed' : schedule.status,
        updated_at: finishedAt,
      })
      .eq('id', schedule.id);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menjalankan scheduled blast.';
    const status = error instanceof BlastDispatchError && error.result?.failedCount ? 'partial' : 'failed';
    await supabase
      .from('scheduled_blast_runs')
      .update({
        finished_at: new Date().toISOString(),
        status,
        error_message: message,
      })
      .eq('id', run.id);

    throw error;
  }
}

export async function runDueScheduledBlasts(limit = 5) {
  const supabase = getSupabaseAdminClient();
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

  if (error) {
    throw new Error(`Gagal memuat scheduled blast yang jatuh tempo: ${error.message}`);
  }

  const results = [];
  for (const schedule of (data || []) as ScheduledBlastRecord[]) {
    const { data: claimed, error: claimError } = await supabase
      .from('scheduled_blasts')
      .update({ next_run_at: null, updated_at: new Date().toISOString() })
      .eq('id', schedule.id)
      .eq('next_run_at', schedule.next_run_at)
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) {
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

      await supabase
        .from('scheduled_blasts')
        .update({ next_run_at: nextRunAt, updated_at: new Date().toISOString() })
        .eq('id', schedule.id);

      results.push({
        id: schedule.id,
        success: false,
        error: runError instanceof Error ? runError.message : 'Gagal menjalankan scheduled blast.',
      });
    }
  }

  return results;
}
