import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '../../../../lib/access-control';
import { createWhatsappOpsRepository } from '../../../../lib/whatsapp-ops-repository';
import {
  handleCreateWhatsappInstanceRequest,
  handleGetWhatsappInstancesRequest,
} from '../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

function forbiddenResponse(error: unknown): Response {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Akses ditolak.' },
    { status: 403 },
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['whatsapp']);
    return handleCreateWhatsappInstanceRequest(request, createWhatsappOpsRepository());
  } catch (error) {
    return forbiddenResponse(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['whatsapp']);
    return handleGetWhatsappInstancesRequest(createWhatsappOpsRepository());
  } catch (error) {
    return forbiddenResponse(error);
  }
}
