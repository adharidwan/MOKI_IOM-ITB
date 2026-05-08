import { createWhatsappOrchestratorClient } from '../../../../../lib/whatsapp-orchestrator';
import { createWhatsappOpsRepository } from '../../../../../lib/whatsapp-ops-repository';
import {
  handleDeleteWhatsappInstanceRequest,
  handleGetWhatsappInstanceRequest,
  handleUpdateWhatsappInstanceRequest,
} from '../../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Props): Promise<Response> {
  const resolvedParams = await params;
  return handleGetWhatsappInstanceRequest(resolvedParams.id, createWhatsappOpsRepository());
}

export async function PATCH(request: Request, { params }: Props): Promise<Response> {
  const resolvedParams = await params;
  return handleUpdateWhatsappInstanceRequest(resolvedParams.id, request, createWhatsappOpsRepository());
}

export async function DELETE(request: Request, { params }: Props): Promise<Response> {
  const resolvedParams = await params;
  return handleDeleteWhatsappInstanceRequest(
    resolvedParams.id,
    request,
    createWhatsappOpsRepository(),
    createWhatsappOrchestratorClient(),
  );
}
