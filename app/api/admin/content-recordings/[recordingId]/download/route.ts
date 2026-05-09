import { spawn } from 'child_process';
import fs from 'fs';
import { mkdir, readdir, readFile, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';

import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import { getContentRecordingById } from '@/app/lib/api';
import type { ContentRecordingPlatform } from '@/app/lib/types';
import { createZip, type ZipFileEntry } from '@/app/lib/zip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const YT_DLP_CANDIDATE_PATHS = [
  process.env.YT_DLP_PATH,
  '/usr/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
];
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const X_FEED_URL_BUILDERS = [
  (username: string) => `https://nitter.net/${username}/rss`,
  (username: string) => `https://nitter.poast.org/${username}/rss`,
  (username: string) => `https://rsshub.app/twitter/user/${username}`,
];

function resolveYtDlpBinaryPath(): string {
  return YT_DLP_CANDIDATE_PATHS.find((candidate) => candidate && fs.existsSync(candidate)) || 'yt-dlp';
}

function sanitizeDownloadName(value: string, fallback: string): string {
  const normalized = value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]+/g, '_').replace(/"/g, "'");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function tryParseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function isSupportedPlatformUrl(platform: ContentRecordingPlatform, rawUrl: string): boolean {
  const url = tryParseUrl(rawUrl);
  const hostname = url?.hostname.toLowerCase() || '';

  if (platform === 'youtube') {
    return hostname === 'youtu.be' || hostname.endsWith('youtube.com');
  }

  if (platform === 'x') {
    return (
      (hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com' || hostname.endsWith('.twitter.com')) &&
      /\/[^/]+\/status\/\d+/i.test(url?.pathname || '')
    );
  }

  return false;
}

function extractXStatusId(rawUrl: string): string {
  const url = tryParseUrl(rawUrl);
  const match = url?.pathname.match(/\/[^/]+\/status\/(\d+)/i);
  return match?.[1] || '';
}

function extractXUsername(rawUrl: string): string {
  const url = tryParseUrl(rawUrl);
  const segments = (url?.pathname || '').split('/').filter(Boolean);
  const statusIndex = segments.findIndex((segment) => segment.toLowerCase() === 'status');

  return statusIndex > 0 ? segments[statusIndex - 1].replace(/^@/, '') : '';
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .trim();
}

async function resolveRedirectUrl(rawUrl: string): Promise<string> {
  let currentUrl = rawUrl;

  for (let index = 0; index < 5; index += 1) {
    const response = await fetch(currentUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT },
      cache: 'no-store',
    }).catch(() => null);
    const location = response?.headers.get('location');

    if (!response || !location || ![301, 302, 303, 307, 308].includes(response.status)) {
      return currentUrl;
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  return currentUrl;
}

async function normalizeDownloadLink(platform: ContentRecordingPlatform, rawUrl: string): Promise<string> {
  if (isSupportedPlatformUrl(platform, rawUrl)) {
    return rawUrl;
  }

  const resolvedUrl = await resolveRedirectUrl(rawUrl);
  if (isSupportedPlatformUrl(platform, resolvedUrl)) {
    return resolvedUrl;
  }

  const label = platform === 'youtube' ? 'YouTube' : 'X/Twitter';
  throw new Error(`Link tersimpan bukan link ${label} yang bisa didownload. Buka original link dan simpan URL ${label} langsung, bukan short link atau link platform lain.`);
}

function mimeTypeFromFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.mov') return 'video/quicktime';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.zip') return 'application/zip';

  return 'application/octet-stream';
}

function extensionFromContentType(contentType: string): string {
  const normalized = contentType.split(';')[0].trim().toLowerCase();

  if (normalized === 'image/jpeg') return '.jpg';
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  if (normalized === 'video/mp4') return '.mp4';
  if (normalized === 'video/webm') return '.webm';
  if (normalized === 'video/quicktime') return '.mov';

  return '';
}

function extensionFromUrl(rawUrl: string): string {
  const url = tryParseUrl(rawUrl);
  const extension = path.extname(url?.pathname || '').toLowerCase();

  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov'].includes(extension)
    ? extension
    : '';
}

function getYtDlpArgs(platform: ContentRecordingPlatform, link: string, outputTemplate: string): string[] {
  const baseArgs = [
    link,
    '--no-warnings',
    '--quiet',
    '--user-agent',
    USER_AGENT,
    '--output',
    outputTemplate,
  ];

  if (platform === 'youtube') {
    return [
      ...baseArgs,
      '--no-playlist',
      '--referer',
      'https://www.youtube.com/',
      '--format',
      'best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]',
    ];
  }

  if (platform === 'x') {
    return [
      ...baseArgs,
      '--no-playlist',
      '--referer',
      'https://x.com/',
      '--format',
      'best',
    ];
  }

  return baseArgs;
}

function runYtDlpDownload(platform: ContentRecordingPlatform, link: string, outputTemplate: string): Promise<void> {
  const command = resolveYtDlpBinaryPath();
  const child = spawn(command, getYtDlpArgs(platform, link, outputTemplate), {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';

  return new Promise((resolve, reject) => {
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `yt-dlp gagal dengan exit code ${code}.`));
    });
  });
}

function createFileDownloadStream(filePath: string, cleanupPath: string): ReadableStream<Uint8Array> {
  const nodeStream = fs.createReadStream(filePath);
  const cleanup = () => {
    void rm(cleanupPath, { force: true, recursive: true });
  };

  nodeStream.on('close', cleanup);
  nodeStream.on('error', cleanup);

  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

function ensureUniqueName(fileName: string, usedNames: Set<string>): string {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }

  const extension = path.extname(fileName);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  let index = 2;
  let candidate = `${baseName}-${index}${extension}`;

  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${baseName}-${index}${extension}`;
  }

  usedNames.add(candidate);
  return candidate;
}

async function listDownloadedFiles(tempDir: string): Promise<string[]> {
  const entries = await readdir(tempDir);
  const files = entries
    .filter((entry) => !entry.endsWith('.part') && !entry.endsWith('.ytdl'))
    .map((entry) => path.join(tempDir, entry));

  return files.sort((left, right) => left.localeCompare(right));
}

async function downloadFallbackMediaUrls(urls: string[], tempDir: string): Promise<string[]> {
  const normalizedUrls = Array.from(new Set(urls.map((url) => String(url || '').trim()).filter(Boolean)));
  const downloadedFiles: string[] = [];

  for (const [index, url] of normalizedUrls.entries()) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://x.com/',
      },
      cache: 'no-store',
    }).catch(() => null);

    if (!response?.ok) {
      continue;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      continue;
    }

    const extension = extensionFromUrl(url) || extensionFromContentType(contentType) || '.bin';
    const filePath = path.join(tempDir, `fallback-${index + 1}${extension}`);
    await fs.promises.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    downloadedFiles.push(filePath);
  }

  return downloadedFiles;
}

function normalizeMediaUrls(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function extractXmlTagValues(xml: string, pattern: RegExp): string[] {
  return Array.from(xml.matchAll(pattern)).map((match) => decodeXmlEntities(match[1] || ''));
}

async function fetchXMediaUrlsFromFeeds(username: string, statusId: string): Promise<string[]> {
  if (!username || !statusId) {
    return [];
  }

  for (const buildFeedUrl of X_FEED_URL_BUILDERS) {
    const feedUrl = buildFeedUrl(username);
    const response = await fetch(feedUrl, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'User-Agent': USER_AGENT,
      },
      cache: 'no-store',
    }).catch(() => null);

    if (!response?.ok) {
      continue;
    }

    const xml = await response.text();
    const item = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))
      .map((match) => match[1])
      .find((value) => value.includes(`/status/${statusId}`));

    if (!item) {
      continue;
    }

    const urls = normalizeMediaUrls([
      ...extractXmlTagValues(item, /<media:content[^>]*url=["']([^"']+)["'][^>]*>/gi),
      ...extractXmlTagValues(item, /<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/gi),
      ...extractXmlTagValues(item, /<enclosure[^>]*url=["']([^"']+)["'][^>]*>/gi),
      ...extractXmlTagValues(item, /<img[^>]*src=["']([^"']+)["'][^>]*>/gi),
    ]).filter((url) => /^https?:\/\//i.test(url));

    if (urls.length) {
      return urls;
    }
  }

  return [];
}

export async function GET(request: Request, { params }: { params: Promise<{ recordingId: string }> }) {
  let tempDir = '';

  try {
    await requireAnyFeatureFromRequest(request, ['content-record']);
    const { recordingId } = await params;
    const recording = await getContentRecordingById(recordingId);

    if (recording.platform !== 'youtube' && recording.platform !== 'x') {
      return NextResponse.json({ error: 'Download media saat ini hanya tersedia untuk konten YouTube dan X.' }, { status: 400 });
    }

    if (!recording.link) {
      return NextResponse.json({ error: 'Link konten tidak tersedia untuk record ini.' }, { status: 400 });
    }

    const baseFileName = sanitizeDownloadName(
      recording.title || recording.source_post_id || recording.id,
      `${recording.platform}-${recording.id}`,
    );
    tempDir = path.join(os.tmpdir(), 'content-recording-downloads', crypto.randomUUID());
    await mkdir(tempDir, { recursive: true });

    const downloadLink = await normalizeDownloadLink(recording.platform, recording.link);

    if (recording.platform === 'youtube') {
      await runYtDlpDownload(
        recording.platform,
        downloadLink,
        path.join(tempDir, 'media.%(ext)s'),
      );
    }

    let files = await listDownloadedFiles(tempDir);
    if (!files.length && recording.platform === 'x') {
      const statusId = extractXStatusId(downloadLink);
      const feedMediaUrls = await fetchXMediaUrlsFromFeeds(extractXUsername(downloadLink), statusId);
      files = await downloadFallbackMediaUrls(feedMediaUrls, tempDir);
    }

    if (!files.length) {
      throw new Error(
        recording.platform === 'x'
          ? 'Tidak ada native image/video X yang bisa didownload dari feed publik.'
          : 'yt-dlp selesai tetapi tidak menghasilkan file media.',
      );
    }

    if (files.length > 1) {
      const usedNames = new Set<string>();
      const zipEntries: ZipFileEntry[] = await Promise.all(
        files.map(async (filePath, index) => ({
          name: ensureUniqueName(
            sanitizeDownloadName(path.basename(filePath), `media-${index + 1}${path.extname(filePath)}`),
            usedNames,
          ),
          data: new Uint8Array(await readFile(filePath)),
        })),
      );
      const zip = createZip(zipEntries);
      const zipBody = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
      const zipName = `${baseFileName}.zip`;

      await rm(tempDir, { force: true, recursive: true });
      tempDir = '';

      return new Response(zipBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': String(zip.length),
          'Content-Disposition': attachmentDisposition(zipName),
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const filePath = files[0];
    const extension = path.extname(filePath) || '.bin';
    const fileName = `${baseFileName}${extension}`;
    const fileStats = await stat(filePath);

    return new Response(createFileDownloadStream(filePath, tempDir), {
      status: 200,
      headers: {
        'Content-Type': mimeTypeFromFileName(fileName),
        'Content-Length': String(fileStats.size),
        'Content-Disposition': attachmentDisposition(fileName),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
    }

    const errorMessage = error instanceof Error ? error.message : 'Gagal download media.';
    const isClientError =
      errorMessage.includes('bukan link') ||
      errorMessage.includes('Unsupported URL') ||
      errorMessage.includes('No video could be found') ||
      errorMessage.includes('Page type');

    return NextResponse.json(
      { error: errorMessage },
      { status: errorMessage.includes('akses') || errorMessage.includes('Sesi SSO') ? 403 : isClientError ? 400 : 500 },
    );
  }
}
