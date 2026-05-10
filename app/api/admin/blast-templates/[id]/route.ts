import { NextResponse } from 'next/server';

import {
  deleteBlastTemplate,
  updateBlastTemplate,
  type SaveBlastTemplateInput,
} from '@/app/lib/blast-template-service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as SaveBlastTemplateInput;
    const item = await updateBlastTemplate(id, body);
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memperbarui template blast.' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteBlastTemplate(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menghapus template blast.' },
      { status: 400 },
    );
  }
}
