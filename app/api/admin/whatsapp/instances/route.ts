import { createWhatsappOpsRepository } from '../../../../lib/whatsapp-ops-repository';
import {
  handleCreateWhatsappInstanceRequest,
  handleGetWhatsappInstancesRequest,
} from '../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return handleGetWhatsappInstancesRequest(createWhatsappOpsRepository());
}

export async function POST(request: Request): Promise<Response> {
  return handleCreateWhatsappInstanceRequest(request, createWhatsappOpsRepository());
}
