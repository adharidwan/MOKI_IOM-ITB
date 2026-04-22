import { getDispatchSettings } from '@/app/lib/whatsapp-notification-repository';
import { createWhatsappOpsRepository } from '@/app/lib/whatsapp-ops-repository';
import { getOutboundTrackerResponse } from '@/app/lib/outbound-tracker-service';

export const runtime = 'nodejs';

function parseTrackedIds(request: Request): string[] {
  const { searchParams } = new URL(request.url);

  return Array.from(
    new Set(
      searchParams
        .getAll('id')
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0),
    ),
  );
}

export async function GET(request: Request): Promise<Response> {
  const repository = createWhatsappOpsRepository();

  return Response.json(
    await getOutboundTrackerResponse(
      {
        ...repository,
        getDispatchSettings,
      },
      parseTrackedIds(request),
    ),
  );
}
