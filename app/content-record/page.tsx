import AdminFeatureShell from '../components/AdminFeatureShell';
import { requireFeatureAccess } from '../lib/access-control';
import {
  getContentRecordingsOverview,
  getContentTags,
  getPaginatedContentRecordings,
  type ContentRecordingsOverview,
  type ContentRecordingSortKey,
  type PaginatedContentRecordingsResponse,
} from '../lib/api';
import type { ContentTag } from '../lib/types';

import ContentRecordingWorkspace from './ContentRecordingWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SORT_KEYS: ContentRecordingSortKey[] = ['title', 'platform', 'content_type', 'upload_date', 'created_at', 'updated_at'];

export default async function ContentRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireFeatureAccess('content-record');
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const pageSize = Number(resolvedSearchParams.pageSize) || 20;
  const search = String(resolvedSearchParams.search || '');
  const platform = String(resolvedSearchParams.platform || '');
  const contentType = String(resolvedSearchParams.contentType || '');
  const tagId = String(resolvedSearchParams.tagId || '');
  const rawSortBy = String(resolvedSearchParams.sortBy || 'upload_date');
  const rawSortDir = String(resolvedSearchParams.sortDir || 'desc');
  const sortBy = SORT_KEYS.includes(rawSortBy as ContentRecordingSortKey)
    ? rawSortBy as ContentRecordingSortKey
    : 'upload_date';
  const sortDir = rawSortDir === 'asc' ? 'asc' : 'desc';
  let loadError: string | null = null;
  const emptyPage: PaginatedContentRecordingsResponse = {
    items: [],
    total: 0,
    page: 1,
    pageSize,
    totalPages: 1,
  };
  let recordingsPage = emptyPage;
  let overview: ContentRecordingsOverview = {
    totalRecords: 0,
    platformCount: 0,
    thisMonthCount: 0,
    untaggedCount: 0,
  };
  let tags: ContentTag[] = [];

  try {
    [recordingsPage, overview, tags] = await Promise.all([
      getPaginatedContentRecordings({ page, pageSize, search, platform, contentType, tagId, sortBy, sortDir }),
      getContentRecordingsOverview(),
      getContentTags(),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : 'Gagal memuat content library dari database.';
  }

  return (
    <AdminFeatureShell
      badge="Content Library"
      title="Content Library"
      description="Kelola arsip konten yang sudah dipublikasikan dari YouTube, Instagram, X, website, dan kanal lain dalam satu tempat."
      currentPath="/content-record"
    >
      <ContentRecordingWorkspace
        recordings={recordingsPage.items}
        totalCount={recordingsPage.total}
        currentPage={recordingsPage.page}
        pageSize={recordingsPage.pageSize}
        totalPages={recordingsPage.totalPages}
        overview={overview}
        tags={tags}
        currentSearch={search}
        currentPlatform={platform}
        currentContentType={contentType}
        currentTagId={tagId}
        currentSortBy={sortBy}
        currentSortDir={sortDir}
        initialLoadError={loadError}
      />
    </AdminFeatureShell>
  );
}
