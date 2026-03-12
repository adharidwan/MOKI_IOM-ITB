import { supabase, Ticket, Reply, TicketWithReplies } from './supabase';

interface GetTicketsParams {
  page?: number;
  search?: string;
  sort?: string;
  pageSize?: number;
}

interface GetTicketsResponse {
  tickets: TicketWithReplies[];
  total: number;
}

export async function getTickets({ 
  page = 1, 
  search = '', 
  sort = 'created_at',
  pageSize = 10 
}: GetTicketsParams): Promise<GetTicketsResponse> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('tickets')
    .select('*, replies(*)', { count: 'exact' })
    .order(sort, { ascending: sort === 'created_at' ? false : true })
    .range(from, to);

  if (search) {
    query = query.ilike('subject', `%${search}%`);
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
  const { data, error } = await supabase
    .from('tickets')
    .update({ status })
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
  const { data, error } = await supabase
    .from('replies')
    .insert({ ticket_id: ticketId, author, content })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add reply: ${error.message}`);
  }

  return data as Reply;
}

// Delete a ticket
export async function deleteTicket(id: string): Promise<void> {
  const { error } = await supabase
    .from('tickets')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete ticket: ${error.message}`);
  }
}