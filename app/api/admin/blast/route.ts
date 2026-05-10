import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import {
  BlastDispatchError,
  dispatchBlastMessage,
  type BlastSource,
  type BlastRecipientInput,
} from '@/app/lib/blast-dispatch-service';

interface BlastRequestBody {
  message?: string;
  source?: BlastSource;
  recipients?: BlastRecipientInput[];
  groupNames?: string[];
  saveToGroup?: boolean;
  groupName?: string;
  sourceFile?: string;
}

export async function POST(request: Request) {
  try {
    await requireAnyFeatureFromRequest(request, ['blast']);
    const body = (await request.json()) as BlastRequestBody;
    const result = await dispatchBlastMessage({
      message: String(body.message || ''),
      source: body.source || 'manual',
      recipients: Array.isArray(body.recipients) ? body.recipients : [],
      groupNames: Array.isArray(body.groupNames) ? body.groupNames : [],
      saveToGroup: Boolean(body.saveToGroup),
      groupName: String(body.groupName || ''),
      sourceFile: String(body.sourceFile || ''),
    });

    return NextResponse.json(result, { status: result.failedCount > 0 ? 207 : 200 });
  } catch (error) {
    if (error instanceof BlastDispatchError) {
      return NextResponse.json(
        {
          error: error.message,
          ...error.result,
        },
        { status: error.status },
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Gagal memproses blast message.';
    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: errorMessage.includes('akses') || errorMessage.includes('Sesi SSO') ? 403 : 500 },
    );
  }
}
