import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import {
  downloadContentAssetObject,
  getContentAssetProject,
  listContentAssetsByProject,
} from '@/app/lib/content-assets';
import { createZip, type ZipFileEntry } from '@/app/lib/zip';

function sanitizeDownloadName(value: string, fallback: string): string {
  const normalized = value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  if (mimeType === 'video/mp4') return '.mp4';
  if (mimeType === 'video/webm') return '.webm';
  if (mimeType === 'video/quicktime') return '.mov';
  return '';
}

function ensureUniqueName(fileName: string, usedNames: Set<string>): string {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }

  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';
  let index = 2;
  let candidate = `${baseName}-${index}${extension}`;

  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${baseName}-${index}${extension}`;
  }

  usedNames.add(candidate);
  return candidate;
}

function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]+/g, '_').replace(/"/g, "'");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    await requireAnyFeatureFromRequest(request, ['content-assets']);
    const { projectId } = await params;
    const project = await getContentAssetProject(projectId);

    if (!project) {
      return NextResponse.json({ error: 'Project asset tidak ditemukan.' }, { status: 404 });
    }

    const assets = await listContentAssetsByProject(projectId);
    if (!assets.length) {
      return NextResponse.json({ error: 'Project ini belum memiliki asset untuk didownload.' }, { status: 400 });
    }

    const usedNames = new Set<string>();
    const zipEntries: ZipFileEntry[] = [];
    const externalLinks: string[] = [];

    for (const asset of assets) {
      if (asset.source_type === 'url') {
        externalLinks.push(`${asset.original_filename}\n${asset.source_url || ''}${asset.notes ? `\nNotes: ${asset.notes}` : ''}`);
        continue;
      }

      const file = await downloadContentAssetObject(asset);
      const fallbackName = `asset-${asset.id}${extensionFromMimeType(asset.mime_type)}`;
      const safeName = sanitizeDownloadName(asset.original_filename, fallbackName);
      const zipName = ensureUniqueName(safeName, usedNames);

      zipEntries.push({
        name: zipName,
        data: new Uint8Array(await file.arrayBuffer()),
      });
    }

    if (externalLinks.length) {
      zipEntries.push({
        name: ensureUniqueName('external-links.txt', usedNames),
        data: new TextEncoder().encode(externalLinks.join('\n\n---\n\n')),
      });
    }

    const zip = createZip(zipEntries);
    const zipBody = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    const fileName = `${sanitizeDownloadName(project.project_name, `project-${project.id}`)}.zip`;

    return new Response(zipBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(zip.length),
        'Content-Disposition': attachmentDisposition(fileName),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Gagal download ZIP asset.';
    return NextResponse.json(
      { error: errorMessage },
      { status: errorMessage.includes('akses') || errorMessage.includes('Sesi SSO') ? 403 : 500 },
    );
  }
}
