import AdminFeatureShell from '../components/AdminFeatureShell';
import WhatsappDashboard from '../components/WhatsappDashboard';
import { createWhatsappOpsRepository } from '../lib/whatsapp-ops-repository';
import { getWhatsappDashboardOverview } from '../lib/whatsapp-ops-service';

export const dynamic = 'force-dynamic';

export default async function WhatsappPage() {
  const repository = createWhatsappOpsRepository();
  const initialRenderedAt = new Date().toISOString();
  const [overview, outboundResponse, initialEvents] = await Promise.all([
    getWhatsappDashboardOverview(repository),
    repository.listRecentOutbound(25).then(async (items) => ({
      summary: await repository.getOutboundSummary(),
      items,
    })),
    repository.listInstances().then(async (instances) => {
      const firstInstance = instances[0];

      if (!firstInstance) {
        return [];
      }

      return repository.listInstanceEvents(firstInstance.id, 25);
    }),
  ]);

  return (
    <AdminFeatureShell
      currentPath="/whatsapp"
      badge="WhatsApp Ops"
      title="WhatsApp Operations"
      description="Monitor device health, QR login needs, queues, and delivery issues from one operational workspace."
    >
      <WhatsappDashboard
        initialOverview={overview}
        initialOutbound={outboundResponse}
        initialEvents={initialEvents}
        initialRenderedAt={initialRenderedAt}
      />
    </AdminFeatureShell>
  );
}
