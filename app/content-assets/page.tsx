import AdminFeatureShell from '../components/AdminFeatureShell';
import { requireFeatureAccess } from '../lib/access-control';
import { getContentTags } from '../lib/api';
import { listContentAssetProjects } from '../lib/content-assets';
import type { ContentAssetProject, ContentTag } from '../lib/types';

import ContentAssetsWorkspace from './ContentAssetsWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContentAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireFeatureAccess('content-assets');
  const resolvedSearchParams = await searchParams;
  const search = String(resolvedSearchParams.search || '');
  const assetFilter = String(resolvedSearchParams.assetFilter || '');
  const tagIds = String(resolvedSearchParams.tagIds || resolvedSearchParams.tagId || '')
    .split(',')
    .map((tagId) => tagId.trim())
    .filter(Boolean);
  const sortDir = String(resolvedSearchParams.sortDir || 'desc') === 'asc' ? 'asc' : 'desc';

  let projects: ContentAssetProject[] = [];
  let tags: ContentTag[] = [];
  let loadError: string | null = null;

  try {
    [projects, tags] = await Promise.all([listContentAssetProjects(), getContentTags()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Gagal memuat project asset konten.';
  }

  const normalizedSearch = search.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedTagIds = new Set(tagIds);
  projects = projects
    .filter((project) => {
      const matchesSearch = !normalizedSearch || [
        project.project_name,
        project.notes || '',
        project.created_by,
        project.created_by_email || '',
        ...project.tags.map((tag) => tag.name),
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
      const matchesAssets =
        assetFilter === 'image'
          ? project.image_count > 0
          : assetFilter === 'video'
            ? project.video_count > 0
            : assetFilter === 'url'
              ? project.link_count > 0
              : assetFilter === 'empty'
                ? project.asset_count === 0
                : true;
      const matchesTags = !normalizedTagIds.size || project.tags.some((tag) => normalizedTagIds.has(tag.id));

      return matchesSearch && matchesAssets && matchesTags;
    })
    .sort((left, right) => {
      const leftTime = left.latest_asset_at ? new Date(left.latest_asset_at).getTime() : 0;
      const rightTime = right.latest_asset_at ? new Date(right.latest_asset_at).getTime() : 0;
      return sortDir === 'asc' ? leftTime - rightTime : rightTime - leftTime;
    });

  return (
    <AdminFeatureShell
      badge="Asset Management"
      title="Content Assets"
      description="Buat project, lalu kelola kumpulan file image/video di halaman detail project."
      currentPath="/content-assets"
    >
      <ContentAssetsWorkspace
        projects={projects}
        tags={tags}
        currentSearch={search}
        currentAssetFilter={assetFilter}
        currentTagIds={tagIds}
        currentSortDir={sortDir}
        initialLoadError={loadError}
      />
    </AdminFeatureShell>
  );
}
