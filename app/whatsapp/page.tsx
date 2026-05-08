import AdminFeatureShell from '../components/AdminFeatureShell';
import WhatsappDashboard from '../components/WhatsappDashboard';
import { requireFeatureAccess } from '../lib/access-control';
import { createWhatsappOpsRepository } from '../lib/whatsapp-ops-repository';
import { getWhatsappDashboardOverview } from '../lib/whatsapp-ops-service';

export const dynamic = 'force-dynamic';

export default async function WhatsappPage() {
  await requireFeatureAccess('whatsapp');
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
      badge="WhatsApp"
      title="WhatsApp Operations"
      description="Pantau instance, QR, runtime worker, dan antrean outbound WhatsApp."
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
