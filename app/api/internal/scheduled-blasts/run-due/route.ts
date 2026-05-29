import { NextResponse } from 'next/server';

import { runDueScheduledBlasts } from '@/app/lib/scheduled-blast-service';

export const runtime = 'nodejs';

function getBearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') || '';
  const [scheme, token] = authorization.split(/\s+/, 2);

  return scheme.toLowerCase() === 'bearer' ? token || '' : '';
}

export async function POST(request: Request): Promise<Response> {
  const schedulerSecret = process.env.SCHEDULER_SECRET || '';

  if (!schedulerSecret) {
    return NextResponse.json({ error: 'SCHEDULER_SECRET belum dikonfigurasi.' }, { status: 503 });
  }

  if (getBearerToken(request) !== schedulerSecret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const results = await runDueScheduledBlasts();
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menjalankan scheduled blast.' },
      { status: 500 },
    );
  }
}
