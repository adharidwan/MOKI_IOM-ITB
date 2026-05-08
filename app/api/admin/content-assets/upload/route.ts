import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import { CONTENT_ASSET_BUCKET, createContentAsset, getContentAssetProject } from '@/app/lib/content-assets';
import { getSupabaseAdminClient } from '@/app/lib/supabase-server';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ['image/', 'video/'];

function normalizeText(value: FormDataEntryValue | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sanitizeFileName(value: string): string {
  const normalized = value.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').trim();
  return normalized || 'asset';
}

export async function POST(request: Request) {
  try {
    const user = await requireAnyFeatureFromRequest(request, ['content-assets']);
    const formData = await request.formData();
    const projectId = normalizeText(formData.get('project_id'));
    const project = await getContentAssetProject(projectId);
    const projectName = project?.project_name || '';
    const notes = normalizeText(formData.get('notes'));
    const files = formData
      .getAll('asset_files')
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!projectName) {
      return NextResponse.json({ error: 'Project asset tidak ditemukan.' }, { status: 400 });
    }

    if (!files.length) {
      return NextResponse.json({ error: 'Minimal satu file image/video wajib dipilih.' }, { status: 400 });
    }

    const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE);
    if (oversizedFile) {
      return NextResponse.json({ error: `Ukuran file maksimal 100 MB: ${oversizedFile.name}.` }, { status: 400 });
    }

    const invalidFile = files.find((file) => !ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix)));
    if (invalidFile) {
      return NextResponse.json({ error: `File harus berupa image atau video: ${invalidFile.name}.` }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const uploadedObjects: string[] = [];

    try {
      for (const file of files) {
        const safeFileName = sanitizeFileName(file.name);
        const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage
          .from(CONTENT_ASSET_BUCKET)
          .upload(objectPath, await file.arrayBuffer(), {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Gagal upload ${file.name} ke Supabase Storage: ${uploadError.message}`);
        }

        uploadedObjects.push(objectPath);
        await createContentAsset({
          projectId,
          uploader: user.name || user.email || user.sub,
          uploaderEmail: user.email,
          projectName,
          originalFilename: file.name,
          storageBucket: CONTENT_ASSET_BUCKET,
          storagePath: objectPath,
          mimeType: file.type,
          fileSize: file.size,
          notes: notes || null,
        });
      }
    } catch (error) {
      if (uploadedObjects.length) {
        await supabase.storage.from(CONTENT_ASSET_BUCKET).remove(uploadedObjects);
      }

      throw error;
    }

    return NextResponse.json({ success: true, count: files.length });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Gagal menyimpan asset.';
    return NextResponse.json(
      { error: errorMessage },
      { status: errorMessage.includes('akses') || errorMessage.includes('Sesi SSO') ? 403 : 500 },
    );
  }
}
