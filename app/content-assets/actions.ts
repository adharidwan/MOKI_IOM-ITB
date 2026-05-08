'use server';

import { revalidatePath } from 'next/cache';

import { requireFeatureAccess } from '../lib/access-control';
import {
  CONTENT_ASSET_BUCKET,
  createContentAsset,
  createContentAssetProject,
  deleteContentAsset,
  deleteContentAssetProject,
  getContentAssetProject,
  updateContentAsset,
  updateContentAssetProject,
} from '../lib/content-assets';
import { ensureContentTags } from '../lib/api';
import { getSupabaseAdminClient } from '../lib/supabase-server';
import type { ContentAsset, ContentAssetProject } from '../lib/types';

export interface ContentAssetActionResult {
  success: boolean;
  error?: string;
  count?: number;
}

export interface ContentAssetTagFormState {
  id: string;
  original_filename?: string;
  notes?: string;
  tag_ids: string[];
  new_tag_names: string[];
}

export interface ContentAssetProjectFormState {
  id: string;
  project_name: string;
  notes?: string;
  tag_ids: string[];
  new_tag_names: string[];
}

export interface SaveContentAssetResult extends ContentAssetActionResult {
  asset?: ContentAsset;
}

export interface SaveContentAssetProjectResult extends ContentAssetActionResult {
  project?: ContentAssetProject;
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

function normalizeTagIds(values: string[]): string[] {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

function normalizeTagNames(values: string[]): string[] {
  const byKey = new Map<string, string>();

  (values || []).forEach((value) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (normalized) {
      byKey.set(normalized.toLowerCase(), normalized);
    }
  });

  return Array.from(byKey.values());
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
    const notes = normalizeText(formData.get('notes'));

    await updateContentAsset({
      id,
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

export async function saveContentAssetTagsAction(input: ContentAssetTagFormState): Promise<SaveContentAssetResult> {
  try {
    await requireFeatureAccess('content-assets');
    const createdTags = await ensureContentTags(normalizeTagNames(input.new_tag_names));
    const asset = await updateContentAsset({
      id: input.id,
      originalFilename: normalizeText(input.original_filename || null),
      notes: normalizeText(input.notes || null) || null,
      tagIds: normalizeTagIds([...input.tag_ids, ...createdTags.map((tag) => tag.id)]),
    });

    revalidatePath('/content-assets');
    revalidatePath('/content-assets/[projectId]', 'page');
    return { success: true, asset };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gagal menyimpan tag asset.',
    };
  }
}

export async function saveContentAssetProjectAction(input: ContentAssetProjectFormState): Promise<SaveContentAssetProjectResult> {
  try {
    await requireFeatureAccess('content-assets');
    const createdTags = await ensureContentTags(normalizeTagNames(input.new_tag_names));
    const project = await updateContentAssetProject({
      id: input.id,
      projectName: normalizeText(input.project_name),
      notes: normalizeText(input.notes || null) || null,
      tagIds: normalizeTagIds([...input.tag_ids, ...createdTags.map((tag) => tag.id)]),
    });

    revalidatePath('/content-assets');
    revalidatePath(`/content-assets/${input.id}`);
    return { success: true, project };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gagal menyimpan project asset.',
    };
  }
}

export async function deleteContentAssetProjectAction(id: string): Promise<ContentAssetActionResult> {
  try {
    await requireFeatureAccess('content-assets');
    await deleteContentAssetProject(id);
    revalidatePath('/content-assets');
    revalidatePath('/content-assets/[projectId]', 'page');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gagal menghapus project asset.',
    };
  }
}
