import 'server-only';

import { getSupabaseServerClient, getSupabaseAdminClient } from './supabase-server';
import { Ticket, Reply, TicketWithReplies, CsvContact, ContentRecording, ContentRecordingPlatform, ContentRecordingType, ContentTag } from './types';
import { createTicketReplyOutboundMessage } from './whatsapp-notification-repository';

interface GetTicketsParams {
  page?: number;
  search?: string;
  sort?: string;
  sortDir?: SortDirection;
  pageSize?: number;
  instanceId?: string;
}

interface GetTicketsResponse {
  tickets: TicketWithReplies[];
  total: number;
}

export interface CsvContactInput {
  no_telp: string;
  nama: string;
  jenis_kelamin: string;
  jabatan?: string;
  group_names?: string[];
}

export interface CsvContactGroupSyncInput {
  contacts: CsvContactInput[];
  groupNames: string[];
  sourceFile?: string;
}

export interface ContentRecordingInput {
  id?: string | null;
  title: string;
  platform: ContentRecordingPlatform;
  caption?: string | null;
  description?: string | null;
  content_type?: ContentRecordingType | null;
  upload_date: string;
  link: string;
  source_post_id?: string | null;
  thumbnail_url?: string | null;
  tag_ids?: string[];
}

export type ContentRecordingSortKey = 'title' | 'platform' | 'content_type' | 'upload_date' | 'created_at' | 'updated_at';

export interface PaginatedContentRecordingsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  platform?: string;
  contentType?: string;
  tagId?: string;
  sortBy?: string;
  sortDir?: SortDirection;
}

export interface PaginatedContentRecordingsResponse {
  items: ContentRecording[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ContentRecordingsOverview {
  totalRecords: number;
  platformCount: number;
  thisMonthCount: number;
  untaggedCount: number;
}

export interface PaginatedCsvContactsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  groupName?: string;
  sortBy?: CsvContactSortKey;
  sortDir?: SortDirection;
}

export interface PaginatedCsvContactsResponse {
  items: CsvContact[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CsvContactsOverview {
  totalContacts: number;
  ungroupedContacts: number;
}

export type SortDirection = 'asc' | 'desc';

export type CsvContactSortKey = 'imported_at' | 'nama' | 'no_telp' | 'status';

type TicketSortKey = 'updated_at' | 'status' | 'subject' | 'id';
const CONTENT_RECORDING_SORT_KEYS: ContentRecordingSortKey[] = ['title', 'platform', 'content_type', 'upload_date', 'created_at', 'updated_at'];

const DEFAULT_CONTACT_SORT_BY: CsvContactSortKey = 'imported_at';
const DEFAULT_CONTACT_SORT_DIR: SortDirection = 'desc';
const DEFAULT_TICKET_SORT_BY: TicketSortKey = 'updated_at';
const DEFAULT_TICKET_SORT_DIR: SortDirection = 'desc';

function normalizeGroupNames(values: string[] | null | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  (values || []).forEach((value) => {
    const groupName = value.trim();

    if (!groupName) {
      return;
    }

    const dedupeKey = groupName.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    normalized.push(groupName);
  });

  return normalized;
}

function extractGroupNames(record: Record<string, unknown>): string[] {
  const directValues = Array.isArray(record.group_names)
    ? record.group_names.filter((value): value is string => typeof value === 'string')
    : [];
  const legacyValue = typeof record.group_name === 'string' && record.group_name.trim()
    ? [record.group_name]
    : [];

  return normalizeGroupNames([...directValues, ...legacyValue]);
}

function toCsvContact(record: Record<string, unknown>): CsvContact {
  return {
    id: String(record.id || ''),
    no_telp: String(record.no_telp || ''),
    nama: String(record.nama || ''),
    jenis_kelamin: String(record.jenis_kelamin || ''),
    jabatan: record.jabatan === null || record.jabatan === undefined ? null : String(record.jabatan),
    group_names: extractGroupNames(record),
    source_file: record.source_file === null || record.source_file === undefined
      ? null
      : String(record.source_file),
    imported_at: String(record.imported_at || ''),
    created_at: String(record.created_at || ''),
  };
}

function toContentRecording(record: Record<string, unknown>): ContentRecording {
  return {
    id: String(record.id || ''),
    title: String(record.title || ''),
    platform: String(record.platform || '') as ContentRecordingPlatform,
    caption:
      record.caption === null || record.caption === undefined
        ? null
        : String(record.caption),
    description:
      record.description === null || record.description === undefined
        ? null
        : String(record.description),
    content_type:
      record.content_type === null || record.content_type === undefined
        ? null
        : (String(record.content_type) as ContentRecordingType),
    upload_date: String(record.upload_date || ''),
    link: String(record.link || ''),
    source_post_id:
      record.source_post_id === null || record.source_post_id === undefined
        ? null
        : String(record.source_post_id),
    thumbnail_url:
      record.thumbnail_url === null || record.thumbnail_url === undefined
        ? null
        : String(record.thumbnail_url),
    tags: toContentTags(record.tags),
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || ''),
  };
}

function toContentTags(value: unknown): ContentTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = (entry || {}) as Record<string, unknown>;
      return {
        id: String(record.id || ''),
        name: String(record.name || ''),
        created_at: record.created_at === undefined ? undefined : String(record.created_at || ''),
      };
    })
    .filter((tag) => tag.id && tag.name);
}

function normalizeContentRecordingSortKey(value: string | undefined): ContentRecordingSortKey {
  return CONTENT_RECORDING_SORT_KEYS.includes(value as ContentRecordingSortKey)
    ? value as ContentRecordingSortKey
    : 'upload_date';
}

function toReply(record: Record<string, unknown>): Reply {
  return {
    id: String(record.id || ''),
    ticket_id: String(record.ticket_id || ''),
    author: String(record.author || ''),
    content: String(record.content || ''),
    sender_type: record.sender_type === 'admin' || record.sender_type === 'system' ? record.sender_type : 'customer',
    delivery_status:
      record.delivery_status === 'queued' ||
      record.delivery_status === 'retrying' ||
      record.delivery_status === 'sent' ||
      record.delivery_status === 'failed' ||
      record.delivery_status === 'not_applicable'
        ? record.delivery_status
        : 'pending',
    delivery_attempts: Number(record.delivery_attempts || 0),
    next_retry_at: record.next_retry_at === null || record.next_retry_at === undefined ? null : String(record.next_retry_at),
    last_delivery_error: record.last_delivery_error === null || record.last_delivery_error === undefined ? null : String(record.last_delivery_error),
    whatsapp_message_id: record.whatsapp_message_id === null || record.whatsapp_message_id === undefined ? null : String(record.whatsapp_message_id),
    delivered_at: record.delivered_at === null || record.delivered_at === undefined ? null : String(record.delivered_at),
    created_at: String(record.created_at || ''),
  };
}

function toTicketWithReplies(record: Record<string, unknown>): TicketWithReplies {
  const replies = Array.isArray(record.replies)
    ? record.replies.map((reply) => toReply((reply || {}) as Record<string, unknown>))
    : [];

  return {
    id: String(record.id || ''),
    subject: String(record.subject || ''),
    description: record.description === null || record.description === undefined ? null : String(record.description),
    status:
      record.status === 'In Progress' || record.status === 'Resolved' || record.status === 'Closed'
        ? record.status
        : 'Open',
    user_email: record.user_email === null || record.user_email === undefined ? null : String(record.user_email),
    channel: record.channel === null || record.channel === undefined ? null : String(record.channel),
    phone_number: record.phone_number === null || record.phone_number === undefined ? null : String(record.phone_number),
    whatsapp_chat_id: record.whatsapp_chat_id === null || record.whatsapp_chat_id === undefined ? null : String(record.whatsapp_chat_id),
    whatsapp_instance_id: record.whatsapp_instance_id === null || record.whatsapp_instance_id === undefined ? null : String(record.whatsapp_instance_id),
    created_at: String(record.created_at || ''),
    updated_at: record.updated_at === null || record.updated_at === undefined ? null : String(record.updated_at),
    replies,
  };
}

function normalizeSortDirection(sortDir: string | undefined, fallback: SortDirection): SortDirection {
  return sortDir === 'asc' || sortDir === 'desc' ? sortDir : fallback;
}

function normalizeCsvContactSortKey(sortBy: string | undefined): CsvContactSortKey {
  if (sortBy === 'nama' || sortBy === 'no_telp' || sortBy === 'status' || sortBy === 'imported_at') {
    return sortBy;
  }

  return DEFAULT_CONTACT_SORT_BY;
}

function normalizeTicketSortKey(sortBy: string | undefined): TicketSortKey {
  if (sortBy === 'id' || sortBy === 'status' || sortBy === 'subject' || sortBy === 'updated_at' || sortBy === 'created_at') {
    return sortBy === 'created_at' ? 'updated_at' : sortBy;
  }

  return DEFAULT_TICKET_SORT_BY;
}

export async function getCsvContactsByPhoneNumbers(phoneNumbers: string[]): Promise<CsvContact[]> {
  const normalizedPhoneNumbers = Array.from(
    new Set(
      phoneNumbers
        .map((phoneNumber) => String(phoneNumber || '').trim())
        .filter((phoneNumber) => phoneNumber.length > 0),
    ),
  );

  if (!normalizedPhoneNumbers.length) {
    return [];
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('csv_contacts')
    .select('*')
    .in('no_telp', normalizedPhoneNumbers);

  if (error) {
    throw new Error(`Failed to fetch contacts by phone number: ${error.message}`);
  }

  return (data || []).map((record) => toCsvContact(record as Record<string, unknown>));
}

export async function getTickets({ 
  page = 1, 
  search = '', 
  sort = DEFAULT_TICKET_SORT_BY,
  sortDir = DEFAULT_TICKET_SORT_DIR,
  pageSize = 10,
  instanceId,
}: GetTicketsParams): Promise<GetTicketsResponse> {
  const supabase = getSupabaseServerClient();
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const normalizedSort = normalizeTicketSortKey(sort);
  const normalizedSortDir = normalizeSortDirection(sortDir, DEFAULT_TICKET_SORT_DIR);
  const { data, error } = await supabase.rpc('list_tickets', {
    p_search: search.trim() || null,
    p_instance_id: instanceId || null,
    p_page: safePage,
    p_page_size: safePageSize,
    p_sort_by: normalizedSort,
    p_sort_dir: normalizedSortDir,
  });

  if (error) {
    throw new Error(`Failed to fetch tickets: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];

  return {
    tickets: rows.map((row) => toTicketWithReplies(row as Record<string, unknown>)),
    total: Number(rows[0]?.total_count || 0),
  };
}

// Fetch a single ticket by ID with its replies
export async function getTicketById(id: string): Promise<TicketWithReplies> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('tickets')
    .select('*, replies(*)')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Ticket not found: ${error.message}`);
  }

  return data as TicketWithReplies;
}

// Create a new ticket
export async function createTicket(ticket: Omit<Ticket, 'id' | 'created_at'>): Promise<Ticket> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('tickets')
    .insert(ticket)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create ticket: ${error.message}`);
  }

  return data as Ticket;
}

// Update a ticket's status
export async function updateTicketStatus(id: string, status: Ticket['status']): Promise<Ticket> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update ticket: ${error.message}`);
  }

  return data as Ticket;
}

// Add a reply to a ticket
export async function addReply(ticketId: string, author: string, content: string): Promise<Reply> {
  const supabase = getSupabaseAdminClient();
  const { data: ticket, error: ticketLookupError } = await supabase
    .from('tickets')
    .select('id, channel, whatsapp_chat_id, phone_number, whatsapp_instance_id')
    .eq('id', ticketId)
    .single();

  if (ticketLookupError || !ticket) {
    throw new Error(`Ticket not found for reply: ${ticketLookupError?.message || 'Unknown error'}`);
  }

  const shouldQueueWhatsapp =
    ticket.channel === 'whatsapp' && Boolean(ticket.whatsapp_chat_id);
  const { data, error } = await supabase
    .from('replies')
    .insert({
      ticket_id: ticketId,
      author,
      content,
      sender_type: 'admin',
      delivery_status: shouldQueueWhatsapp ? 'queued' : 'not_applicable',
      delivery_attempts: 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add reply: ${error.message}`);
  }

  const { error: ticketError } = await supabase
    .from('tickets')
    .update({ status: 'In Progress', updated_at: new Date().toISOString() })
    .eq('id', ticketId);

  if (ticketError) {
    throw new Error(`Reply created but failed to update ticket: ${ticketError.message}`);
  }

  if (shouldQueueWhatsapp && ticket.whatsapp_chat_id) {
    try {
      await createTicketReplyOutboundMessage({
        replyId: data.id,
        ticketId,
        whatsappInstanceId: ticket.whatsapp_instance_id || 'default',
        recipientPhoneNumber: ticket.phone_number,
        recipientChatId: ticket.whatsapp_chat_id,
        content,
      });
    } catch (queueError) {
      const queueErrorMessage =
        queueError instanceof Error ? queueError.message : 'Unknown outbound queue error';

      await supabase
        .from('replies')
        .update({
          delivery_status: 'failed',
          last_delivery_error: queueErrorMessage,
          next_retry_at: null,
        })
        .eq('id', data.id);

      throw new Error(`Reply created but failed to queue outbound message: ${queueErrorMessage}`);
    }
  }

  return data as Reply;
}

// Delete a ticket
export async function deleteTicket(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('tickets')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete ticket: ${error.message}`);
  }
}

export async function createCsvContacts(
  rows: CsvContactInput[],
  sourceFile?: string,
): Promise<number> {
  if (!rows.length) {
    return 0;
  }

  const supabase = getSupabaseAdminClient();
  const dedupedByPhone = new Map<string, CsvContactInput>();

  rows.forEach((row) => {
    const phone = row.no_telp.trim();
    if (!phone) {
      return;
    }

    // Keep latest row for the same phone number in one import batch.
    dedupedByPhone.set(phone, {
      ...row,
      no_telp: phone,
      nama: row.nama.trim(),
      jenis_kelamin: row.jenis_kelamin.trim(),
      jabatan: row.jabatan?.trim() || undefined,
      group_names: normalizeGroupNames(row.group_names),
    });
  });

  const payload = Array.from(dedupedByPhone.values()).map((row) => ({
    no_telp: row.no_telp,
    nama: row.nama,
    jenis_kelamin: row.jenis_kelamin,
    jabatan: row.jabatan || null,
    group_names: row.group_names || [],
    source_file: sourceFile || null,
    imported_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('csv_contacts')
    .upsert(payload, { onConflict: 'no_telp' });

  if (error) {
    throw new Error(`Failed to import CSV contacts: ${error.message}`);
  }

  return payload.length;
}

export async function getCsvContacts(): Promise<CsvContact[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('csv_contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch phone list: ${error.message}`);
  }

  return (data || []).map((record) => toCsvContact(record as Record<string, unknown>));
}

export async function getPaginatedCsvContacts({
  page = 1,
  pageSize = 20,
  search = '',
  groupName,
  sortBy = DEFAULT_CONTACT_SORT_BY,
  sortDir = DEFAULT_CONTACT_SORT_DIR,
}: PaginatedCsvContactsParams): Promise<PaginatedCsvContactsResponse> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const normalizedSearch = search.trim();
  const normalizedGroupName = String(groupName || '').trim();
  const normalizedSortBy = normalizeCsvContactSortKey(sortBy);
  const normalizedSortDir = normalizeSortDirection(sortDir, DEFAULT_CONTACT_SORT_DIR);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('list_csv_contacts', {
    p_search: normalizedSearch || null,
    p_group_name: normalizedGroupName || null,
    p_page: safePage,
    p_page_size: safePageSize,
    p_sort_by: normalizedSortBy,
    p_sort_dir: normalizedSortDir,
  });

  if (error) {
    throw new Error(`Failed to fetch paginated contacts: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const total = Number(rows[0]?.total_count || 0);

  return {
    items: rows.map((record) => toCsvContact(record as Record<string, unknown>)),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function getCsvContactsOverview(): Promise<CsvContactsOverview> {
  const supabase = getSupabaseAdminClient();
  const [{ count: totalContacts, error: totalError }, { count: ungroupedContacts, error: ungroupedError }] =
    await Promise.all([
      supabase.from('csv_contacts').select('id', { count: 'exact', head: true }),
      supabase.from('csv_contacts').select('id', { count: 'exact', head: true }).eq('group_names', '{}'),
    ]);

  if (totalError) {
    throw new Error(`Failed to count contacts: ${totalError.message}`);
  }

  if (ungroupedError) {
    throw new Error(`Failed to count ungrouped contacts: ${ungroupedError.message}`);
  }

  return {
    totalContacts: totalContacts || 0,
    ungroupedContacts: ungroupedContacts || 0,
  };
}

export async function createCsvContact(row: CsvContactInput): Promise<CsvContact> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('csv_contacts')
    .upsert(
      {
        no_telp: row.no_telp.trim(),
        nama: row.nama.trim(),
        jenis_kelamin: row.jenis_kelamin.trim(),
        jabatan: row.jabatan?.trim() || null,
        group_names: normalizeGroupNames(row.group_names),
        imported_at: new Date().toISOString(),
      },
      { onConflict: 'no_telp' },
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create phone list row: ${error.message}`);
  }

  return toCsvContact(data as Record<string, unknown>);
}

export async function updateCsvContact(
  id: string,
  row: CsvContactInput,
): Promise<CsvContact> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('csv_contacts')
    .update({
      no_telp: row.no_telp,
      nama: row.nama,
      jenis_kelamin: row.jenis_kelamin,
      jabatan: row.jabatan || null,
      group_names: normalizeGroupNames(row.group_names),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update phone list row: ${error.message}`);
  }

  return toCsvContact(data as Record<string, unknown>);
}

export async function addCsvContactsGroups(
  ids: string[],
  groupNames: string[],
): Promise<number> {
  const normalizedGroupNames = normalizeGroupNames(groupNames);

  if (!ids.length || !normalizedGroupNames.length) {
    return 0;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('add_csv_contact_groups', {
    p_contact_ids: ids,
    p_group_names: normalizedGroupNames,
  });

  if (error) {
    throw new Error(`Failed to update contact group: ${error.message}`);
  }

  return Number(data || 0);
}

export async function syncCsvContactsToGroups(
  input: CsvContactGroupSyncInput,
): Promise<{ createdCount: number; updatedCount: number }> {
  const normalizedGroupNames = normalizeGroupNames(input.groupNames);

  if (!input.contacts.length || !normalizedGroupNames.length) {
    return { createdCount: 0, updatedCount: 0 };
  }

  const existingContacts = await getCsvContactsByPhoneNumbers(
    input.contacts.map((contact) => contact.no_telp),
  );
  const existingByPhoneNumber = new Map(
    existingContacts.map((contact) => [contact.no_telp, contact] as const),
  );

  const contactsToCreate = input.contacts
    .filter((contact) => !existingByPhoneNumber.has(contact.no_telp))
    .map((contact) => ({
      ...contact,
      group_names: normalizeGroupNames([...(contact.group_names || []), ...normalizedGroupNames]),
    }));

  const existingIds = existingContacts.map((contact) => contact.id);

  const [createdCount, updatedCount] = await Promise.all([
    createCsvContacts(contactsToCreate, input.sourceFile),
    addCsvContactsGroups(existingIds, normalizedGroupNames),
  ]);

  return { createdCount, updatedCount };
}

export async function deleteCsvContact(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('csv_contacts')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete phone list row: ${error.message}`);
  }
}

export async function getContentRecordings(): Promise<ContentRecording[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_recordings')
    .select('*, tags:content_recording_tags(tag:content_tags(id, name, created_at))')
    .order('upload_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch content recordings: ${error.message}`);
  }

  return (data || []).map((record) => {
    const rawRecord = record as Record<string, unknown>;
    const tagLinks = Array.isArray(rawRecord.tags) ? rawRecord.tags : [];
    return toContentRecording({
      ...rawRecord,
      tags: tagLinks.map((entry) => (entry as { tag?: unknown }).tag).filter(Boolean),
    });
  });
}

export async function getPaginatedContentRecordings({
  page = 1,
  pageSize = 20,
  search = '',
  platform = '',
  contentType = '',
  tagId = '',
  sortBy = 'upload_date',
  sortDir = 'desc',
}: PaginatedContentRecordingsParams): Promise<PaginatedContentRecordingsResponse> {
  const supabase = getSupabaseAdminClient();
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const normalizedSortBy = normalizeContentRecordingSortKey(sortBy);
  const normalizedSortDir = normalizeSortDirection(sortDir, 'desc');

  const { data, error } = await supabase.rpc('list_content_recordings', {
    p_search: search.trim() || null,
    p_platform: platform.trim() || null,
    p_content_type: contentType.trim() || null,
    p_tag_id: tagId.trim() || null,
    p_page: safePage,
    p_page_size: safePageSize,
    p_sort_by: normalizedSortBy,
    p_sort_dir: normalizedSortDir,
  });

  if (error) {
    throw new Error(`Failed to fetch content recordings: ${error.message}`);
  }

  const rows = (data || []) as Array<Record<string, unknown> & { total_count?: number | string }>;
  const total = rows.length ? Number(rows[0].total_count || 0) : 0;

  return {
    items: rows.map((record) => toContentRecording(record)),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function getContentRecordingsOverview(): Promise<ContentRecordingsOverview> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('get_content_recordings_overview');

  if (error) {
    throw new Error(`Failed to fetch content overview: ${error.message}`);
  }

  const overview = ((data || [])[0] || {}) as Record<string, unknown>;

  return {
    totalRecords: Number(overview.total_records || 0),
    platformCount: Number(overview.platform_count || 0),
    thisMonthCount: Number(overview.this_month_count || 0),
    untaggedCount: Number(overview.untagged_count || 0),
  };
}

export async function getContentTags(): Promise<ContentTag[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_tags')
    .select('id, name, created_at')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch content tags: ${error.message}`);
  }

  return (data || []).map((record) => ({
    id: String(record.id || ''),
    name: String(record.name || ''),
    created_at: String(record.created_at || ''),
  }));
}

export async function ensureContentTags(names: string[]): Promise<ContentTag[]> {
  const normalizedNames = Array.from(
    new Map(
      names
        .map((name) => String(name || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((name) => [name.toLowerCase(), name] as const),
    ).values(),
  );

  if (!normalizedNames.length) {
    return [];
  }

  const supabase = getSupabaseAdminClient();
  const results = await Promise.all(
    normalizedNames.map(async (name) => {
      const { data, error } = await supabase.rpc('ensure_content_tag', { p_name: name });
      if (error) {
        throw new Error(`Failed to create content tag: ${error.message}`);
      }

      const record = ((data || [])[0] || {}) as Record<string, unknown>;
      return {
        id: String(record.id || ''),
        name: String(record.name || ''),
        created_at: String(record.created_at || ''),
      };
    }),
  );

  return results.filter((tag) => tag.id && tag.name);
}

async function replaceContentRecordingTags(contentRecordingId: string, tagIds: string[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const normalizedTagIds = Array.from(new Set(tagIds.map((id) => String(id || '').trim()).filter(Boolean)));

  const { error: deleteError } = await supabase
    .from('content_recording_tags')
    .delete()
    .eq('content_recording_id', contentRecordingId);

  if (deleteError) {
    throw new Error(`Failed to update content tags: ${deleteError.message}`);
  }

  if (!normalizedTagIds.length) {
    return;
  }

  const { error: insertError } = await supabase
    .from('content_recording_tags')
    .insert(normalizedTagIds.map((tagId) => ({ content_recording_id: contentRecordingId, tag_id: tagId })));

  if (insertError) {
    throw new Error(`Failed to update content tags: ${insertError.message}`);
  }
}

export async function upsertContentRecording(
  input: ContentRecordingInput,
): Promise<ContentRecording> {
  const supabase = getSupabaseAdminClient();
  const payload = {
    title: input.title.trim(),
    platform: input.platform,
    caption: input.caption || null,
    description: input.description || null,
    content_type: input.content_type || null,
    upload_date: input.upload_date,
    link: input.link.trim(),
    source_post_id: input.source_post_id || null,
    thumbnail_url: input.thumbnail_url || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase
      .from('content_recordings')
      .update(payload)
      .eq('id', input.id);

    if (error) {
      throw new Error(`Failed to save content recording: ${error.message}`);
    }

    if (input.tag_ids) {
      await replaceContentRecordingTags(String(input.id), input.tag_ids);
    }

    return getContentRecordingById(String(input.id));
  }

  const { data, error } = await supabase
    .from('content_recordings')
    .upsert(payload, { onConflict: 'link' })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save content recording: ${error.message}`);
  }

  const savedRecord = toContentRecording(data as Record<string, unknown>);

  if (input.tag_ids) {
    await replaceContentRecordingTags(savedRecord.id, input.tag_ids);
    return getContentRecordingById(savedRecord.id);
  }

  return savedRecord;
}

export async function getContentRecordingById(id: string): Promise<ContentRecording> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_recordings')
    .select('*, tags:content_recording_tags(tag:content_tags(id, name, created_at))')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch content recording: ${error.message}`);
  }

  const rawRecord = data as Record<string, unknown>;
  const tagLinks = Array.isArray(rawRecord.tags) ? rawRecord.tags : [];
  return toContentRecording({
    ...rawRecord,
    tags: tagLinks.map((entry) => (entry as { tag?: unknown }).tag).filter(Boolean),
  });
}

export async function deleteContentRecording(id: string): Promise<void> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Content recording id is required.');
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('content_recordings')
    .delete()
    .eq('id', normalizedId);

  if (error) {
    throw new Error(`Failed to delete content recording: ${error.message}`);
  }
}
