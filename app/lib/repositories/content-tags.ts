import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { contentTags } from '../db/schema';
import { rowsFromResult, type DatabaseRow } from './types';

export async function listContentTagRows(): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select id, name, created_at
    from public.content_tags
    order by name asc
  `);

  return rowsFromResult(result);
}

export async function ensureContentTagRow(name: string): Promise<DatabaseRow | null> {
  const result = await db.execute(sql`
    select *
    from public.ensure_content_tag(${name})
  `);

  return rowsFromResult(result)[0] ?? null;
}

export async function deleteContentTagRow(id: string): Promise<void> {
  await db.delete(contentTags).where(eq(contentTags.id, id));
}
