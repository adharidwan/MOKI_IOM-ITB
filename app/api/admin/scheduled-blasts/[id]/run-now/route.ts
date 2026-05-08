import { NextResponse } from 'next/server';

import { runScheduledBlast } from '@/app/lib/scheduled-blast-service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await runScheduledBlast(id, { force: true });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menjalankan scheduled blast.' },
      { status: 400 },
    );
  }
}
