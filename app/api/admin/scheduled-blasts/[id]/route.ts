import { NextResponse } from 'next/server';

import {
  deleteScheduledBlast,
  updateScheduledBlast,
  type SaveScheduledBlastInput,
} from '@/app/lib/scheduled-blast-service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as SaveScheduledBlastInput;
    const item = await updateScheduledBlast(id, body);
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memperbarui scheduled blast.' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteScheduledBlast(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menghapus scheduled blast.' },
      { status: 400 },
    );
  }
}
