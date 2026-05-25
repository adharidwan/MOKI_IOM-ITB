import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { scheduledBlastRecipients, scheduledBlastRuns, scheduledBlasts } from '../db/schema';
import { rowsFromResult, type DatabaseRow } from './types';

export async function listScheduledBlastRows(input: {
  search?: string | null;
  status?: string | null;
  page: number;
  pageSize: number;
}): Promise<DatabaseRow[]> {
  const offset = (input.page - 1) * input.pageSize;
  const result = await db.execute(sql`
    select
      scheduled_blasts.*,
      count(*) over ()::integer as total_count
    from public.scheduled_blasts
    where deleted_at is null
      ${input.status ? sql`and status = ${input.status}` : sql``}
      ${input.search ? sql`and name ilike ${`%${input.search}%`}` : sql``}
    order by created_at desc
    limit ${input.pageSize}
    offset ${offset}
  `);

  return rowsFromResult(result);
}

export async function createScheduledBlastRow(row: typeof scheduledBlasts.$inferInsert): Promise<DatabaseRow> {
  const [record] = await db.insert(scheduledBlasts).values(row).returning();

  if (!record) {
    throw new Error('Failed to create scheduled blast.');
  }

  return record as DatabaseRow;
}

export async function updateScheduledBlastRow(
  id: string,
  patch: Partial<typeof scheduledBlasts.$inferInsert>,
): Promise<DatabaseRow> {
  const [record] = await db.update(scheduledBlasts)
    .set({ ...patch, updatedAt: sql`timezone('utc'::text, now())` })
    .where(eq(scheduledBlasts.id, id))
    .returning();

  if (!record) {
    throw new Error('Scheduled blast not found.');
  }

  return record as DatabaseRow;
}

export async function replaceScheduledBlastRecipients(
  scheduledBlastId: string,
  rows: Array<Omit<typeof scheduledBlastRecipients.$inferInsert, 'scheduledBlastId'>>
): Promise<void> {
  await db.delete(scheduledBlastRecipients)
    .where(eq(scheduledBlastRecipients.scheduledBlastId, scheduledBlastId));

  if (rows.length) {
    await db.insert(scheduledBlastRecipients)
      .values(rows.map((row) => ({ ...row, scheduledBlastId })));
  }
}

export async function createScheduledBlastRunRow(row: typeof scheduledBlastRuns.$inferInsert): Promise<DatabaseRow> {
  const [record] = await db.insert(scheduledBlastRuns).values(row).returning();

  if (!record) {
    throw new Error('Failed to create scheduled blast run.');
  }

  return record as DatabaseRow;
}

export async function updateScheduledBlastRunRow(
  id: string,
  patch: Partial<typeof scheduledBlastRuns.$inferInsert>,
): Promise<void> {
  await db.update(scheduledBlastRuns).set(patch).where(eq(scheduledBlastRuns.id, id));
}
