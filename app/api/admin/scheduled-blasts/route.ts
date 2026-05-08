import { NextResponse } from 'next/server';

import {
  createScheduledBlast,
  listScheduledBlasts,
  type SaveScheduledBlastInput,
} from '@/app/lib/scheduled-blast-service';

export async function GET() {
  try {
    const items = await listScheduledBlasts();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat scheduled blast.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveScheduledBlastInput;
    const item = await createScheduledBlast(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal membuat scheduled blast.' },
      { status: 400 },
    );
  }
}
