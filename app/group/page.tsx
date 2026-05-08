import AdminFeatureShell from '../components/AdminFeatureShell';
import GroupDirectory from '../components/GroupDirectory';
import PhoneListToast from '../components/PhoneListToast';
import { getPaginatedContactGroups, getPaginatedGroupMembers } from '../lib/group-directory-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GroupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const search = String(resolvedSearchParams.search || '');
  const rawSortBy = String(resolvedSearchParams.sortBy || 'memberCount');
  const rawSortDir = String(resolvedSearchParams.sortDir || 'desc');
  const sortBy = rawSortBy === 'name' ? 'name' : 'memberCount';
  const sortDir = rawSortDir === 'asc' ? 'asc' : 'desc';
  const memberPage = Number(resolvedSearchParams.memberPage) || 1;
  const memberSearch = String(resolvedSearchParams.memberSearch || '');
  const rawMemberSortBy = String(resolvedSearchParams.memberSortBy || 'nama');
  const rawMemberSortDir = String(resolvedSearchParams.memberSortDir || 'asc');
  const memberSortBy = rawMemberSortBy === 'no_telp' || rawMemberSortBy === 'jenis_kelamin' ? rawMemberSortBy : 'nama';
  const memberSortDir = rawMemberSortDir === 'desc' ? 'desc' : 'asc';
  const groups = await getPaginatedContactGroups({ page, pageSize: 16, search, sortBy, sortDir });
  const selectedGroupName = String(resolvedSearchParams.group || groups.items[0]?.name || '');
  const members = selectedGroupName
    ? await getPaginatedGroupMembers({
        groupName: selectedGroupName,
        page: memberPage,
        pageSize: 20,
        search: memberSearch,
        sortBy: memberSortBy,
        sortDir: memberSortDir,
      })
    : {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
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
