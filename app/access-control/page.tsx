import AdminFeatureShell from '../components/AdminFeatureShell';
import {
  FEATURE_DEFINITIONS,
  getAccessControlOverview,
  getPaginatedManagedAccessUsers,
  type AccessControlOverview,
  type PaginatedManagedAccessUsersResponse,
  requireAdminAccess,
} from '../lib/access-control';

import AccessControlDashboardWorkspace from './AccessControlDashboardWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AccessControlPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdminAccess();
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const pageSize = Number(resolvedSearchParams.pageSize) || 20;
  const search = String(resolvedSearchParams.search || '');
  const featureKey = String(resolvedSearchParams.featureKey || '');
  let loadError: string | null = null;
  let usersPage: PaginatedManagedAccessUsersResponse = {
    items: [],
    total: 0,
    page: 1,
    pageSize,
    totalPages: 1,
  };
  let overview: AccessControlOverview = {
    totalUsers: 0,
    adminUsers: 0,
    nonAdminUsers: 0,
    usersWithAccess: 0,
  };

  try {
    [usersPage, overview] = await Promise.all([
      getPaginatedManagedAccessUsers({ page, pageSize, search, featureKey }),
      getAccessControlOverview(),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Gagal memuat dashboard akses.';
  }

  return (
    <AdminFeatureShell
      currentPath="/access-control"
      badge="Admin"
      title="Access Control"
      description="Atur fitur yang bisa dibuka oleh setiap akun SSO non-admin."
    >
      <AccessControlDashboardWorkspace
        key={`${search}|${featureKey}|${usersPage.page}|${usersPage.pageSize}`}
        users={usersPage.items}
        totalCount={usersPage.total}
        currentPage={usersPage.page}
        pageSize={usersPage.pageSize}
        totalPages={usersPage.totalPages}
        overview={overview}
        features={FEATURE_DEFINITIONS}
        currentSearch={search}
        currentFeatureKey={featureKey}
        initialLoadError={loadError}
      />
    </AdminFeatureShell>
  );
}
