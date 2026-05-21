import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from './db/client';

export interface ManagedContentTag {
  id: string;
  name: string;
  created_at: string;
  library_usage_count: number;
  asset_project_usage_count: number;
  asset_usage_count: number;
  total_usage_count: number;
}

function countByTagId(rows: Array<{ tag_id?: unknown }> | null): Map<string, number> {
  const counts = new Map<string, number>();

  (rows || []).forEach((row) => {
    const tagId = String(row.tag_id || '');
    if (!tagId) {
      return;
    }
    counts.set(tagId, (counts.get(tagId) || 0) + 1);
  });

  return counts;
}

function rowsFromResult<T>(result: { rows?: unknown[] }): T[] {
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}

export async function listManagedContentTags(): Promise<ManagedContentTag[]> {
  const [tagsResult, libraryResult, assetProjectResult, assetResult] = await Promise.all([
    db.execute(sql`select id, name, created_at::text from public.content_tags order by name asc`),
    db.execute(sql`select tag_id from public.content_recording_tags`),
    db.execute(sql`select tag_id from public.content_asset_project_tags`),
    db.execute(sql`select tag_id from public.content_asset_tags`),
  ]);

  const libraryCounts = countByTagId(rowsFromResult(libraryResult));
  const assetProjectCounts = countByTagId(rowsFromResult(assetProjectResult));
  const assetCounts = countByTagId(rowsFromResult(assetResult));

  return rowsFromResult<{ id: unknown; name: unknown; created_at: unknown }>(tagsResult).map((tag) => {
    const id = String(tag.id || '');
    const libraryUsageCount = libraryCounts.get(id) || 0;
    const assetProjectUsageCount = assetProjectCounts.get(id) || 0;
    const assetUsageCount = assetCounts.get(id) || 0;

    return {
      id,
      name: String(tag.name || ''),
      created_at: String(tag.created_at || ''),
      library_usage_count: libraryUsageCount,
      asset_project_usage_count: assetProjectUsageCount,
      asset_usage_count: assetUsageCount,
      total_usage_count: libraryUsageCount + assetProjectUsageCount + assetUsageCount,
    };
  });
}

export async function deleteUnusedContentTag(id: string): Promise<void> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Tag id wajib diisi.');
  }

  const tags = await listManagedContentTags();
  const tag = tags.find((candidate) => candidate.id === normalizedId);

  if (!tag) {
    throw new Error('Tag tidak ditemukan.');
  }

  if (tag.total_usage_count > 0) {
    throw new Error(`Tag "${tag.name}" masih dipakai oleh ${tag.total_usage_count} item.`);
  }

  await db.execute(sql`delete from public.content_tags where id = ${normalizedId}`);
}
