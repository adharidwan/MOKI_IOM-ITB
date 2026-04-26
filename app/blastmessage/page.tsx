import Link from 'next/link';
import { Button } from '@mui/material';

import AdminFeatureShell from '../components/AdminFeatureShell';
import BlastComposer from '../components/BlastComposer';
import { getPaginatedCsvContacts } from '../lib/api';
import { getPaginatedContactGroups } from '../lib/group-directory-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BlastMessagePage() {
  const [initialContacts, initialGroups] = await Promise.all([
    getPaginatedCsvContacts({ page: 1, pageSize: 12, sortBy: 'nama', sortDir: 'asc' }),
    getPaginatedContactGroups({ page: 1, pageSize: 12, sortBy: 'memberCount', sortDir: 'desc' }),
  ]);

  return (
    <AdminFeatureShell
      currentPath="/blastmessage"
      badge="Blast"
      title="Susun blast message"
      description="Pilih penerima, tulis pesan, dan tinjau hasil render tanpa keluar dari satu workspace."
      actions={
        <Link href="/group" style={{ textDecoration: 'none' }}>
          <Button
            variant="outlined"
            size="large"
            sx={{
              minHeight: 52,
              borderRadius: 2.5,
              px: 3,
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
              Buka groups
            </Button>
          </Link>
      }
    >
      <BlastComposer initialContacts={initialContacts} initialGroups={initialGroups} />
    </AdminFeatureShell>
  );
}
