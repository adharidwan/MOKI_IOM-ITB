import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { replies, tickets } from '../db/schema';
import { firstRowFromResult, rowsFromResult, type DatabaseRow, type SortDirection } from './types';

export type TicketSortKey = 'updated_at' | 'status' | 'subject' | 'id';

export interface ListTicketsQuery {
  search: string | null;
  instanceId: string | null;
  page: number;
  pageSize: number;
  sortBy: TicketSortKey;
  sortDir: SortDirection;
}

export interface TicketStatusSummaryQuery {
  search: string | null;
  instanceId: string | null;
}

export interface CreateTicketInput {
  subject: string;
  description?: string | null;
  status?: string | null;
  user_email?: string | null;
  channel?: string | null;
  phone_number?: string | null;
  whatsapp_chat_id?: string | null;
  updated_at?: string | null;
  whatsapp_instance_id?: string | null;
}

export interface CreateReplyInput {
  ticket_id: string;
  author: string;
  content: string;
  sender_type: string;
  delivery_status: string;
  delivery_attempts: number;
  media_bucket?: string | null;
  media_path?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  media_size_bytes?: number | null;
}

export async function listTicketsRows(query: ListTicketsQuery): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select *
    from public.list_tickets(
      ${query.search},
      ${query.instanceId},
      ${query.page},
      ${query.pageSize},
      ${query.sortBy},
      ${query.sortDir}
    )
  `);

  return rowsFromResult(result);
}

export async function getTicketStatusSummaryRow(query: TicketStatusSummaryQuery): Promise<DatabaseRow | null> {
  const result = await db.execute(sql`
    select *
    from public.ticket_status_summary(${query.search}, ${query.instanceId})
  `);

  return firstRowFromResult(result);
}

export async function getTicketWithRepliesRow(id: string): Promise<DatabaseRow | null> {
  const result = await db.execute(sql`
    select
      tickets.*,
      coalesce(
        jsonb_agg(to_jsonb(replies.*) order by replies.created_at)
          filter (where replies.id is not null),
        '[]'::jsonb
      ) as replies
    from public.tickets
    left join public.replies on replies.ticket_id = tickets.id
    where tickets.id = ${id}
    group by tickets.id
    limit 1
  `);

  return firstRowFromResult(result);
}

export async function createTicketRecord(input: CreateTicketInput): Promise<DatabaseRow> {
  const result = await db.execute(sql`
    insert into public.tickets (
      subject,
      description,
      status,
      user_email,
      channel,
      phone_number,
      whatsapp_chat_id,
      updated_at,
      whatsapp_instance_id
    )
    values (
      ${input.subject},
      ${input.description ?? null},
      ${input.status ?? 'Open'},
      ${input.user_email ?? null},
      ${input.channel ?? 'web'},
      ${input.phone_number ?? null},
      ${input.whatsapp_chat_id ?? null},
      ${input.updated_at ?? new Date().toISOString()},
      ${input.whatsapp_instance_id ?? null}
    )
    returning *
  `);
  const row = firstRowFromResult(result);

  if (!row) {
    throw new Error('Failed to create ticket.');
  }

  return row as DatabaseRow;
}

export async function updateTicketStatusRecord(id: string, status: string, updatedAt: string): Promise<DatabaseRow> {
  const result = await db.execute(sql`
    update public.tickets
    set status = ${status}, updated_at = ${updatedAt}
    where id = ${id}
    returning *
  `);
  const row = firstRowFromResult(result);

  if (!row) {
    throw new Error('Ticket not found.');
  }

  return row as DatabaseRow;
}

export async function getTicketForReplyQueue(id: string): Promise<DatabaseRow | null> {
  const result = await db.execute(sql`
    select id, channel, whatsapp_chat_id, phone_number, whatsapp_instance_id
    from public.tickets
    where id = ${id}
    limit 1
  `);

  return firstRowFromResult(result);
}

export async function createReplyRecord(input: CreateReplyInput): Promise<DatabaseRow> {
  const result = await db.execute(sql`
    insert into public.replies (
      ticket_id,
      author,
      content,
      sender_type,
      delivery_status,
      delivery_attempts,
      media_bucket,
      media_path,
      media_mime_type,
      media_file_name,
      media_size_bytes
    )
    values (
      ${input.ticket_id},
      ${input.author},
      ${input.content},
      ${input.sender_type},
      ${input.delivery_status},
      ${input.delivery_attempts},
      ${input.media_bucket ?? null},
      ${input.media_path ?? null},
      ${input.media_mime_type ?? null},
      ${input.media_file_name ?? null},
      ${input.media_size_bytes ?? null}
    )
    returning *
  `);
  const row = firstRowFromResult(result);

  if (!row) {
    throw new Error('Failed to create reply.');
  }

  return row as DatabaseRow;
}

export async function markReplyDeliveryFailed(id: string, errorMessage: string): Promise<void> {
  await db.update(replies)
    .set({
      deliveryStatus: 'failed',
      lastDeliveryError: errorMessage,
      nextRetryAt: null,
    })
    .where(eq(replies.id, id));
}

export async function updateTicketAfterReply(id: string, updatedAt: string): Promise<void> {
  await db.update(tickets)
    .set({ status: 'In Progress', updatedAt })
    .where(eq(tickets.id, id));
}

export async function deleteTicketRecord(id: string): Promise<void> {
  await db.delete(tickets).where(eq(tickets.id, id));
}

export async function listRepliesForTicket(ticketId: string): Promise<DatabaseRow[]> {
  return db.select()
    .from(replies)
    .where(and(eq(replies.ticketId, ticketId)))
    .orderBy(desc(replies.createdAt)) as Promise<DatabaseRow[]>;
}
