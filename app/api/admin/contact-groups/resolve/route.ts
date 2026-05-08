import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import { resolveGroupRecipientsPreview } from '@/app/lib/group-directory-server';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['groups', 'blast']);
    const body = (await request.json()) as { groupNames?: string[] };

    return Response.json(
      await resolveGroupRecipientsPreview(Array.isArray(body.groupNames) ? body.groupNames : []),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Gagal memuat preview penerima grup.',
      },
      { status: 500 },
    );
  }
}
