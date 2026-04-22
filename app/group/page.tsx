import Link from 'next/link';
import { Button, Stack } from '@mui/material';

import AdminFeatureShell from '../components/AdminFeatureShell';
import GroupDirectory from '../components/GroupDirectory';
import { getPaginatedContactGroups, getPaginatedGroupMembers } from '../lib/group-directory-server';
import { adminPalette } from '../lib/adminPalette';

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
  const memberPage = Number(resolvedSearchParams.memberPage) || 1;
  const memberSearch = String(resolvedSearchParams.memberSearch || '');
  const groups = await getPaginatedContactGroups({ page, pageSize: 16, search });
  const selectedGroupName = String(resolvedSearchParams.group || groups.items[0]?.name || '');
  const members = selectedGroupName
    ? await getPaginatedGroupMembers({
        groupName: selectedGroupName,
        page: memberPage,
        pageSize: 20,
        search: memberSearch,
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
      badge="Direktori grup"
      title="Tinjau grup penerima sebelum dipakai untuk blast"
      description="Lihat grup yang tersedia, cek siapa saja anggotanya, lalu lanjut ke blast dengan daftar yang lebih mudah dipahami."
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
              Kelola kontak
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
              Buka blast message
            </Button>
          </Link>
        </Stack>
      }
    >
      <GroupDirectory
        groups={groups}
        selectedGroupName={selectedGroupName}
        members={members}
        currentSearch={search}
        currentMemberSearch={memberSearch}
      />
    </AdminFeatureShell>
  );
}
