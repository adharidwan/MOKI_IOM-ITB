import { createWhatsappOpsRepository } from '../../../../lib/whatsapp-ops-repository';
import { handleGetWhatsappOutboundRequest } from '../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return handleGetWhatsappOutboundRequest(createWhatsappOpsRepository());
}
