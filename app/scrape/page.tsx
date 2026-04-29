import AdminFeatureShell from '../components/AdminFeatureShell';
import ContentScrapingWorkspace from './content-scraping-workspace';

export default function ContentManagementPage() {
  return (
    <AdminFeatureShell
      badge="Content"
      title="Channel Content Scraping"
      description="Ambil data konten level channel dari YouTube, X, dan Instagram sekaligus. Output bersifat batch (banyak post), lalu bisa dipilih untuk dicatat satu per satu di Content Library."
      currentPath="/scrape"
    >
      <ContentScrapingWorkspace />
    </AdminFeatureShell>
  );
}
