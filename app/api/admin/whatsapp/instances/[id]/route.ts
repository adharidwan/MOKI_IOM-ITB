import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '../../../../../lib/access-control';
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

function forbiddenResponse(error: unknown): Response {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Akses ditolak.' },
    { status: 403 },
  );
}

export async function PATCH(request: Request, { params }: Props): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['whatsapp']);
    const resolvedParams = await params;
    return handleUpdateWhatsappInstanceRequest(resolvedParams.id, request, createWhatsappOpsRepository());
  } catch (error) {
    return forbiddenResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Props): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['whatsapp']);
    const resolvedParams = await params;
    return handleDeleteWhatsappInstanceRequest(
      resolvedParams.id,
      request,
      createWhatsappOpsRepository(),
      createWhatsappOrchestratorClient(),
    );
  } catch (error) {
    return forbiddenResponse(error);
  }
}

export async function GET(request: Request, { params }: Props): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['whatsapp']);
    const resolvedParams = await params;
    return handleGetWhatsappInstanceRequest(resolvedParams.id, createWhatsappOpsRepository());
  } catch (error) {
    return forbiddenResponse(error);
  }
}
