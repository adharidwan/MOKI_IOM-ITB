import AdminFeatureShell from '../components/AdminFeatureShell';
import { requireFeatureAccess } from '../lib/access-control';
import { listContentAssetProjects } from '../lib/content-assets';
import type { ContentAssetProject } from '../lib/types';

import ContentAssetsWorkspace from './ContentAssetsWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContentAssetsPage() {
  await requireFeatureAccess('content-assets');

  let projects: ContentAssetProject[] = [];
  let loadError: string | null = null;

  try {
    projects = await listContentAssetProjects();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Gagal memuat project asset konten.';
  }

  return (
    <AdminFeatureShell
      badge="Asset Drafting"
      title="Content Assets"
      description="Init project asset, lalu kelola kumpulan file image/video di halaman detail project."
      currentPath="/content-assets"
    >
      <ContentAssetsWorkspace projects={projects} initialLoadError={loadError} />
    </AdminFeatureShell>
  );
}
