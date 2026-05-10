import { NextResponse } from 'next/server';

import {
  createBlastTemplate,
  listBlastTemplates,
  type SaveBlastTemplateInput,
} from '@/app/lib/blast-template-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await listBlastTemplates({
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 10),
      search: searchParams.get('search') || '',
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat template blast.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveBlastTemplateInput;
    const item = await createBlastTemplate(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal membuat template blast.' },
      { status: 400 },
    );
  }
}
