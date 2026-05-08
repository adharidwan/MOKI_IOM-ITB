'use server';

import { revalidatePath } from 'next/cache';

import { requireFeatureAccess } from '../lib/access-control';
import {
  CONTENT_ASSET_BUCKET,
  createContentAsset,
  createContentAssetProject,
  deleteContentAsset,
  getContentAssetProject,
  updateContentAsset,
} from '../lib/content-assets';
import { getSupabaseAdminClient } from '../lib/supabase-server';

export interface ContentAssetActionResult {
  success: boolean;
  error?: string;
  count?: number;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ['image/', 'video/'];

function normalizeText(value: FormDataEntryValue | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sanitizeFileName(value: string): string {
  const normalized = value.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').trim();
  return normalized || 'asset';
}

export async function createContentAssetProjectAction(formData: FormData): Promise<ContentAssetActionResult & { projectId?: string }> {
  try {
    const user = await requireFeatureAccess('content-assets');
    const projectName = normalizeText(formData.get('project_name'));
    const notes = normalizeText(formData.get('notes'));

    const project = await createContentAssetProject({
      createdBy: user.name || user.email || user.sub,
      createdByEmail: user.email,
      projectName,
      notes: notes || null,
    });

    revalidatePath('/content-assets');
    return { success: true, projectId: project.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gagal membuat project asset.',
    };
  }
}

export async function uploadContentAssetAction(formData: FormData): Promise<ContentAssetActionResult> {
  try {
    const user = await requireFeatureAccess('content-assets');
    const projectId = normalizeText(formData.get('project_id'));
    const project = await getContentAssetProject(projectId);
    const projectName = project?.project_name || '';
    const notes = normalizeText(formData.get('notes'));
    const files = formData
      .getAll('asset_files')
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!projectName) {
      return { success: false, error: 'Project asset tidak ditemukan.' };
    }

    if (!files.length) {
      return { success: false, error: 'Minimal satu file image/video wajib dipilih.' };
    }

    const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE);
    if (oversizedFile) {
      return { success: false, error: `Ukuran file maksimal 100 MB: ${oversizedFile.name}.` };
    }

    const invalidFile = files.find((file) => !ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix)));
    if (invalidFile) {
      return { success: false, error: `File harus berupa image atau video: ${invalidFile.name}.` };
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

    revalidatePath('/content-assets');
    revalidatePath(`/content-assets/${projectId}`);
    return { success: true, count: files.length };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gagal menyimpan asset.',
    };
  }
}

export async function updateContentAssetAction(formData: FormData): Promise<ContentAssetActionResult> {
  try {
    await requireFeatureAccess('content-assets');
    const id = normalizeText(formData.get('id'));
    const projectName = normalizeText(formData.get('project_name'));
    const notes = normalizeText(formData.get('notes'));

    await updateContentAsset({
      id,
      projectName,
      notes: notes || null,
    });

    revalidatePath('/content-assets');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gagal mengubah asset.',
    };
  }
}

export async function deleteContentAssetAction(id: string): Promise<ContentAssetActionResult> {
  try {
    await requireFeatureAccess('content-assets');
    await deleteContentAsset(id);
    revalidatePath('/content-assets');
    revalidatePath('/content-assets/[projectId]', 'page');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gagal menghapus asset.',
    };
  }
}
