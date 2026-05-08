import AdminFeatureShell from '../components/AdminFeatureShell';
import BlastComposer from '../components/BlastComposer';
import { getPaginatedCsvContacts } from '../lib/api';
import { getPaginatedContactGroups } from '../lib/group-directory-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BlastMessagePage() {
  const [initialContacts, initialGroups] = await Promise.all([
    getPaginatedCsvContacts({ page: 1, pageSize: 20, sortBy: 'nama', sortDir: 'asc' }),
    getPaginatedContactGroups({ page: 1, pageSize: 20, sortBy: 'memberCount', sortDir: 'desc' }),
  ]);

  return (
    <AdminFeatureShell
      currentPath="/blastmessage"
      badge="Blast"
      title="Susun blast message"
      description="Pilih penerima, tulis pesan, dan tinjau hasil render tanpa keluar dari satu workspace."
    >
      <BlastComposer initialContacts={initialContacts} initialGroups={initialGroups} />
    </AdminFeatureShell>
  );
}
