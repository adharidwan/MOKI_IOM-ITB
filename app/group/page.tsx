import Link from 'next/link';
import { Button, Stack } from '@mui/material';

import AdminFeatureShell from '../components/AdminFeatureShell';
import GroupDirectory from '../components/GroupDirectory';
import PhoneListToast from '../components/PhoneListToast';
import { requireFeatureAccess } from '../lib/access-control';
import { getPaginatedContactGroups, getPaginatedGroupMembers } from '../lib/group-directory-server';
import { adminPalette } from '../lib/adminPalette';

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
      actions={
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Link href="/contacts" style={{ textDecoration: 'none' }}>
            <Button
              variant="outlined"
              size="large"
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2.5,
                borderColor: adminPalette.borderStrong,
                color: adminPalette.textSecondary,
                backgroundColor: adminPalette.surface,
                '&:hover': {
                  borderColor: adminPalette.brandSoftStrong,
                  backgroundColor: adminPalette.brandSoft,
                },
              }}
            >
              Buka direktori kontak
            </Button>
          </Link>
          <Link href="/blastmessage" style={{ textDecoration: 'none' }}>
            <Button
              variant="contained"
              size="large"
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2.5,
                boxShadow: 'none',
                backgroundColor: adminPalette.brand,
                '&:hover': {
                  backgroundColor: adminPalette.brandDark,
                  boxShadow: 'none',
                },
              }}
            >
              Buka blast
            </Button>
          </Link>
        </Stack>
      }
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
