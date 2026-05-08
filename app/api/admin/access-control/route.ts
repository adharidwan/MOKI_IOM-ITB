import { NextResponse } from 'next/server';

import {
  FEATURE_DEFINITIONS,
  listManagedAccessUsers,
  replaceUserFeatureAccess,
  requireAdminFromRequest,
} from '@/app/lib/access-control';

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);

    return NextResponse.json({
      features: FEATURE_DEFINITIONS,
      users: await listManagedAccessUsers(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat pengaturan akses.' },
      { status: 403 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdminFromRequest(request);
    const body = (await request.json()) as { ssoSub?: string; features?: string[] };
    const ssoSub = String(body.ssoSub || '').trim();

    if (!ssoSub) {
      return NextResponse.json({ error: 'Target akun wajib dipilih.' }, { status: 400 });
    }

    const features = Array.isArray(body.features) ? body.features : [];
    const savedFeatures = await replaceUserFeatureAccess(ssoSub, features, actor.sub);

    return NextResponse.json({ success: true, ssoSub, features: savedFeatures });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menyimpan pengaturan akses.' },
      { status: 403 },
    );
  }
}
