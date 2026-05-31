import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import { downloadContentAssetObject, getContentAsset } from '@/app/lib/content-assets';

function sanitizeDownloadName(value: string, fallback: string): string {
  const normalized = value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]+/g, '_').replace(/"/g, "'");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    await requireAnyFeatureFromRequest(request, ['content-assets']);
    const { assetId } = await params;
    const asset = await getContentAsset(assetId);

    if (!asset) {
      return NextResponse.json({ error: 'Asset tidak ditemukan.' }, { status: 404 });
    }

    if (asset.source_type === 'url') {
      return NextResponse.json({ error: 'Asset URL eksternal tidak memiliki file untuk didownload.' }, { status: 400 });
    }

    const file = await downloadContentAssetObject(asset);
    const fileName = sanitizeDownloadName(asset.original_filename, `asset-${asset.id}`);

    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': asset.mime_type || 'application/octet-stream',
        'Content-Length': String(file.size),
        'Content-Disposition': attachmentDisposition(fileName),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Gagal download asset.';
    return NextResponse.json(
      { error: errorMessage },
      { status: errorMessage.includes('akses') || errorMessage.includes('Sesi SSO') ? 403 : 500 },
    );
  }
}
