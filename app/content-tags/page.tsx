import AdminFeatureShell from '../components/AdminFeatureShell';
import { requireFeatureAccess } from '../lib/access-control';
import { listManagedContentTags, type ManagedContentTag } from '../lib/content-tags';

import ContentTagsWorkspace from './ContentTagsWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContentTagsPage() {
  await requireFeatureAccess('content-assets');

  let tags: ManagedContentTag[] = [];
  let loadError: string | null = null;

  try {
    tags = await listManagedContentTags();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Gagal memuat tag konten.';
  }

  return (
    <AdminFeatureShell
      badge="Content Taxonomy"
      title="Content Tags"
      description="Kelola tag konten dan hapus tag yang sudah tidak dipakai oleh library maupun content assets."
      currentPath="/content-tags"
    >
      <ContentTagsWorkspace tags={tags} initialLoadError={loadError} />
    </AdminFeatureShell>
  );
}
