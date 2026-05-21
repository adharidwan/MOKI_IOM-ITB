import 'server-only';

import crypto from 'node:crypto';

import { getSupabaseAdminClient } from './supabase-server';

export const TICKET_MEDIA_BUCKET = 'ticket-assets';
export const MAX_TICKET_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export interface TicketMediaInput {
  bucket: string;
  path: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

export function sanitizeTicketMediaFileName(value: string): string {
  const normalized = value.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').trim();
  return normalized || 'ticket-image';
}

export function normalizeTicketMediaInput(value: Partial<TicketMediaInput> | null | undefined): TicketMediaInput | null {
  const bucket = String(value?.bucket || '').trim();
  const path = String(value?.path || '').trim();
  const mimeType = String(value?.mimeType || '').trim();
  const fileName = String(value?.fileName || '').trim();
  const sizeBytes = Number(value?.sizeBytes || 0);

  if (!bucket || !path || !mimeType.startsWith('image/')) {
    return null;
  }

  return {
    bucket,
    path,
    mimeType,
    fileName: fileName || 'ticket-image',
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
  };
}

export async function uploadTicketImage(file: File): Promise<TicketMediaInput> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Lampiran tiket harus berupa image.');
  }

  if (file.size > MAX_TICKET_IMAGE_SIZE_BYTES) {
    throw new Error('Ukuran image tiket maksimal 10 MB.');
  }

  const supabase = getSupabaseAdminClient();
  const safeFileName = sanitizeTicketMediaFileName(file.name);
  const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeFileName}`;
  const { error } = await supabase.storage
    .from(TICKET_MEDIA_BUCKET)
    .upload(objectPath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`Gagal upload image tiket: ${error.message}`);
  }

  return {
    bucket: TICKET_MEDIA_BUCKET,
    path: objectPath,
    mimeType: file.type,
    fileName: safeFileName,
    sizeBytes: file.size,
  };
}

export async function createTicketMediaSignedUrl(bucket: string, path: string): Promise<string | null> {
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
