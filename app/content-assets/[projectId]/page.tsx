import { notFound } from 'next/navigation';

import AdminFeatureShell from '../../components/AdminFeatureShell';
import { requireFeatureAccess } from '../../lib/access-control';
import { getContentAssetProject, listContentAssetsByProject } from '../../lib/content-assets';
import type { ContentAsset, ContentAssetProject } from '../../lib/types';

import ContentAssetDetailWorkspace from './ContentAssetDetailWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ContentAssetDetailPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ContentAssetDetailPage({ params }: ContentAssetDetailPageProps) {
  await requireFeatureAccess('content-assets');
  const { projectId } = await params;

  let project: ContentAssetProject | null = null;
  let assets: ContentAsset[] = [];
  let loadError: string | null = null;

  try {
    project = await getContentAssetProject(projectId);
    if (!project) {
      notFound();
    }
    assets = await listContentAssetsByProject(projectId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Gagal memuat detail project asset.';
  }

  if (!project) {
    notFound();
  }

  return (
    <AdminFeatureShell
      badge="Asset Drafting"
      title={project.project_name}
      description="Upload dan preview kumpulan asset image/video untuk project ini."
      currentPath="/content-assets"
    >
      <ContentAssetDetailWorkspace project={project} assets={assets} initialLoadError={loadError} />
    </AdminFeatureShell>
  );
}
