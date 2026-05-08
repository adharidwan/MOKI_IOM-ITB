import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '../../../../../../lib/access-control';
import { createWhatsappOrchestratorClient } from '../../../../../../lib/whatsapp-orchestrator';
import { createWhatsappOpsRepository } from '../../../../../../lib/whatsapp-ops-repository';
import { handleWhatsappInstanceContainerActionRequest } from '../../../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Props): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['whatsapp']);
    const resolvedParams = await params;
    return handleWhatsappInstanceContainerActionRequest(
      'restart',
      resolvedParams.id,
      createWhatsappOpsRepository(),
      createWhatsappOrchestratorClient(),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Akses ditolak.' },
      { status: 403 },
    );
  }
}
