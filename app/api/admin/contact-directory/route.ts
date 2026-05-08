import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import { getPaginatedCsvContacts } from '@/app/lib/api';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['contacts', 'blast']);
    const { searchParams } = new URL(request.url);

    return Response.json(
      await getPaginatedCsvContacts({
        page: Number(searchParams.get('page') || '1'),
        pageSize: Number(searchParams.get('pageSize') || '20'),
        search: searchParams.get('search') || '',
        groupName: searchParams.get('groupName') || '',
        sortBy: (searchParams.get('sortBy') as 'imported_at' | 'nama' | 'no_telp' | 'status' | null) || undefined,
        sortDir: (searchParams.get('sortDir') as 'asc' | 'desc' | null) || undefined,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Akses ditolak.' },
      { status: 403 },
    );
  }
}
