import 'server-only';

import crypto from 'node:crypto';

import { uploadObject } from './object-storage';

export const BLAST_MEDIA_BUCKET = 'blast-assets';
export const MAX_BLAST_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export interface BlastMediaInput {
  bucket: string;
  path: string;
  mimeType: string;
  fileName: string;
}

export function sanitizeBlastMediaFileName(value: string): string {
  const normalized = value.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').trim();
  return normalized || 'blast-image';
}

export function normalizeBlastMediaInput(value: Partial<BlastMediaInput> | null | undefined): BlastMediaInput | null {
  const bucket = String(value?.bucket || '').trim();
  const path = String(value?.path || '').trim();
  const mimeType = String(value?.mimeType || '').trim();
  const fileName = String(value?.fileName || '').trim();

  if (!bucket || !path || !mimeType.startsWith('image/')) {
    return null;
  }

  return {
    bucket,
    path,
    mimeType,
    fileName: fileName || 'blast-image',
  };
}

export async function uploadBlastImage(file: File): Promise<BlastMediaInput> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File blast harus berupa image.');
  }

  if (file.size > MAX_BLAST_IMAGE_SIZE_BYTES) {
    throw new Error('Ukuran image blast maksimal 10 MB.');
  }

  const safeFileName = sanitizeBlastMediaFileName(file.name);
  const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeFileName}`;
  await uploadObject({
    bucket: BLAST_MEDIA_BUCKET,
    path: objectPath,
    body: await file.arrayBuffer(),
    contentType: file.type,
  });

  return {
    bucket: BLAST_MEDIA_BUCKET,
    path: objectPath,
    mimeType: file.type,
    fileName: safeFileName,
  };
}
