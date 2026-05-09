import AdminFeatureShell from '../components/AdminFeatureShell';
import BlastComposer from '../components/BlastComposer';
import ScheduledBlastPanel from '../components/ScheduledBlastPanel';
import { requireFeatureAccess } from '../lib/access-control';
import { getPaginatedCsvContacts } from '../lib/api';
import { getPaginatedContactGroups } from '../lib/group-directory-server';
import { listScheduledBlasts } from '../lib/scheduled-blast-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BlastMessagePage() {
  await requireFeatureAccess('blast');
  const [initialContacts, initialGroups, initialScheduledBlasts] = await Promise.all([
    getPaginatedCsvContacts({ page: 1, pageSize: 20, sortBy: 'nama', sortDir: 'asc' }),
    getPaginatedContactGroups({ page: 1, pageSize: 20, sortBy: 'memberCount', sortDir: 'desc' }),
    listScheduledBlasts(),
  ]);

  return (
    <AdminFeatureShell
      currentPath="/blastmessage"
      badge="Blast"
      title="Susun blast message"
      description="Pilih penerima, tulis pesan, dan tinjau hasil render tanpa keluar dari satu workspace."
    >
      <BlastComposer initialContacts={initialContacts} initialGroups={initialGroups} />
      <ScheduledBlastPanel initialData={initialScheduledBlasts} />
    </AdminFeatureShell>
  );
}
