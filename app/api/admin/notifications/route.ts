import { NextResponse } from 'next/server';

import {
  getCurrentUserFromRequest,
  getGrantedFeaturesForUser,
} from '@/app/lib/access-control';
import { listAdminNotificationEvents } from '@/app/lib/notification-events';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUserFromRequest(request);
    const features = await getGrantedFeaturesForUser(user);

    if (!features.length) {
      return NextResponse.json({ events: [], cursor: new Date().toISOString() });
    }

    const { searchParams } = new URL(request.url);
    return NextResponse.json(await listAdminNotificationEvents(searchParams.get('since'), features));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat notifikasi.' },
      { status: 403 },
    );
  }
}
