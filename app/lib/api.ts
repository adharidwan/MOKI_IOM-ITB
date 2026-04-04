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
    });
  });

  const payload = Array.from(dedupedByPhone.values()).map((row) => ({
    no_telp: row.no_telp,
    nama: row.nama,
    jenis_kelamin: row.jenis_kelamin,
    jabatan: row.jabatan || null,
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

  return (data as CsvContact[]) || [];
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
        imported_at: new Date().toISOString(),
      },
      { onConflict: 'no_telp' },
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create phone list row: ${error.message}`);
  }

  return data as CsvContact;
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
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update phone list row: ${error.message}`);
  }

  return data as CsvContact;
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
