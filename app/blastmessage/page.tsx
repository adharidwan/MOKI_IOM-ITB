import Link from 'next/link';
import { Button } from '@mui/material';

import AdminFeatureShell from '../components/AdminFeatureShell';
import BlastComposer from '../components/BlastComposer';
import { getCsvContacts } from '../lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BlastMessagePage() {
  const contacts = await getCsvContacts();
  const availableGroups = Array.from(
    new Set(contacts.flatMap((contact) => contact.group_names)),
  ).sort((left, right) => left.localeCompare(right));

  return (
    <AdminFeatureShell
      currentPath="/blastmessage"
      badge="Halaman blast message"
      title="Kirim pesan ke banyak nomor sekaligus dengan mudah"
      description="Pilih penerima dengan langkah yang singkat, cek kembali sebelum kirim, lalu pantau statusnya dengan jelas."
      actions={
        <Link href="/contacts" style={{ textDecoration: 'none' }}>
          <Button
            variant="outlined"
            size="large"
            sx={{
              minHeight: 56,
              borderRadius: 999,
              px: 3.5,
              borderColor: '#1f6f5f',
              color: '#1f6f5f',
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            Buka kontak & grup
          </Button>
        </Link>
      }
    >
      <BlastComposer contacts={contacts} availableGroups={availableGroups} />
    </AdminFeatureShell>
  );
}
