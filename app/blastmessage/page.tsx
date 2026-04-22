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
    getPaginatedCsvContacts({ page: 1, pageSize: 12 }),
    getPaginatedContactGroups({ page: 1, pageSize: 12 }),
  ]);

  return (
    <AdminFeatureShell
      currentPath="/blastmessage"
      badge="Halaman blast message"
      title="Susun blast message dengan daftar penerima yang tetap jelas saat data membesar"
      description="Pilih penerima dari daftar kontak atau grup secara bertahap, cek hasilnya, lalu kirim tanpa memindahkan seluruh data penerima ke browser."
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
            Buka direktori grup
          </Button>
        </Link>
      }
    >
      <BlastComposer initialContacts={initialContacts} initialGroups={initialGroups} />
    </AdminFeatureShell>
  );
}
