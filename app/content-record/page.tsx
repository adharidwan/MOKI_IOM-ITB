import AdminFeatureShell from '../components/AdminFeatureShell';
import { getContentRecordings } from '../lib/api';
import type { ContentRecording } from '../lib/types';

import ContentRecordingWorkspace from './ContentRecordingWorkspace';

export default async function ContentRecordPage() {
  let recordings: ContentRecording[] = [];
  let loadError: string | null = null;

  try {
    recordings = await getContentRecordings();
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : 'Gagal memuat content recording dari database.';
  }

  return (
    <AdminFeatureShell
      badge="Content"
      title="Content Recording"
      description="Catat konten dari YouTube, X, dan Instagram. Link bisa di-paste untuk auto-fill metadata, lalu tetap bisa dikoreksi manual sebelum disimpan."
      currentPath="/content-record"
    >
      <ContentRecordingWorkspace initialRecordings={recordings} initialLoadError={loadError} />
    </AdminFeatureShell>
  );
}
