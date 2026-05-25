import 'server-only';

import { createTicketMediaSignedUrl, normalizeTicketMediaInput, type TicketMediaInput } from './ticket-media';
import { Ticket, Reply, TicketWithReplies, CsvContact, ContentRecording, ContentRecordingPlatform, ContentRecordingType, ContentTag } from './types';
import { createTicketReplyOutboundMessage } from './whatsapp-notification-repository';
import {
  addCsvContactGroups,
  countCsvContacts,
  countUngroupedCsvContacts,
  createReplyRecord,
  createTicketRecord,
  deleteContentRecordingRecord,
  deleteCsvContactRow,
  deleteTicketRecord,
  ensureContentTagRow,
  findContentRecordingIdByLink,
  getContentRecordingRowById,
  getContentRecordingsOverviewRow,
  getCsvContactRowsByPhoneNumbers,
  getTicketForReplyQueue,
  getTicketStatusSummaryRow,
  getTicketWithRepliesRow,
  listContentRecordingRows,
  listContentTagRows,
  listCsvContactRows,
  listPaginatedContentRecordingRows,
  listPaginatedCsvContactRows,
  listTicketsRows,
  markReplyDeliveryFailed,
  updateCsvContactRow,
  updateTicketAfterReply,
  updateTicketStatusRecord,
  upsertCsvContactRows,
  updateContentRecordingRecordById,
  upsertContentRecordingRecord,
  upsertSingleCsvContactRow,
} from './repositories';

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

interface TicketStatusSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
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
  title?: string | null;
  platform: ContentRecordingPlatform;
  caption?: string | null;
  description?: string | null;
  content_type?: ContentRecordingType | null;
  upload_date: string;
  link: string;
  source_post_id?: string | null;
  thumbnail_url?: string | null;
  media_urls?: string[] | null;
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
  tagIds?: string[];
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
  const mediaUrls = normalizeUrlList(record.media_urls);

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
    media_urls: mediaUrls,
    tags: toContentTags(record.tags),
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || ''),
  };
}

function normalizeUrlList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|,/)
      : [];
  const byUrl = new Map<string, string>();

  values.forEach((entry) => {
    const url = String(entry || '').trim();
    if (url) {
      byUrl.set(url, url);
    }
  });

  return Array.from(byUrl.values());
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
    media_bucket: record.media_bucket === null || record.media_bucket === undefined ? null : String(record.media_bucket),
    media_path: record.media_path === null || record.media_path === undefined ? null : String(record.media_path),
    media_mime_type: record.media_mime_type === null || record.media_mime_type === undefined ? null : String(record.media_mime_type),
    media_file_name: record.media_file_name === null || record.media_file_name === undefined ? null : String(record.media_file_name),
    media_size_bytes: record.media_size_bytes === null || record.media_size_bytes === undefined ? null : Number(record.media_size_bytes),
    media_signed_url: record.media_signed_url === null || record.media_signed_url === undefined ? null : String(record.media_signed_url),
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

  const rows = await getCsvContactRowsByPhoneNumbers(normalizedPhoneNumbers);

  return rows.map((record) => toCsvContact(record));
}

export async function getTickets({ 
  page = 1, 
  search = '', 
  sort = DEFAULT_TICKET_SORT_BY,
  sortDir = DEFAULT_TICKET_SORT_DIR,
  pageSize = 10,
  instanceId,
}: GetTicketsParams): Promise<GetTicketsResponse> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const normalizedSort = normalizeTicketSortKey(sort);
  const normalizedSortDir = normalizeSortDirection(sortDir, DEFAULT_TICKET_SORT_DIR);
  const rows = await listTicketsRows({
    search: search.trim() || null,
    instanceId: instanceId || null,
    page: safePage,
    pageSize: safePageSize,
    sortBy: normalizedSort,
    sortDir: normalizedSortDir,
  });

  return {
    tickets: rows.map((row) => toTicketWithReplies(row)),
    total: Number(rows[0]?.total_count || 0),
  };
}

export async function getTicketStatusSummary({
  search = '',
  instanceId,
}: Pick<GetTicketsParams, 'search' | 'instanceId'> = {}): Promise<TicketStatusSummary> {
  const summary = await getTicketStatusSummaryRow({
    search: search.trim() || null,
    instanceId: instanceId || null,
  });

  return {
    total: Number(summary?.total_count || 0),
    open: Number(summary?.open_count || 0),
    inProgress: Number(summary?.in_progress_count || 0),
    resolved: Number(summary?.resolved_count || 0),
    closed: Number(summary?.closed_count || 0),
  };
}

// Fetch a single ticket by ID with its replies
export async function getTicketById(id: string): Promise<TicketWithReplies> {
  const data = await getTicketWithRepliesRow(id);

  if (!data) {
    throw new Error('Ticket not found.');
  }

  const ticket = toTicketWithReplies(data);
  const replies = await Promise.all(
    ticket.replies.map(async (reply) => ({
      ...reply,
      media_signed_url: reply.media_bucket && reply.media_path
        ? await createTicketMediaSignedUrl(reply.media_bucket, reply.media_path)
        : null,
    })),
  );

  return {
    ...ticket,
    replies,
  };
}

// Create a new ticket
export async function createTicket(ticket: Omit<Ticket, 'id' | 'created_at'>): Promise<Ticket> {
  const data = await createTicketRecord(ticket);

  return data as unknown as Ticket;
}

// Update a ticket's status
export async function updateTicketStatus(id: string, status: Ticket['status']): Promise<Ticket> {
  const data = await updateTicketStatusRecord(id, status, new Date().toISOString());

  return data as unknown as Ticket;
}

// Add a reply to a ticket
export async function addReply(
  ticketId: string,
  author: string,
  content: string,
  mediaInput?: TicketMediaInput | null,
): Promise<Reply> {
  const media = normalizeTicketMediaInput(mediaInput);
  const ticket = await getTicketForReplyQueue(ticketId);

  if (!ticket) {
    throw new Error('Ticket not found for reply.');
  }

  const shouldQueueWhatsapp =
    ticket.channel === 'whatsapp' && Boolean(ticket.whatsapp_chat_id);
  const data = await createReplyRecord({
    ticket_id: ticketId,
    author,
    content,
    sender_type: 'admin',
    delivery_status: shouldQueueWhatsapp ? 'queued' : 'not_applicable',
    delivery_attempts: 0,
    media_bucket: media?.bucket || null,
    media_path: media?.path || null,
    media_mime_type: media?.mimeType || null,
    media_file_name: media?.fileName || null,
    media_size_bytes: media?.sizeBytes || null,
  });

  await updateTicketAfterReply(ticketId, new Date().toISOString());

  if (shouldQueueWhatsapp && ticket.whatsapp_chat_id) {
    try {
      const outboundInput = {
        replyId: String(data.id),
        ticketId,
        whatsappInstanceId: ticket.whatsapp_instance_id === null || ticket.whatsapp_instance_id === undefined
          ? 'default'
          : String(ticket.whatsapp_instance_id),
        recipientPhoneNumber: ticket.phone_number === null || ticket.phone_number === undefined ? null : String(ticket.phone_number),
        recipientChatId: String(ticket.whatsapp_chat_id),
        content,
        ...(media ? { media } : {}),
      };

      await createTicketReplyOutboundMessage(outboundInput);
    } catch (queueError) {
      const queueErrorMessage =
        queueError instanceof Error ? queueError.message : 'Unknown outbound queue error';

      await markReplyDeliveryFailed(String(data.id), queueErrorMessage);

      throw new Error(`Reply created but failed to queue outbound message: ${queueErrorMessage}`);
    }
  }

  return toReply(data);
}

// Delete a ticket
export async function deleteTicket(id: string): Promise<void> {
  await deleteTicketRecord(id);
}

export async function createCsvContacts(
  rows: CsvContactInput[],
  sourceFile?: string,
): Promise<number> {
  if (!rows.length) {
    return 0;
  }

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

  return upsertCsvContactRows(payload);
}

export async function getCsvContacts(): Promise<CsvContact[]> {
  const data = await listCsvContactRows();

  return data.map((record) => toCsvContact(record));
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
  const rows = await listPaginatedCsvContactRows({
    search: normalizedSearch || null,
    groupName: normalizedGroupName || null,
    page: safePage,
    pageSize: safePageSize,
    sortBy: normalizedSortBy,
    sortDir: normalizedSortDir,
  });

  const total = Number(rows[0]?.total_count || 0);

  return {
    items: rows.map((record) => toCsvContact(record)),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function getCsvContactsOverview(): Promise<CsvContactsOverview> {
  const [totalContacts, ungroupedContacts] = await Promise.all([
    countCsvContacts(),
    countUngroupedCsvContacts(),
  ]);

  return {
    totalContacts: totalContacts || 0,
    ungroupedContacts: ungroupedContacts || 0,
  };
}

export async function createCsvContact(row: CsvContactInput): Promise<CsvContact> {
  const data = await upsertSingleCsvContactRow({
    no_telp: row.no_telp.trim(),
    nama: row.nama.trim(),
    jenis_kelamin: row.jenis_kelamin.trim(),
    jabatan: row.jabatan?.trim() || null,
    group_names: normalizeGroupNames(row.group_names),
    imported_at: new Date().toISOString(),
  });

  return toCsvContact(data);
}

export async function updateCsvContact(
  id: string,
  row: CsvContactInput,
): Promise<CsvContact> {
  const data = await updateCsvContactRow(id, {
    no_telp: row.no_telp,
    nama: row.nama,
    jenis_kelamin: row.jenis_kelamin,
    jabatan: row.jabatan || null,
    group_names: normalizeGroupNames(row.group_names),
  });

  return toCsvContact(data);
}

export async function addCsvContactsGroups(
  ids: string[],
  groupNames: string[],
): Promise<number> {
  const normalizedGroupNames = normalizeGroupNames(groupNames);

  if (!ids.length || !normalizedGroupNames.length) {
    return 0;
  }

  return addCsvContactGroups(ids, normalizedGroupNames);
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
  await deleteCsvContactRow(id);
}

export async function getContentRecordings(): Promise<ContentRecording[]> {
  const data = await listContentRecordingRows();

  return data.map((record) => toContentRecording(record));
}

export async function getPaginatedContentRecordings({
  page = 1,
  pageSize = 20,
  search = '',
  platform = '',
  contentType = '',
  tagId = '',
  tagIds = [],
  sortBy = 'upload_date',
  sortDir = 'desc',
}: PaginatedContentRecordingsParams): Promise<PaginatedContentRecordingsResponse> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const normalizedSortBy = normalizeContentRecordingSortKey(sortBy);
  const normalizedSortDir = normalizeSortDirection(sortDir, 'desc');
  const normalizedTagIds = Array.from(
    new Set([...(tagIds || []), tagId].map((id) => String(id || '').trim()).filter(Boolean)),
  );

  const rows = await listPaginatedContentRecordingRows({
    search: search.trim() || null,
    platform: platform.trim() || null,
    contentType: contentType.trim() || null,
    tagIds: normalizedTagIds,
    page: safePage,
    pageSize: safePageSize,
    sortBy: normalizedSortBy,
    sortDir: normalizedSortDir,
  });

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
  const overview = await getContentRecordingsOverviewRow() || {};

  return {
    totalRecords: Number(overview.total_records || 0),
    platformCount: Number(overview.platform_count || 0),
    thisMonthCount: Number(overview.this_month_count || 0),
    untaggedCount: Number(overview.untagged_count || 0),
  };
}

export async function getContentTags(): Promise<ContentTag[]> {
  const data = await listContentTagRows();

  return data.map((record) => ({
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

  const results = await Promise.all(
    normalizedNames.map(async (name) => {
      const record = await ensureContentTagRow(name) || {};
      return {
        id: String(record.id || ''),
        name: String(record.name || ''),
        created_at: String(record.created_at || ''),
      };
    }),
  );

  return results.filter((tag) => tag.id && tag.name);
}

export async function upsertContentRecording(
  input: ContentRecordingInput,
): Promise<ContentRecording> {
  const title = String(input.title || '').trim();
  const link = input.link.trim();
  const mediaUrls = normalizeUrlList(input.media_urls);
  const payload = {
    title: title || null,
    platform: input.platform,
    caption: input.caption || null,
    description: input.description || null,
    content_type: input.content_type || null,
    upload_date: input.upload_date,
    link,
    source_post_id: input.source_post_id || null,
    thumbnail_url: input.thumbnail_url || null,
    media_urls: mediaUrls.length ? mediaUrls : null,
  };

  const inputId = input.id ? String(input.id) : null;

  if (inputId) {
    await updateContentRecordingRecordById(inputId, payload, input.tag_ids);

    return getContentRecordingById(inputId);
  }

  const existingId = await findContentRecordingIdByLink(link);

  if (existingId) {
    await updateContentRecordingRecordById(existingId, payload, input.tag_ids);

    return getContentRecordingById(existingId);
  }

  const data = await upsertContentRecordingRecord(payload, input.tag_ids || []);
  const savedRecord = toContentRecording(data);

  if (input.tag_ids) {
    return getContentRecordingById(savedRecord.id);
  }

  return savedRecord;
}

export async function getContentRecordingById(id: string): Promise<ContentRecording> {
  const data = await getContentRecordingRowById(id);

  if (!data) {
    throw new Error('Failed to fetch content recording: not found');
  }

  return toContentRecording(data);
}

export async function deleteContentRecording(id: string): Promise<void> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Content recording id is required.');
  }

  await deleteContentRecordingRecord(normalizedId);
}
