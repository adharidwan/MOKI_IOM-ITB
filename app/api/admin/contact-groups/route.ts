import { getPaginatedContactGroups } from '@/app/lib/group-directory-server';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  return Response.json(
    await getPaginatedContactGroups({
      page: Number(searchParams.get('page') || '1'),
      pageSize: Number(searchParams.get('pageSize') || '20'),
      search: searchParams.get('search') || '',
    }),
  );
}
