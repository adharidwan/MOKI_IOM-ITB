import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import { uploadBlastImage, type BlastMediaInput } from '@/app/lib/blast-media';
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
  media?: BlastMediaInput | null;
}

function parseJsonArray<T>(value: FormDataEntryValue | null): T[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseBoolean(value: FormDataEntryValue | null): boolean {
  return String(value || '').toLowerCase() === 'true';
}

async function parseBlastRequest(request: Request): Promise<BlastRequestBody> {
  const contentType = request.headers.get('content-type') || '';

  if (!contentType.includes('multipart/form-data')) {
    return (await request.json()) as BlastRequestBody;
  }

  const formData = await request.formData();
  const image = formData.get('image');
  const media = image instanceof File && image.size > 0 ? await uploadBlastImage(image) : null;

  return {
    message: String(formData.get('message') || ''),
    source: String(formData.get('source') || 'manual') as BlastSource,
    recipients: parseJsonArray<BlastRecipientInput>(formData.get('recipients')),
    groupNames: parseJsonArray<string>(formData.get('groupNames')),
    saveToGroup: parseBoolean(formData.get('saveToGroup')),
    groupName: String(formData.get('groupName') || ''),
    sourceFile: String(formData.get('sourceFile') || ''),
    media,
  };
}

export async function POST(request: Request) {
  try {
    await requireAnyFeatureFromRequest(request, ['blast']);
    const body = await parseBlastRequest(request);
    const result = await dispatchBlastMessage({
      message: String(body.message || ''),
      source: body.source || 'manual',
      recipients: Array.isArray(body.recipients) ? body.recipients : [],
      groupNames: Array.isArray(body.groupNames) ? body.groupNames : [],
      saveToGroup: Boolean(body.saveToGroup),
      groupName: String(body.groupName || ''),
      sourceFile: String(body.sourceFile || ''),
      media: body.media || null,
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
