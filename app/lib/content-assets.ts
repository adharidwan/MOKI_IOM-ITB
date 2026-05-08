import 'server-only';

import { getSupabaseAdminClient } from './supabase-server';
import type { ContentAsset } from './types';

export const CONTENT_ASSET_BUCKET = 'content-assets';

export interface ContentAssetInput {
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
  projectName: string;
  notes?: string | null;
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
    project_name: String(record.project_name || ''),
    original_filename: String(record.original_filename || ''),
    storage_bucket: String(record.storage_bucket || CONTENT_ASSET_BUCKET),
    storage_path: String(record.storage_path || ''),
    mime_type: String(record.mime_type || ''),
    file_size: Number(record.file_size || 0),
    notes: record.notes === null || record.notes === undefined ? null : String(record.notes),
    signed_url: signedUrl,
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
    .select('*')
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

      return toContentAsset(rawRecord, signedUrl);
    }),
  );
}

export async function createContentAsset(input: ContentAssetInput): Promise<ContentAsset> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_assets')
    .insert({
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

  return toContentAsset(data as Record<string, unknown>, await createSignedUrl(input.storageBucket, input.storagePath));
}

export async function updateContentAsset(input: UpdateContentAssetInput): Promise<ContentAsset> {
  const normalizedId = String(input.id || '').trim();
  const projectName = String(input.projectName || '').trim();

  if (!normalizedId) {
    throw new Error('Asset id wajib diisi.');
  }

  if (!projectName) {
    throw new Error('Nama project wajib diisi.');
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_assets')
    .update({
      project_name: projectName,
      notes: input.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedId)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal mengubah metadata asset: ${error.message}`);
  }

  const record = data as Record<string, unknown>;
  return toContentAsset(
    record,
    await createSignedUrl(
      String(record.storage_bucket || CONTENT_ASSET_BUCKET),
      String(record.storage_path || ''),
    ),
  );
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
