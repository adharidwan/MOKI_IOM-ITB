import { createWhatsappOpsRepository } from '../../../../../lib/whatsapp-ops-repository';
import { handleGetWhatsappInstanceRequest } from '../../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Props): Promise<Response> {
  const resolvedParams = await params;
  return handleGetWhatsappInstanceRequest(resolvedParams.id, createWhatsappOpsRepository());
}
