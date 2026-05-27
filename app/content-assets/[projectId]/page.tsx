import { notFound } from 'next/navigation';

import AdminFeatureShell from '../../components/AdminFeatureShell';
import { requireFeatureAccess } from '../../lib/access-control';
import { getContentTags } from '../../lib/api';
import { getContentAssetProject, listContentAssetsByProject } from '../../lib/content-assets';
import type { ContentAsset, ContentAssetProject, ContentTag } from '../../lib/types';

import ContentAssetDetailWorkspace from './ContentAssetDetailWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ContentAssetDetailPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ContentAssetDetailPage({ params, searchParams }: ContentAssetDetailPageProps) {
  await requireFeatureAccess('content-assets');
  const { projectId } = await params;
  const resolvedSearchParams = await searchParams;
  const search = String(resolvedSearchParams.search || '');
  const contentType = String(resolvedSearchParams.contentType || '');
  const tagIds = String(resolvedSearchParams.tagIds || resolvedSearchParams.tagId || '')
    .split(',')
    .map((tagId) => tagId.trim())
    .filter(Boolean);

  let project: ContentAssetProject | null = null;
  let assets: ContentAsset[] = [];
  let tags: ContentTag[] = [];
  let loadError: string | null = null;

  try {
    [project, tags] = await Promise.all([getContentAssetProject(projectId), getContentTags()]);
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

  const normalizedSearch = search.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedTagIds = new Set(tagIds);
  assets = assets.filter((asset) => {
    const matchesSearch = !normalizedSearch || [
      asset.original_filename,
      asset.notes || '',
      asset.uploader,
      asset.uploader_email || '',
      ...asset.tags.map((tag) => tag.name),
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
    const matchesContentType =
      contentType === 'image'
        ? asset.mime_type.startsWith('image/')
        : contentType === 'video'
          ? asset.mime_type.startsWith('video/')
          : true;
    const matchesTags = !normalizedTagIds.size || asset.tags.some((tag) => normalizedTagIds.has(tag.id));

    return matchesSearch && matchesContentType && matchesTags;
  });

  return (
    <AdminFeatureShell
      badge="Asset Management"
      title={project.project_name}
      description="Upload dan preview kumpulan asset image/video untuk project ini."
      currentPath="/content-assets"
    >
      <ContentAssetDetailWorkspace
        project={project}
        assets={assets}
        tags={tags}
        currentSearch={search}
        currentContentType={contentType}
        currentTagIds={tagIds}
        initialLoadError={loadError}
      />
    </AdminFeatureShell>
  );
}
