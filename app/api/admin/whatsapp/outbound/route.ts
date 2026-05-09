import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '../../../../lib/access-control';
import { createWhatsappOpsRepository } from '../../../../lib/whatsapp-ops-repository';
import { handleGetWhatsappOutboundRequest } from '../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['whatsapp']);
    return handleGetWhatsappOutboundRequest(createWhatsappOpsRepository());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Akses ditolak.' },
      { status: 403 },
    );
  }
}
