import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import { getPaginatedContactGroups } from '@/app/lib/group-directory-server';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['groups', 'blast']);
    const { searchParams } = new URL(request.url);

    return Response.json(
      await getPaginatedContactGroups({
        page: Number(searchParams.get('page') || '1'),
        pageSize: Number(searchParams.get('pageSize') || '20'),
        search: searchParams.get('search') || '',
        sortBy: (searchParams.get('sortBy') as 'name' | 'memberCount' | null) || undefined,
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
