import 'server-only';

import { getSupabaseAdminClient } from './supabase-server';
import type { ContentAsset, ContentAssetProject, ContentTag } from './types';

export const CONTENT_ASSET_BUCKET = 'content-assets';

export interface ContentAssetInput {
  projectId?: string | null;
  uploader: string;
  uploaderEmail?: string | null;
  projectName: string;
  originalFilename: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  notes?: string | null;
}

export interface UpdateContentAssetInput {
  id: string;
  notes?: string | null;
  tagIds?: string[];
}

export interface UpdateContentAssetProjectInput {
  id: string;
  projectName: string;
  notes?: string | null;
  tagIds?: string[];
}

export interface ContentAssetProjectInput {
  createdBy: string;
  createdByEmail?: string | null;
  projectName: string;
  notes?: string | null;
}

function toContentTags(value: unknown): ContentTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((tag) => {
      const record = tag as Record<string, unknown>;
      return {
        id: String(record.id || ''),
        name: String(record.name || ''),
        created_at: record.created_at === null || record.created_at === undefined ? undefined : String(record.created_at),
      };
    })
    .filter((tag) => tag.id && tag.name);
}

function extractTags(record: Record<string, unknown>): ContentTag[] {
  const tagLinks = Array.isArray(record.tags) ? record.tags : [];
  return toContentTags(tagLinks.map((entry) => (entry as { tag?: unknown }).tag).filter(Boolean));
}

function toContentAsset(record: Record<string, unknown>, signedUrl: string | null = null): ContentAsset {
  return {
    id: String(record.id || ''),
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || ''),
    uploader: String(record.uploader || ''),
    uploader_email:
      record.uploader_email === null || record.uploader_email === undefined
        ? null
        : String(record.uploader_email),
    project_id:
      record.project_id === null || record.project_id === undefined
        ? null
        : String(record.project_id),
    project_name: String(record.project_name || ''),
    original_filename: String(record.original_filename || ''),
    storage_bucket: String(record.storage_bucket || CONTENT_ASSET_BUCKET),
    storage_path: String(record.storage_path || ''),
    mime_type: String(record.mime_type || ''),
    file_size: Number(record.file_size || 0),
    notes: record.notes === null || record.notes === undefined ? null : String(record.notes),
    tags: toContentTags(record.tags),
    signed_url: signedUrl,
  };
}

function toContentAssetProject(record: Record<string, unknown>, previewAsset: ContentAsset | null = null): ContentAssetProject {
  return {
    id: String(record.id || ''),
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || ''),
    created_by: String(record.created_by || ''),
    created_by_email:
      record.created_by_email === null || record.created_by_email === undefined
        ? null
        : String(record.created_by_email),
    project_name: String(record.project_name || ''),
    notes: record.notes === null || record.notes === undefined ? null : String(record.notes),
    asset_count: Number(record.asset_count || 0),
    image_count: Number(record.image_count || 0),
    video_count: Number(record.video_count || 0),
    total_file_size: Number(record.total_file_size || 0),
    latest_asset_at:
      record.latest_asset_at === null || record.latest_asset_at === undefined
        ? null
        : String(record.latest_asset_at),
    tags: toContentTags(record.tags),
    preview_asset: previewAsset,
  };
}

async function createSignedUrl(bucket: string, path: string): Promise<string | null> {
  if (!bucket || !path) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function listContentAssets(): Promise<ContentAsset[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_assets')
    .select('*, tags:content_asset_tags(tag:content_tags(id, name, created_at))')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Gagal memuat assets: ${error.message}`);
  }

  return Promise.all(
    (data || []).map(async (record) => {
      const rawRecord = record as Record<string, unknown>;
      const signedUrl = await createSignedUrl(
        String(rawRecord.storage_bucket || CONTENT_ASSET_BUCKET),
        String(rawRecord.storage_path || ''),
      );

      return toContentAsset({ ...rawRecord, tags: extractTags(rawRecord) }, signedUrl);
    }),
  );
}

export async function listContentAssetProjects(): Promise<ContentAssetProject[]> {
  const supabase = getSupabaseAdminClient();
  const { data: projects, error: projectError } = await supabase
    .from('content_asset_projects')
    .select('*, tags:content_asset_project_tags(tag:content_tags(id, name, created_at))')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (projectError) {
    throw new Error(`Gagal memuat project asset: ${projectError.message}`);
  }

  const { data: assets, error: assetError } = await supabase
    .from('content_assets')
    .select('*, tags:content_asset_tags(tag:content_tags(id, name, created_at))')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (assetError) {
    throw new Error(`Gagal memuat assets: ${assetError.message}`);
  }

  const assetsWithUrls = await Promise.all(
    (assets || []).map(async (record) => {
      const rawRecord = record as Record<string, unknown>;
      const signedUrl = await createSignedUrl(
        String(rawRecord.storage_bucket || CONTENT_ASSET_BUCKET),
        String(rawRecord.storage_path || ''),
      );

      return toContentAsset({ ...rawRecord, tags: extractTags(rawRecord) }, signedUrl);
    }),
  );

  return (projects || []).map((project) => {
    const rawProject = project as Record<string, unknown>;
    const projectId = String(rawProject.id || '');
    const projectAssets = assetsWithUrls.filter((asset) => asset.project_id === projectId);
    const latestAsset = projectAssets[0] || null;

    return toContentAssetProject(
      {
        ...rawProject,
        tags: extractTags(rawProject),
        asset_count: projectAssets.length,
        image_count: projectAssets.filter((asset) => asset.mime_type.startsWith('image/')).length,
        video_count: projectAssets.filter((asset) => asset.mime_type.startsWith('video/')).length,
        total_file_size: projectAssets.reduce((total, asset) => total + asset.file_size, 0),
        latest_asset_at: latestAsset?.created_at || null,
      },
      latestAsset,
    );
  });
}

export async function getContentAssetProject(id: string): Promise<ContentAssetProject | null> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Project id wajib diisi.');
  }

  const supabase = getSupabaseAdminClient();
  const { data: project, error: projectError } = await supabase
    .from('content_asset_projects')
    .select('*, tags:content_asset_project_tags(tag:content_tags(id, name, created_at))')
    .eq('id', normalizedId)
    .single();

  if (projectError) {
    if (projectError.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Gagal memuat project asset: ${projectError.message}`);
  }

  const assets = await listContentAssetsByProject(normalizedId);
  const rawProject = project as Record<string, unknown>;
  const latestAsset = assets[0] || null;

  return toContentAssetProject(
    {
      ...rawProject,
      tags: extractTags(rawProject),
      asset_count: assets.length,
      image_count: assets.filter((asset) => asset.mime_type.startsWith('image/')).length,
      video_count: assets.filter((asset) => asset.mime_type.startsWith('video/')).length,
      total_file_size: assets.reduce((total, asset) => total + asset.file_size, 0),
      latest_asset_at: latestAsset?.created_at || null,
    },
    latestAsset,
  );
}

export async function listContentAssetsByProject(projectId: string): Promise<ContentAsset[]> {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) {
    throw new Error('Project id wajib diisi.');
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_assets')
    .select('*, tags:content_asset_tags(tag:content_tags(id, name, created_at))')
    .eq('project_id', normalizedProjectId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Gagal memuat assets project: ${error.message}`);
  }

  return Promise.all(
    (data || []).map(async (record) => {
      const rawRecord = record as Record<string, unknown>;
      const signedUrl = await createSignedUrl(
        String(rawRecord.storage_bucket || CONTENT_ASSET_BUCKET),
        String(rawRecord.storage_path || ''),
      );

      return toContentAsset({ ...rawRecord, tags: extractTags(rawRecord) }, signedUrl);
    }),
  );
}

export async function getContentAsset(id: string): Promise<ContentAsset | null> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Asset id wajib diisi.');
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_assets')
    .select('*, tags:content_asset_tags(tag:content_tags(id, name, created_at))')
    .eq('id', normalizedId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Gagal membaca asset: ${error.message}`);
  }

  const record = data as Record<string, unknown>;
  return toContentAsset(
    { ...record, tags: extractTags(record) },
    await createSignedUrl(
      String(record.storage_bucket || CONTENT_ASSET_BUCKET),
      String(record.storage_path || ''),
    ),
  );
}

export async function downloadContentAssetObject(asset: ContentAsset): Promise<Blob> {
  if (!asset.storage_bucket || !asset.storage_path) {
    throw new Error('Lokasi storage asset tidak valid.');
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(asset.storage_bucket).download(asset.storage_path);

  if (error) {
    throw new Error(`Gagal download asset "${asset.original_filename}": ${error.message}`);
  }

  if (!data) {
    throw new Error(`File asset "${asset.original_filename}" tidak ditemukan di storage.`);
  }

  return data;
}

export async function createContentAssetProject(input: ContentAssetProjectInput): Promise<ContentAssetProject> {
  const projectName = String(input.projectName || '').replace(/\s+/g, ' ').trim();
  if (!projectName) {
    throw new Error('Nama project wajib diisi.');
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_asset_projects')
    .insert({
      created_by: input.createdBy,
      created_by_email: input.createdByEmail || null,
      project_name: projectName,
      notes: input.notes || null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal membuat project asset: ${error.message}`);
  }

  return toContentAssetProject(data as Record<string, unknown>);
}

export async function createContentAsset(input: ContentAssetInput): Promise<ContentAsset> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_assets')
    .insert({
      project_id: input.projectId || null,
      uploader: input.uploader,
      uploader_email: input.uploaderEmail || null,
      project_name: input.projectName,
      original_filename: input.originalFilename,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize,
      notes: input.notes || null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan metadata asset: ${error.message}`);
  }

  return toContentAsset({ ...(data as Record<string, unknown>), tags: [] }, await createSignedUrl(input.storageBucket, input.storagePath));
}

function normalizeTagIds(tagIds: string[] | undefined): string[] {
  return Array.from(new Set((tagIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
}

async function replaceContentAssetTags(assetId: string, tagIds: string[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const normalizedTagIds = normalizeTagIds(tagIds);

  const { error: deleteError } = await supabase
    .from('content_asset_tags')
    .delete()
    .eq('content_asset_id', assetId);

  if (deleteError) {
    throw new Error(`Gagal memperbarui tag asset: ${deleteError.message}`);
  }

  if (!normalizedTagIds.length) {
    return;
  }

  const { error: insertError } = await supabase
    .from('content_asset_tags')
    .insert(normalizedTagIds.map((tagId) => ({ content_asset_id: assetId, tag_id: tagId })));

  if (insertError) {
    throw new Error(`Gagal memperbarui tag asset: ${insertError.message}`);
  }
}

async function replaceContentAssetProjectTags(projectId: string, tagIds: string[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const normalizedTagIds = normalizeTagIds(tagIds);

  const { error: deleteError } = await supabase
    .from('content_asset_project_tags')
    .delete()
    .eq('content_asset_project_id', projectId);

  if (deleteError) {
    throw new Error(`Gagal memperbarui tag project: ${deleteError.message}`);
  }

  if (!normalizedTagIds.length) {
    return;
  }

  const { error: insertError } = await supabase
    .from('content_asset_project_tags')
    .insert(normalizedTagIds.map((tagId) => ({ content_asset_project_id: projectId, tag_id: tagId })));

  if (insertError) {
    throw new Error(`Gagal memperbarui tag project: ${insertError.message}`);
  }
}

export async function updateContentAsset(input: UpdateContentAssetInput): Promise<ContentAsset> {
  const normalizedId = String(input.id || '').trim();

  if (!normalizedId) {
    throw new Error('Asset id wajib diisi.');
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_assets')
    .update({
      notes: input.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedId)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal mengubah metadata asset: ${error.message}`);
  }

  if (input.tagIds) {
    await replaceContentAssetTags(normalizedId, input.tagIds);
  }

  const record = data as Record<string, unknown>;
  return getContentAsset(normalizedId)
    .then((asset) => asset || toContentAsset(record, null));
}

export async function updateContentAssetProject(input: UpdateContentAssetProjectInput): Promise<ContentAssetProject> {
  const normalizedId = String(input.id || '').trim();
  const projectName = String(input.projectName || '').replace(/\s+/g, ' ').trim();

  if (!normalizedId) {
    throw new Error('Project id wajib diisi.');
  }

  if (!projectName) {
    throw new Error('Nama project wajib diisi.');
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('content_asset_projects')
    .update({
      project_name: projectName,
      notes: input.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedId);

  if (error) {
    throw new Error(`Gagal mengubah project asset: ${error.message}`);
  }

  const { error: assetError } = await supabase
    .from('content_assets')
    .update({ project_name: projectName, updated_at: new Date().toISOString() })
    .eq('project_id', normalizedId);

  if (assetError) {
    throw new Error(`Gagal menyamakan nama project di asset: ${assetError.message}`);
  }

  if (input.tagIds) {
    await replaceContentAssetProjectTags(normalizedId, input.tagIds);
  }

  const project = await getContentAssetProject(normalizedId);
  if (!project) {
    throw new Error('Project asset tidak ditemukan.');
  }

  return project;
}

export async function deleteContentAsset(id: string): Promise<void> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Asset id wajib diisi.');
  }

  const supabase = getSupabaseAdminClient();
  const { data, error: lookupError } = await supabase
    .from('content_assets')
    .select('storage_bucket, storage_path')
    .eq('id', normalizedId)
    .single();

  if (lookupError) {
    throw new Error(`Gagal membaca asset: ${lookupError.message}`);
  }

  const record = data as Record<string, unknown>;
  const bucket = String(record.storage_bucket || CONTENT_ASSET_BUCKET);
  const path = String(record.storage_path || '');

  const { error: deleteRowError } = await supabase
    .from('content_assets')
    .delete()
    .eq('id', normalizedId);

  if (deleteRowError) {
    throw new Error(`Gagal menghapus metadata asset: ${deleteRowError.message}`);
  }

  if (path) {
    await supabase.storage.from(bucket).remove([path]);
  }
}

export async function deleteContentAssetProject(id: string): Promise<void> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Project id wajib diisi.');
  }

  const supabase = getSupabaseAdminClient();
  const { data: project, error: projectError } = await supabase
    .from('content_asset_projects')
    .select('id')
    .eq('id', normalizedId)
    .single();

  if (projectError) {
    if (projectError.code === 'PGRST116') {
      throw new Error('Project asset tidak ditemukan.');
    }
    throw new Error(`Gagal membaca project asset: ${projectError.message}`);
  }

  if (!project) {
    throw new Error('Project asset tidak ditemukan.');
  }

  const { data: assets, error: assetLookupError } = await supabase
    .from('content_assets')
    .select('storage_bucket, storage_path')
    .eq('project_id', normalizedId);

  if (assetLookupError) {
    throw new Error(`Gagal membaca asset project: ${assetLookupError.message}`);
  }

  const storagePathsByBucket = new Map<string, string[]>();
  (assets || []).forEach((asset) => {
    const bucket = String(asset.storage_bucket || CONTENT_ASSET_BUCKET);
    const path = String(asset.storage_path || '');
    if (!path) {
      return;
    }
    storagePathsByBucket.set(bucket, [...(storagePathsByBucket.get(bucket) || []), path]);
  });

  const { error: deleteAssetsError } = await supabase
    .from('content_assets')
    .delete()
    .eq('project_id', normalizedId);

  if (deleteAssetsError) {
    throw new Error(`Gagal menghapus metadata asset project: ${deleteAssetsError.message}`);
  }

  const { error: deleteProjectError } = await supabase
    .from('content_asset_projects')
    .delete()
    .eq('id', normalizedId);

  if (deleteProjectError) {
    throw new Error(`Gagal menghapus project asset: ${deleteProjectError.message}`);
  }

  for (const [bucket, paths] of storagePathsByBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      throw new Error(`Project terhapus, tapi gagal membersihkan storage bucket "${bucket}": ${error.message}`);
    }
  }
}
