'use server';

import { revalidatePath } from 'next/cache';

import { requireFeatureAccess } from '../lib/access-control';
import { deleteUnusedContentTag } from '../lib/content-tags';

export interface DeleteContentTagResult {
  success: boolean;
  error?: string;
}

export async function deleteUnusedContentTagAction(id: string): Promise<DeleteContentTagResult> {
  try {
    await requireFeatureAccess('content-assets');
    await deleteUnusedContentTag(id);
    revalidatePath('/content-tags');
    revalidatePath('/content-record');
    revalidatePath('/content-assets');
    revalidatePath('/content-assets/[projectId]', 'page');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gagal menghapus tag.',
    };
  }
}
