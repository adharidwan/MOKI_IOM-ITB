import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import {
  type CookiePlatform,
  deleteUploadedCookies,
  getAllCookieStatuses,
  getCookieStatus,
  saveUploadedCookies,
  validateAndNormalizeCookieFile,
} from '@/app/lib/platform-cookies';

const VALID_PLATFORMS: CookiePlatform[] = ['instagram', 'youtube', 'x'];

const PLATFORM_LABELS: Record<CookiePlatform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  x: 'X',
};

function normalizeText(value: FormDataEntryValue | null): string {
  return String(value || '').trim();
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['scrape', 'content-record']);

    const statuses = getAllCookieStatuses();

    return NextResponse.json({ statuses });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Gagal mengambil status cookies.';
    return NextResponse.json(
      { error: errorMessage },
      { status: errorMessage.includes('akses') || errorMessage.includes('Sesi SSO') ? 403 : 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['scrape', 'content-record']);

    const formData = await request.formData();
    const platform = normalizeText(formData.get('platform')) as CookiePlatform;

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: 'Platform tidak valid. Gunakan: instagram, youtube, atau x.' },
        { status: 400 },
      );
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: 'File cookies wajib diunggah.' },
        { status: 400 },
      );
    }

    const rawContent = await file.text();

    if (!rawContent || !rawContent.trim()) {
      return NextResponse.json(
        { error: 'File cookies kosong.' },
        { status: 400 },
      );
    }

    const validation = validateAndNormalizeCookieFile(platform, rawContent);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'File cookies tidak valid.' },
        { status: 400 },
      );
    }

    const contentToSave = validation.normalizedContent || rawContent;

    saveUploadedCookies(platform, contentToSave);

    const status = getCookieStatus(platform);

    return NextResponse.json({
      success: true,
      platform,
      format: validation.format,
      status,
      message: `Cookies ${PLATFORM_LABELS[platform]} berhasil diperbarui.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Gagal menyimpan cookies.';
    return NextResponse.json(
      { error: errorMessage },
      { status: errorMessage.includes('akses') || errorMessage.includes('Sesi SSO') ? 403 : 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    await requireAnyFeatureFromRequest(request, ['scrape', 'content-record']);

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as CookiePlatform;

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: 'Platform tidak valid. Gunakan: instagram, youtube, atau x.' },
        { status: 400 },
      );
    }

    deleteUploadedCookies(platform);

    const status = getCookieStatus(platform);

    return NextResponse.json({
      success: true,
      platform,
      status,
      message: `Cookies ${PLATFORM_LABELS[platform]} berhasil dihapus. Kini menggunakan fallback dari environment.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Gagal menghapus cookies.';
    return NextResponse.json(
      { error: errorMessage },
      { status: errorMessage.includes('akses') || errorMessage.includes('Sesi SSO') ? 403 : 500 },
    );
  }
}
