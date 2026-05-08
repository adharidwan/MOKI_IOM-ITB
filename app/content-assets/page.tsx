import AdminFeatureShell from '../components/AdminFeatureShell';
import { requireFeatureAccess } from '../lib/access-control';
import { listContentAssets } from '../lib/content-assets';
import type { ContentAsset } from '../lib/types';

import ContentAssetsWorkspace from './ContentAssetsWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContentAssetsPage() {
  await requireFeatureAccess('content-assets');

  let assets: ContentAsset[] = [];
  let loadError: string | null = null;

  try {
    assets = await listContentAssets();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Gagal memuat asset konten.';
  }

  return (
    <AdminFeatureShell
      badge="Asset Drafting"
      title="Content Assets"
      description="Drafting dan manajemen file image/video untuk kebutuhan konten sebelum masuk ke publikasi."
      currentPath="/content-assets"
    >
      <ContentAssetsWorkspace assets={assets} initialLoadError={loadError} />
    </AdminFeatureShell>
  );
}
