import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '../db/client';
import {
  contentAssetProjectTags,
  contentAssetProjects,
  contentAssetTags,
  contentAssets,
} from '../db/schema';
import { rowsFromResult, type DatabaseRow } from './types';

export async function listContentAssetProjectRows(): Promise<DatabaseRow[]> {
  return db.select()
    .from(contentAssetProjects)
    .orderBy(contentAssetProjects.createdAt) as Promise<DatabaseRow[]>;
}

export async function createContentAssetProjectRow(row: typeof contentAssetProjects.$inferInsert): Promise<DatabaseRow> {
  const [record] = await db.insert(contentAssetProjects).values(row).returning();

  if (!record) {
    throw new Error('Failed to create content asset project.');
  }

  return record as DatabaseRow;
}

export async function updateContentAssetProjectRow(
  id: string,
  patch: Partial<typeof contentAssetProjects.$inferInsert>,
): Promise<DatabaseRow> {
  const [record] = await db.update(contentAssetProjects)
    .set({ ...patch, updatedAt: sql`timezone('utc'::text, now())` })
    .where(eq(contentAssetProjects.id, id))
    .returning();

  if (!record) {
    throw new Error('Content asset project not found.');
  }

  return record as DatabaseRow;
}

export async function createContentAssetRow(row: typeof contentAssets.$inferInsert): Promise<DatabaseRow> {
  const [record] = await db.insert(contentAssets).values(row).returning();

  if (!record) {
    throw new Error('Failed to create content asset.');
  }

  return record as DatabaseRow;
}

export async function getContentAssetRow(id: string): Promise<DatabaseRow | null> {
  const rows = await db.select()
    .from(contentAssets)
    .where(eq(contentAssets.id, id))
    .limit(1);

  return (rows[0] ?? null) as DatabaseRow | null;
}

export async function listContentAssetRowsByProject(projectId: string): Promise<DatabaseRow[]> {
  return db.select()
    .from(contentAssets)
    .where(eq(contentAssets.projectId, projectId))
    .orderBy(contentAssets.createdAt) as Promise<DatabaseRow[]>;
}

export async function deleteContentAssetRow(id: string): Promise<void> {
  await db.delete(contentAssets).where(eq(contentAssets.id, id));
}

export async function replaceContentAssetTags(assetId: string, tagIds: string[]): Promise<void> {
  await db.delete(contentAssetTags).where(eq(contentAssetTags.contentAssetId, assetId));

  if (tagIds.length) {
    await db.insert(contentAssetTags)
      .values(tagIds.map((tagId) => ({ contentAssetId: assetId, tagId })))
      .onConflictDoNothing();
  }
}

export async function replaceContentAssetProjectTags(projectId: string, tagIds: string[]): Promise<void> {
  await db.delete(contentAssetProjectTags).where(eq(contentAssetProjectTags.contentAssetProjectId, projectId));

  if (tagIds.length) {
    await db.insert(contentAssetProjectTags)
      .values(tagIds.map((tagId) => ({ contentAssetProjectId: projectId, tagId })))
      .onConflictDoNothing();
  }
}

export async function listContentAssetRowsWithTags(): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select
      content_assets.*,
      coalesce(
        jsonb_agg(to_jsonb(content_tags.*) order by content_tags.name)
          filter (where content_tags.id is not null),
        '[]'::jsonb
      ) as tags
    from public.content_assets
    left join public.content_asset_tags on content_asset_tags.asset_id = content_assets.id
    left join public.content_tags on content_tags.id = content_asset_tags.tag_id
    group by content_assets.id
    order by content_assets.created_at desc
  `);

  return rowsFromResult(result);
}
