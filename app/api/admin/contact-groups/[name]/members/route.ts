import { getPaginatedGroupMembers } from '@/app/lib/group-directory-server';

export const runtime = 'nodejs';

type Props = {
  params: Promise<{ name: string }>;
};

export async function GET(request: Request, { params }: Props): Promise<Response> {
  const resolvedParams = await params;
  const { searchParams } = new URL(request.url);

  return Response.json(
    await getPaginatedGroupMembers({
      groupName: decodeURIComponent(resolvedParams.name),
      page: Number(searchParams.get('page') || '1'),
      pageSize: Number(searchParams.get('pageSize') || '20'),
      search: searchParams.get('search') || '',
    }),
  );
}
