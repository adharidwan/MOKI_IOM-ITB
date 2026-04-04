import WhatsappDashboard from '../components/WhatsappDashboard';
import { createWhatsappOpsRepository } from '../lib/whatsapp-ops-repository';
import { getWhatsappDashboardOverview } from '../lib/whatsapp-ops-service';

export const dynamic = 'force-dynamic';

export default async function WhatsappPage() {
  const repository = createWhatsappOpsRepository();
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
    <WhatsappDashboard
      initialOverview={overview}
      initialOutbound={outboundResponse}
      initialEvents={initialEvents}
    />
  );
}
