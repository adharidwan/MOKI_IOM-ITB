import { NextResponse } from 'next/server';

import { runDueScheduledBlasts } from '@/app/lib/scheduled-blast-service';

function isAuthorized(request: Request): boolean {
  const expectedSecret = process.env.SCHEDULED_BLAST_RUNNER_SECRET;
  if (!expectedSecret) {
    return true;
  }

  return request.headers.get('x-scheduled-blast-secret') === expectedSecret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const results = await runDueScheduledBlasts();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menjalankan scheduled blast jatuh tempo.' },
      { status: 500 },
    );
  }
}
