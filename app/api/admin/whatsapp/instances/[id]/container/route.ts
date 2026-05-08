import { createWhatsappOrchestratorClient } from '../../../../../../lib/whatsapp-orchestrator';
import { createWhatsappOpsRepository } from '../../../../../../lib/whatsapp-ops-repository';
import { handleGetWhatsappInstanceContainerRequest } from '../../../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Props): Promise<Response> {
  const resolvedParams = await params;
  return handleGetWhatsappInstanceContainerRequest(
    resolvedParams.id,
    createWhatsappOpsRepository(),
    createWhatsappOrchestratorClient(),
  );
}
