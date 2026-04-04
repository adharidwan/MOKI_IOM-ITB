import 'server-only';

import { getSupabaseServerClient, getSupabaseAdminClient } from './supabase-server';
import { Ticket, Reply, TicketWithReplies, CsvContact } from './types';
import { createTicketReplyOutboundMessage } from './whatsapp-notification-repository';

interface GetTicketsParams {
  page?: number;
  search?: string;
  sort?: string;
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

const SORT_COLUMN_MAP: Record<string, string> = {
  createdAt: 'created_at',
  created_at: 'created_at',
  id: 'id',
  status: 'status',
  subject: 'subject',
};

export async function getTickets({ 
  page = 1, 
  search = '', 
  sort = 'created_at',
  pageSize = 10,
  instanceId,
}: GetTicketsParams): Promise<GetTicketsResponse> {
  const supabase = getSupabaseServerClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const normalizedSort = SORT_COLUMN_MAP[sort] || 'created_at';

  let query = supabase
    .from('tickets')
    .select('*, replies(*)', { count: 'exact' })
    .order(normalizedSort, { ascending: normalizedSort === 'created_at' ? false : true })
    .range(from, to);

  if (search) {
    query = query.ilike('subject', `%${search}%`);
  }

  if (instanceId) {
    query = query.eq('whatsapp_instance_id', instanceId);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch tickets: ${error.message}`);
  }

  return {
    tickets: (data as TicketWithReplies[]) || [],
    total: count || 0,
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
