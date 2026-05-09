import 'server-only';

import { getSupabaseAdminClient } from './supabase-server';

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

export async function listManagedContentTags(): Promise<ManagedContentTag[]> {
  const supabase = getSupabaseAdminClient();
  const [tagsResult, libraryResult, assetProjectResult, assetResult] = await Promise.all([
    supabase.from('content_tags').select('id, name, created_at').order('name', { ascending: true }),
    supabase.from('content_recording_tags').select('tag_id'),
    supabase.from('content_asset_project_tags').select('tag_id'),
    supabase.from('content_asset_tags').select('tag_id'),
  ]);

  if (tagsResult.error) {
    throw new Error(`Gagal memuat tags: ${tagsResult.error.message}`);
  }
  if (libraryResult.error) {
    throw new Error(`Gagal memuat usage tag library: ${libraryResult.error.message}`);
  }
  if (assetProjectResult.error) {
    throw new Error(`Gagal memuat usage tag project asset: ${assetProjectResult.error.message}`);
  }
  if (assetResult.error) {
    throw new Error(`Gagal memuat usage tag asset: ${assetResult.error.message}`);
  }

  const libraryCounts = countByTagId(libraryResult.data);
  const assetProjectCounts = countByTagId(assetProjectResult.data);
  const assetCounts = countByTagId(assetResult.data);

  return (tagsResult.data || []).map((tag) => {
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

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('content_tags')
    .delete()
    .eq('id', normalizedId);

  if (error) {
    throw new Error(`Gagal menghapus tag: ${error.message}`);
  }
}
