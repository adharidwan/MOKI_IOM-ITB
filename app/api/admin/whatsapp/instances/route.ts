import { createWhatsappOpsRepository } from '../../../../lib/whatsapp-ops-repository';
import { handleGetWhatsappInstancesRequest } from '../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return handleGetWhatsappInstancesRequest(createWhatsappOpsRepository());
}
