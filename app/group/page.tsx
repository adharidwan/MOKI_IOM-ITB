import AdminFeatureShell from '../components/AdminFeatureShell';
import GroupDirectory from '../components/GroupDirectory';
import PhoneListToast from '../components/PhoneListToast';
import { requireFeatureAccess } from '../lib/access-control';
import { getPaginatedCsvContacts } from '../lib/api';
import { getPaginatedContactGroups, getPaginatedGroupMembers } from '../lib/group-directory-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GroupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireFeatureAccess('groups');
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const pageSize = Number(resolvedSearchParams.pageSize) || 20;
  const search = String(resolvedSearchParams.search || '');
  const rawSortBy = String(resolvedSearchParams.sortBy || 'memberCount');
  const rawSortDir = String(resolvedSearchParams.sortDir || 'desc');
  const sortBy = rawSortBy === 'name' ? 'name' : 'memberCount';
  const sortDir = rawSortDir === 'asc' ? 'asc' : 'desc';
  const memberPage = Number(resolvedSearchParams.memberPage) || 1;
  const memberPageSize = Number(resolvedSearchParams.memberPageSize) || 20;
  const memberSearch = String(resolvedSearchParams.memberSearch || '');
  const rawMemberSortBy = String(resolvedSearchParams.memberSortBy || 'nama');
  const rawMemberSortDir = String(resolvedSearchParams.memberSortDir || 'asc');
  const memberSortBy = rawMemberSortBy === 'no_telp' || rawMemberSortBy === 'jenis_kelamin' ? rawMemberSortBy : 'nama';
  const memberSortDir = rawMemberSortDir === 'desc' ? 'desc' : 'asc';
  const [groups, contactOptions] = await Promise.all([
    getPaginatedContactGroups({ page, pageSize, search, sortBy, sortDir }),
    getPaginatedCsvContacts({ page: 1, pageSize: 100, search: '', sortBy: 'nama', sortDir: 'asc' }),
  ]);
  const selectedGroupName = String(resolvedSearchParams.group || groups.items[0]?.name || '');
  const members = selectedGroupName
    ? await getPaginatedGroupMembers({
        groupName: selectedGroupName,
        page: memberPage,
        pageSize: memberPageSize,
        search: memberSearch,
        sortBy: memberSortBy,
        sortDir: memberSortDir,
      })
    : {
        items: [],
        total: 0,
        page: 1,
        pageSize: memberPageSize,
        totalPages: 1,
      };

  return (
    <AdminFeatureShell
      currentPath="/group"
      badge="Groups"
      title="Kelola grup penerima"
      description="Pantau grup dan anggota dalam satu dashboard agar segmentasi selalu siap dipakai untuk blast."
    >
      <PhoneListToast />

      <GroupDirectory
        groups={groups}
        contactOptions={contactOptions.items}
        selectedGroupName={selectedGroupName}
        members={members}
        currentSearch={search}
        currentMemberSearch={memberSearch}
        currentSortBy={sortBy}
        currentSortDir={sortDir}
        currentMemberSortBy={memberSortBy}
        currentMemberSortDir={memberSortDir}
      />
    </AdminFeatureShell>
  );
}
