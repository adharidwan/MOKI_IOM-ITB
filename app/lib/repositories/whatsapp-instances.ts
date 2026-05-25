import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { whatsappInstanceEvents, whatsappInstances } from '../db/schema';
import type { DatabaseRow } from './types';

export async function listWhatsappInstanceRows(): Promise<DatabaseRow[]> {
  return db.select()
    .from(whatsappInstances)
    .orderBy(whatsappInstances.id) as Promise<DatabaseRow[]>;
}

export async function getWhatsappInstanceRow(id: string): Promise<DatabaseRow | null> {
  const rows = await db.select()
    .from(whatsappInstances)
    .where(eq(whatsappInstances.id, id))
    .limit(1);

  return (rows[0] ?? null) as DatabaseRow | null;
}

export async function upsertWhatsappInstanceRow(row: typeof whatsappInstances.$inferInsert): Promise<DatabaseRow> {
  const [record] = await db.insert(whatsappInstances)
    .values(row)
    .onConflictDoUpdate({
      target: whatsappInstances.id,
      set: row,
    })
    .returning();

  if (!record) {
    throw new Error('Failed to upsert WhatsApp instance.');
  }

  return record as DatabaseRow;
}

export async function createWhatsappInstanceEventRow(row: typeof whatsappInstanceEvents.$inferInsert): Promise<DatabaseRow> {
  const [record] = await db.insert(whatsappInstanceEvents).values(row).returning();

  if (!record) {
    throw new Error('Failed to create WhatsApp instance event.');
  }

  return record as DatabaseRow;
}
