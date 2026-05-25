import 'server-only';

import { and, count, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { botDispatchSettings, outboundMessages } from '../db/schema';
import { firstRowFromResult, type DatabaseRow } from './types';

export async function createOutboundMessageRow(row: typeof outboundMessages.$inferInsert): Promise<DatabaseRow> {
  const [record] = await db.insert(outboundMessages).values(row).returning();

  if (!record) {
    throw new Error('Failed to create outbound message.');
  }

  return record as DatabaseRow;
}

export async function upsertOutboundMessageBySourceRow(row: typeof outboundMessages.$inferInsert): Promise<DatabaseRow> {
  const [record] = await db.insert(outboundMessages)
    .values(row)
    .onConflictDoUpdate({
      target: [outboundMessages.sourceType, outboundMessages.sourceId],
      set: {
        deliveryStatus: 'queued',
        deliveryAttempts: 0,
        nextRetryAt: null,
        lastDeliveryError: null,
        updatedAt: sql`timezone('utc'::text, now())`,
      },
    })
    .returning();

  if (!record) {
    throw new Error('Failed to upsert outbound message.');
  }

  return record as DatabaseRow;
}

export async function updateOutboundMessageRow(
  id: string,
  patch: Partial<typeof outboundMessages.$inferInsert>,
): Promise<void> {
  await db.update(outboundMessages).set(patch).where(eq(outboundMessages.id, id));
}

export async function countOutboundMessages(filters: {
  whatsappInstanceId?: string;
  deliveryStatus?: string;
  sourceType?: string;
  clientId?: string;
  dueOnly?: boolean;
} = {}): Promise<number> {
  const conditions = [];

  if (filters.whatsappInstanceId) {
    conditions.push(eq(outboundMessages.whatsappInstanceId, filters.whatsappInstanceId));
  }
  if (filters.deliveryStatus) {
    conditions.push(eq(outboundMessages.deliveryStatus, filters.deliveryStatus));
  }
  if (filters.sourceType) {
    conditions.push(eq(outboundMessages.sourceType, filters.sourceType));
  }
  if (filters.clientId) {
    conditions.push(eq(outboundMessages.clientId, filters.clientId));
  }
  if (filters.dueOnly) {
    conditions.push(or(isNull(outboundMessages.nextRetryAt), lte(outboundMessages.nextRetryAt, new Date().toISOString())));
  }

  const [row] = await db.select({ value: count() })
    .from(outboundMessages)
    .where(conditions.length ? and(...conditions) : undefined);

  return Number(row?.value || 0);
}

export async function getOldestQueuedOutboundMessageCreatedAt(whatsappInstanceId?: string): Promise<string | null> {
  const conditions = [
    eq(outboundMessages.deliveryStatus, 'queued'),
    isNotNull(outboundMessages.createdAt),
  ];

  if (whatsappInstanceId) {
    conditions.push(eq(outboundMessages.whatsappInstanceId, whatsappInstanceId));
  }

  const result = await db.execute(sql`
    select min(created_at)::text as oldest_queued_at
    from public.outbound_messages
    where delivery_status = 'queued'
      ${whatsappInstanceId ? sql`and whatsapp_instance_id = ${whatsappInstanceId}` : sql``}
  `);

  return String(firstRowFromResult(result)?.oldest_queued_at || '') || null;
}

export async function getDispatchSettingsRow(): Promise<DatabaseRow | null> {
  const rows = await db.select()
    .from(botDispatchSettings)
    .where(eq(botDispatchSettings.id, 'default'))
    .limit(1);

  return (rows[0] ?? null) as DatabaseRow | null;
}

export async function upsertDispatchSettingsRow(
  patch: Partial<typeof botDispatchSettings.$inferInsert>,
): Promise<DatabaseRow> {
  const [row] = await db.insert(botDispatchSettings)
    .values({
      id: 'default',
      ...patch,
    })
    .onConflictDoUpdate({
      target: botDispatchSettings.id,
      set: {
        ...patch,
        updatedAt: sql`timezone('utc'::text, now())`,
      },
    })
    .returning();

  if (!row) {
    throw new Error('Failed to upsert dispatch settings.');
  }

  return row as DatabaseRow;
}
