import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { once } from 'events';
import fs from 'fs';
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';

import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import { getContentRecordingById } from '@/app/lib/api';
import type { ContentRecordingPlatform } from '@/app/lib/types';
import { createZipFileStream, type ZipFilePathEntry } from '@/app/lib/zip';

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
const INSTAGRAM_FEED_URL_BUILDERS = [
  (username: string) => `https://rsshub.app/picnob/user/${username}`,
  (username: string) => `https://rsshub.app/instagram/2/user/${username}`,
  (username: string) => `https://rsshub.rssforever.com/instagram/2/user/${username}`,
  (username: string) => `https://rsshub.app/instagram/user/${username}`,
  (username: string) => `https://rsshub.rssforever.com/instagram/user/${username}`,
];
const INSTAGRAM_MEDIA_INFO_API = 'https://i.instagram.com/api/v1/media/';
const INSTAGRAM_SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const X_TWEET_SYNDICATION_API = 'https://cdn.syndication.twimg.com/widgets/tweet';
const X_GRAPHQL_TWEET_RESULT_API = 'https://x.com/i/api/graphql/2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId';
const X_GRAPHQL_BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const X_YT_DLP_COOKIES_PATH = String(process.env.X_YT_DLP_COOKIES_PATH || '').trim();
const X_YT_DLP_TEMP_COOKIES_FILE_NAME = 'x-yt-dlp-cookies.txt';
const FALLBACK_MEDIA_DOWNLOAD_CONCURRENCY = 4;
const X_GRAPHQL_FEATURES = {
  creator_subscriptions_tweet_preview_api_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: false,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_media_download_video_enabled: false,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

function nowMs(): number {
  return Math.round(performance.now());
}

function logDownloadTiming(
  stage: string,
  startedAt: number,
  details: Record<string, string | number | boolean | null | undefined> = {},
) {
  console.info('[content-record-download]', {
    stage,
    durationMs: nowMs() - startedAt,
    ...details,
  });
}

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

function getCookieValue(cookie: string, key: string): string {
  return (
    cookie
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${key}=`))
      ?.slice(key.length + 1) || ''
  );
}

function parseNetscapeCookieFile(value: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const parts = line.split('\t');
      const name = parts[5];
      const cookieValue = parts.slice(6).join('\t');

      if (name && cookieValue) {
        cookies[name] = cookieValue;
      }
    });

  return cookies;
}

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function getInstagramHeaders(referer: string, accept = 'application/json'): HeadersInit {
  const cookie = String(process.env.INSTAGRAM_COOKIE || '').trim();
  const csrfToken = getCookieValue(cookie, 'csrftoken');

  return {
    Accept: accept,
    'User-Agent': USER_AGENT,
    'x-ig-app-id': '936619743392459',
    ...(csrfToken ? { 'x-csrftoken': csrfToken } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    Referer: referer,
    Origin: 'https://www.instagram.com',
  };
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

  if (platform === 'Instagram') {
    return hostname === 'instagram.com' || hostname.endsWith('.instagram.com');
  }

  return false;
}

function extractXStatusId(rawUrl: string): string {
  const url = tryParseUrl(rawUrl);
  const match = url?.pathname.match(/\/[^/]+\/status\/(\d+)/i);
  return match?.[1] || '';
}

function extractXStatusIdFromSourcePostId(value: string | null | undefined): string {
  const match = String(value || '').match(/\d{10,}/);
  return match?.[0] || '';
}

function extractXUsername(rawUrl: string): string {
  const url = tryParseUrl(rawUrl);
  const segments = (url?.pathname || '').split('/').filter(Boolean);
  const statusIndex = segments.findIndex((segment) => segment.toLowerCase() === 'status');

  return statusIndex > 0 ? segments[statusIndex - 1].replace(/^@/, '') : '';
}

function extractInstagramShortcode(rawUrl: string): string {
  const url = tryParseUrl(rawUrl);
  const segments = (url?.pathname || '').split('/').filter(Boolean);
  const markerIndex = segments.findIndex((segment) => ['p', 'reel', 'tv'].includes(segment.toLowerCase()));

  return markerIndex !== -1 ? segments[markerIndex + 1] || '' : '';
}

function extractInstagramUsername(rawUrl: string): string {
  const url = tryParseUrl(rawUrl);
  const segments = (url?.pathname || '').split('/').filter(Boolean);
  const firstSegment = segments[0] || '';

  if (!firstSegment || ['p', 'reel', 'tv', 'stories', 'explore', 'accounts'].includes(firstSegment.toLowerCase())) {
    return '';
  }

  return firstSegment.replace(/^@/, '');
}

async function fetchInstagramUsernameFromPost(shortcode: string): Promise<string> {
  if (!shortcode) {
    return '';
  }

  const postUrl = `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/`;
  const response = await fetch(postUrl, {
    headers: getInstagramHeaders('https://www.instagram.com/', 'text/html,application/xhtml+xml'),
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    return '';
  }

  const html = await response.text();
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.instagram\.com\/([^/"?#]+)\/(?:p|reel|tv)\/[^"']+["'][^>]*>/i);
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const candidates = [
    canonicalMatch?.[1],
    ogTitleMatch?.[1]?.match(/@([A-Za-z0-9._]+)/)?.[1],
    titleMatch?.[1]?.match(/@([A-Za-z0-9._]+)/)?.[1],
  ];

  return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function extractInstagramUsernameFromText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const match = String(value || '').match(/@([A-Za-z0-9._]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return '';
}

function instagramShortcodeToMediaId(shortcode: string): string {
  const cleanShortcode = String(shortcode || '').trim();
  if (!cleanShortcode) {
    return '';
  }

  let mediaId = BigInt(0);
  for (const char of cleanShortcode) {
    const index = INSTAGRAM_SHORTCODE_ALPHABET.indexOf(char);
    if (index === -1) {
      return '';
    }

    mediaId = mediaId * BigInt(64) + BigInt(index);
  }

  return mediaId > BigInt(0) ? mediaId.toString() : '';
}

async function fetchInstagramUsernameFromMediaInfo(shortcode: string): Promise<string> {
  const mediaId = instagramShortcodeToMediaId(shortcode);
  if (!mediaId) {
    return '';
  }

  const response = await fetch(`${INSTAGRAM_MEDIA_INFO_API}${mediaId}/info/`, {
    headers: getInstagramHeaders(`https://www.instagram.com/p/${shortcode}/`),
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    return '';
  }

  const payload = await response.json().catch(() => null) as {
    items?: Array<{
      user?: {
        username?: string;
      };
      owner?: {
        username?: string;
      };
    }>;
  } | null;

  return String(payload?.items?.[0]?.user?.username || payload?.items?.[0]?.owner?.username || '').trim();
}

function pickInstagramMediaInfoUrl(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as {
    image_versions2?: {
      candidates?: Array<{ url?: string; width?: number; height?: number }>;
    };
    display_url?: string;
    thumbnail_src?: string;
    video_versions?: Array<{ url?: string }>;
  };
  const candidates = [...(record.image_versions2?.candidates || [])].sort(
    (left, right) => (right.width || 0) * (right.height || 0) - (left.width || 0) * (left.height || 0),
  );

  return String(record.video_versions?.[0]?.url || candidates[0]?.url || record.display_url || record.thumbnail_src || '').trim();
}

async function fetchInstagramMediaUrlsFromMediaInfo(shortcode: string): Promise<string[]> {
  const mediaId = instagramShortcodeToMediaId(shortcode);
  if (!mediaId) {
    return [];
  }

  const response = await fetch(`${INSTAGRAM_MEDIA_INFO_API}${mediaId}/info/`, {
    headers: getInstagramHeaders(`https://www.instagram.com/p/${shortcode}/`),
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    return [];
  }

  const payload = await response.json().catch(() => null) as {
    items?: Array<{
      carousel_media?: unknown[];
    }>;
  } | null;
  const item = payload?.items?.[0];

  if (!item) {
    return [];
  }

  if (Array.isArray(item.carousel_media) && item.carousel_media.length > 0) {
    return filterInstagramOriginalMediaUrls(item.carousel_media.map(pickInstagramMediaInfoUrl));
  }

  return filterInstagramOriginalMediaUrls([pickInstagramMediaInfoUrl(item)]);
}

function extractMetaContent(html: string, selectorName: string): string {
  const escapedName = selectorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyFirst = new RegExp(`<meta[^>]+(?:property|name)=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedName}["'][^>]*>`, 'i');

  return decodeXmlEntities(propertyFirst.exec(html)?.[1] || contentFirst.exec(html)?.[1] || '');
}

function decodeEscapedJsonUrl(value: string): string {
  return decodeXmlEntities(value)
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\u003d/g, '=')
    .replace(/\\u0025/g, '%');
}

function isLikelyInstagramThumbnailUrl(rawUrl: string): boolean {
  const url = tryParseUrl(rawUrl);
  const value = `${url?.pathname || ''}${url?.search || ''}`.toLowerCase();

  return (
    value.includes('s150x150') ||
    value.includes('s320x320') ||
    value.includes('s640x640') ||
    value.includes('150x150') ||
    value.includes('320x320') ||
    value.includes('profile_pic') ||
    value.includes('thumbnail')
  );
}

function filterInstagramOriginalMediaUrls(urls: string[]): string[] {
  return normalizeMediaUrls(urls).filter((url) => !isLikelyInstagramThumbnailUrl(url));
}

async function fetchInstagramMediaUrlsFromPostMetadata(shortcode: string, link: string): Promise<string[]> {
  const urls = [
    link,
    `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/`,
    `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/embed`,
  ];

  for (const url of normalizeMediaUrls(urls)) {
    const response = await fetch(url, {
      headers: getInstagramHeaders('https://www.instagram.com/', 'text/html,application/xhtml+xml'),
      cache: 'no-store',
    }).catch(() => null);

    if (!response?.ok) {
      continue;
    }

    const html = await response.text();
    const mediaUrls = filterInstagramOriginalMediaUrls([
      extractMetaContent(html, 'og:video'),
      extractMetaContent(html, 'og:video:secure_url'),
      extractMetaContent(html, 'og:image'),
      ...extractXmlTagValues(html, /"video_url"\s*:\s*"([^"]+)"/gi).map(decodeEscapedJsonUrl),
      ...extractXmlTagValues(html, /"display_url"\s*:\s*"([^"]+)"/gi).map(decodeEscapedJsonUrl),
      ...extractXmlTagValues(html, /"thumbnail_src"\s*:\s*"([^"]+)"/gi).map(decodeEscapedJsonUrl),
      ...extractXmlTagValues(html, /"url"\s*:\s*"(https?:\\\/\\\/[^"]+)"/gi).map(decodeEscapedJsonUrl),
      ...extractXmlTagValues(html, /"src"\s*:\s*"(https?:\\\/\\\/[^"]+)"/gi).map(decodeEscapedJsonUrl),
    ]).filter((mediaUrl) => /^https?:\/\//i.test(mediaUrl));

    if (mediaUrls.length) {
      return mediaUrls;
    }
  }

  return [];
}

function extractInstagramUsernameFromSourcePostId(value: string | null | undefined): string {
  const rawValue = String(value || '').trim();
  const match = rawValue.match(/^([A-Za-z0-9._]+):[^:]+$/);

  return match?.[1] || '';
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

async function normalizeDownloadLink(
  platform: ContentRecordingPlatform,
  rawUrl: string,
  sourcePostId?: string | null,
): Promise<string> {
  if (isSupportedPlatformUrl(platform, rawUrl)) {
    return rawUrl;
  }

  const resolvedUrl = await resolveRedirectUrl(rawUrl);
  if (isSupportedPlatformUrl(platform, resolvedUrl)) {
    return resolvedUrl;
  }

  if (platform === 'x') {
    const statusId =
      extractXStatusId(rawUrl) ||
      extractXStatusId(resolvedUrl) ||
      extractXStatusIdFromSourcePostId(sourcePostId);

    if (statusId) {
      return `https://x.com/i/status/${statusId}`;
    }
  }

  const label = platform === 'youtube' ? 'YouTube' : platform === 'x' ? 'X/Twitter' : 'Instagram';
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

function getYtDlpArgs(
  platform: ContentRecordingPlatform,
  link: string,
  outputTemplate: string,
  cookiesPath = '',
): string[] {
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
      ...(cookiesPath ? ['--cookies', cookiesPath] : []),
      '--format',
      'best',
    ];
  }

  return baseArgs;
}

function runYtDlpDownload(
  platform: ContentRecordingPlatform,
  link: string,
  outputTemplate: string,
  cookiesPath = '',
): Promise<void> {
  const command = resolveYtDlpBinaryPath();
  const child = spawn(command, getYtDlpArgs(platform, link, outputTemplate, cookiesPath), {
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

function createCleanupReadableStream(stream: ReadableStream<Uint8Array>, cleanupPath: string): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let cleanedUp = false;

  async function cleanup() {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    reader.releaseLock();
    await rm(cleanupPath, { force: true, recursive: true });
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await cleanup();
          return;
        }

        controller.enqueue(value);
      } catch (error) {
        await cleanup();
        controller.error(error);
      }
    },
    async cancel() {
      if (cleanedUp) {
        return;
      }

      await reader.cancel();
      await cleanup();
    },
  });
}

async function writeResponseBodyToFile(response: Response, filePath: string): Promise<void> {
  if (!response.body) {
    throw new Error('Response media tidak memiliki body.');
  }

  const reader = response.body.getReader();
  const writer = fs.createWriteStream(filePath);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!writer.write(value)) {
        await once(writer, 'drain');
      }
    }
  } catch (error) {
    writer.destroy();
    throw error;
  } finally {
    reader.releaseLock();
  }

  writer.end();
  await once(writer, 'finish');
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
  const files: string[] = [];

  for (const entry of entries) {
    if (
      entry === X_YT_DLP_TEMP_COOKIES_FILE_NAME ||
      entry.endsWith('.part') ||
      entry.endsWith('.ytdl')
    ) {
      continue;
    }

    const filePath = path.join(tempDir, entry);
    const fileStats = await stat(filePath);

    if (fileStats.isFile()) {
      files.push(filePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function removeDuplicateDownloadedFiles(files: string[]): Promise<string[]> {
  const byHash = new Set<string>();
  const uniqueFiles: string[] = [];

  for (const filePath of files) {
    const data = await readFile(filePath);
    const hash = createHash('sha256').update(data).digest('hex');

    if (byHash.has(hash)) {
      await rm(filePath, { force: true });
      continue;
    }

    byHash.add(hash);
    uniqueFiles.push(filePath);
  }

  return uniqueFiles;
}

async function downloadFallbackMediaUrls(
  urls: string[],
  tempDir: string,
  referer: string,
  fileBaseName = 'fallback',
): Promise<string[]> {
  const normalizedUrls = Array.from(new Set(urls.map((url) => String(url || '').trim()).filter(Boolean)));
  const downloadedFiles = new Array<string | null>(normalizedUrls.length).fill(null);

  async function downloadUrl(url: string, index: number): Promise<void> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: referer,
      },
      cache: 'no-store',
    }).catch(() => null);

    if (!response?.ok) {
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return;
    }

    const extension = extensionFromUrl(url) || extensionFromContentType(contentType) || '.bin';
    const filePath = path.join(tempDir, `${fileBaseName}-${index + 1}${extension}`);
    await writeResponseBodyToFile(response, filePath);

    downloadedFiles[index] = filePath;
  }

  let nextIndex = 0;
  const workerCount = Math.min(FALLBACK_MEDIA_DOWNLOAD_CONCURRENCY, normalizedUrls.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < normalizedUrls.length) {
      const index = nextIndex;
      nextIndex += 1;
      await downloadUrl(normalizedUrls[index], index).catch(() => undefined);
    }
  });

  await Promise.all(workers);

  return downloadedFiles.filter((filePath): filePath is string => Boolean(filePath));
}

function normalizeMediaUrls(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function normalizeXMediaIdentity(rawUrl: string): string {
  const url = tryParseUrl(rawUrl);
  if (!url) {
    return rawUrl;
  }

  if (url.hostname.toLowerCase() !== 'pbs.twimg.com' || !url.pathname.startsWith('/media/')) {
    return rawUrl;
  }

  const mediaId = url.pathname
    .slice('/media/'.length)
    .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');

  return `${url.hostname.toLowerCase()}/media/${mediaId}`;
}

function normalizeXMediaUrls(values: Array<string | null | undefined>): string[] {
  const byIdentity = new Map<string, string>();

  values.forEach((value) => {
    const rawUrl = String(value || '').trim();
    if (!rawUrl) {
      return;
    }

    byIdentity.set(normalizeXMediaIdentity(rawUrl), rawUrl);
  });

  return Array.from(byIdentity.values());
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

function parseXMediaUrlsFromSyndication(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as {
    photos?: Array<{ url?: string }>;
    video?: { poster?: string };
  };

  return normalizeMediaUrls([
    ...(record.photos || []).map((photo) => photo.url),
    record.video?.poster,
  ]);
}

function collectXPhotoUrlsFromGraphqlPayload(value: unknown): string[] {
  const urls: string[] = [];

  function visit(entry: unknown) {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }

    const record = entry as Record<string, unknown>;
    const mediaUrl = typeof record.media_url_https === 'string'
      ? record.media_url_https
      : typeof record.media_url === 'string'
        ? record.media_url
        : '';

    if (record.type === 'photo' && /^https?:\/\/pbs\.twimg\.com\/media\//i.test(mediaUrl)) {
      urls.push(mediaUrl.includes('?') ? mediaUrl : `${mediaUrl}?name=orig`);
    }

    Object.values(record).forEach(visit);
  }

  visit(value);

  return normalizeXMediaUrls(urls);
}

async function fetchXPhotoUrlsFromGraphql(statusId: string, cookiesPath: string): Promise<string[]> {
  if (!statusId || !cookiesPath) {
    return [];
  }

  try {
    const cookies = parseNetscapeCookieFile(await readFile(cookiesPath, 'utf8'));
    const csrfToken = cookies.ct0 || '';
    const cookieHeader = buildCookieHeader(cookies);

    if (!csrfToken || !cookieHeader) {
      return [];
    }

    const url = new URL(X_GRAPHQL_TWEET_RESULT_API);
    url.searchParams.set('variables', JSON.stringify({
      tweetId: statusId,
      withCommunity: false,
      includePromotedContent: false,
      withVoice: false,
    }));
    url.searchParams.set('features', JSON.stringify(X_GRAPHQL_FEATURES));
    url.searchParams.set('fieldToggles', JSON.stringify({ withArticleRichContentState: false }));

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${X_GRAPHQL_BEARER_TOKEN}`,
        Cookie: cookieHeader,
        Referer: 'https://x.com/',
        'User-Agent': USER_AGENT,
        'x-csrf-token': csrfToken,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en',
      },
      cache: 'no-store',
    }).catch(() => null);

    if (!response?.ok) {
      return [];
    }

    return collectXPhotoUrlsFromGraphqlPayload(await response.json().catch(() => null));
  } catch {
    return [];
  }
}

async function fetchXMediaUrlsFromSyndication(statusId: string): Promise<string[]> {
  if (!statusId) {
    return [];
  }

  const response = await fetch(`${X_TWEET_SYNDICATION_API}?id=${encodeURIComponent(statusId)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      Referer: 'https://platform.twitter.com/',
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    return [];
  }

  return parseXMediaUrlsFromSyndication(await response.json().catch(() => null));
}

async function fetchInstagramMediaUrlsFromFeeds(username: string, shortcode: string): Promise<string[]> {
  if (!username || !shortcode) {
    return [];
  }

  const allUrls: string[] = [];

  for (const buildFeedUrl of INSTAGRAM_FEED_URL_BUILDERS) {
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
      .find((value) => value.includes(`/${shortcode}`) || value.includes(`/${shortcode}/`));

    if (!item) {
      continue;
    }

    const decodedItem = decodeXmlEntities(item);
    const urls = filterInstagramOriginalMediaUrls([
      ...extractXmlTagValues(item, /<media:content[^>]*url=["']([^"']+)["'][^>]*>/gi),
      ...extractXmlTagValues(item, /<enclosure[^>]*url=["']([^"']+)["'][^>]*>/gi),
      ...extractXmlTagValues(decodedItem, /<img[^>]*src=["']([^"']+)["'][^>]*>/gi),
      ...extractXmlTagValues(decodedItem, /<video[^>]*src=["']([^"']+)["'][^>]*>/gi),
      ...extractXmlTagValues(decodedItem, /<source[^>]*src=["']([^"']+)["'][^>]*>/gi),
    ]).filter((url) => /^https?:\/\//i.test(url));

    allUrls.push(...urls);
  }

  return normalizeMediaUrls(allUrls);
}

export async function GET(request: Request, { params }: { params: Promise<{ recordingId: string }> }) {
  let tempDir = '';
  const requestStartedAt = nowMs();
  let recordingIdForLog = '';
  let platformForLog: ContentRecordingPlatform | '' = '';

  try {
    const loadStartedAt = nowMs();
    await requireAnyFeatureFromRequest(request, ['content-record']);
    const { recordingId } = await params;
    recordingIdForLog = recordingId;
    const recording = await getContentRecordingById(recordingId);
    platformForLog = recording.platform;

    logDownloadTiming('load-record', loadStartedAt, {
      recordingId,
      platform: recording.platform,
    });

    if (recording.platform !== 'youtube' && recording.platform !== 'x' && recording.platform !== 'Instagram') {
      return NextResponse.json({ error: 'Download media saat ini hanya tersedia untuk konten YouTube, X, dan Instagram.' }, { status: 400 });
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

    const normalizeStartedAt = nowMs();
    const downloadLink = await normalizeDownloadLink(recording.platform, recording.link, recording.source_post_id);
    logDownloadTiming('normalize-link', normalizeStartedAt, {
      recordingId,
      platform: recording.platform,
    });
    let xYtDlpCookiesPath = '';

    if (recording.platform === 'youtube' || recording.platform === 'x') {
      const ytDlpStartedAt = nowMs();
      xYtDlpCookiesPath = recording.platform === 'x' && X_YT_DLP_COOKIES_PATH
        ? path.join(tempDir, X_YT_DLP_TEMP_COOKIES_FILE_NAME)
        : '';

      if (xYtDlpCookiesPath) {
        await copyFile(X_YT_DLP_COOKIES_PATH, xYtDlpCookiesPath);
      }

      await runYtDlpDownload(
        recording.platform,
        downloadLink,
        path.join(tempDir, 'media.%(ext)s'),
        xYtDlpCookiesPath,
      ).catch((error) => {
        if (recording.platform === 'youtube') {
          throw error;
        }
      });
      logDownloadTiming('yt-dlp-download', ytDlpStartedAt, {
        recordingId,
        platform: recording.platform,
        usedCookies: Boolean(xYtDlpCookiesPath),
      });
    }

    let files = await listDownloadedFiles(tempDir);
    if (!files.length && recording.platform === 'x') {
      const xFallbackStartedAt = nowMs();
      const statusId = extractXStatusId(downloadLink);
      const username = extractXUsername(recording.link) || extractXUsername(downloadLink);
      const graphqlPhotoUrls = await fetchXPhotoUrlsFromGraphql(statusId, xYtDlpCookiesPath);
      const fallbackMediaUrls = graphqlPhotoUrls.length
        ? graphqlPhotoUrls
        : [
            ...await fetchXMediaUrlsFromSyndication(statusId),
            ...await fetchXMediaUrlsFromFeeds(username, statusId),
            ...(recording.media_urls || []),
          ];

      files = await downloadFallbackMediaUrls(
        normalizeXMediaUrls(fallbackMediaUrls),
        tempDir,
        'https://x.com/',
      );
      logDownloadTiming('x-fallback-download', xFallbackStartedAt, {
        recordingId,
        platform: recording.platform,
        candidateCount: fallbackMediaUrls.length,
        fileCount: files.length,
        usedGraphql: graphqlPhotoUrls.length > 0,
      });
    }

    if (!files.length && recording.platform === 'Instagram') {
      const instagramFallbackStartedAt = nowMs();
      const shortcode = extractInstagramShortcode(downloadLink);
      const mediaInfoUrls = await fetchInstagramMediaUrlsFromMediaInfo(shortcode);

      files = await downloadFallbackMediaUrls(
        mediaInfoUrls,
        tempDir,
        'https://www.instagram.com/',
        'gambar',
      );

      let username = '';
      let feedMediaUrls: string[] = [];
      let postMetadataUrls: string[] = [];
      let fallbackMediaUrls = mediaInfoUrls;
      let fallbackSource = 'media-info';

      if (!files.length) {
        fallbackSource = 'metadata';
        username =
          extractInstagramUsername(downloadLink) ||
          extractInstagramUsernameFromSourcePostId(recording.source_post_id) ||
          extractInstagramUsernameFromText(recording.title, recording.caption, recording.description) ||
          await fetchInstagramUsernameFromMediaInfo(shortcode) ||
          await fetchInstagramUsernameFromPost(shortcode);

        feedMediaUrls = username
          ? await fetchInstagramMediaUrlsFromFeeds(username, shortcode)
          : [];
        postMetadataUrls = await fetchInstagramMediaUrlsFromPostMetadata(shortcode, downloadLink);
        fallbackMediaUrls = filterInstagramOriginalMediaUrls([...feedMediaUrls, ...postMetadataUrls, ...(recording.media_urls || [])]);

        files = await downloadFallbackMediaUrls(
          fallbackMediaUrls,
          tempDir,
          'https://www.instagram.com/',
          'gambar',
        );
      }

      logDownloadTiming('instagram-fallback-download', instagramFallbackStartedAt, {
        recordingId,
        platform: recording.platform,
        candidateCount: fallbackMediaUrls.length,
        mediaInfoCandidateCount: mediaInfoUrls.length,
        postMetadataCandidateCount: postMetadataUrls.length,
        feedCandidateCount: feedMediaUrls.length,
        fileCount: files.length,
        fallbackSource,
        foundUsername: Boolean(username),
      });
    }

    const dedupeStartedAt = nowMs();
    files = await removeDuplicateDownloadedFiles(files);
    logDownloadTiming('dedupe-files', dedupeStartedAt, {
      recordingId,
      platform: recording.platform,
      fileCount: files.length,
    });

    if (!files.length) {
      throw new Error(
        recording.platform === 'x'
          ? 'Tidak ada native image/video X yang bisa didownload dari feed publik.'
          : recording.platform === 'Instagram'
            ? 'Tidak ada image/video asli Instagram yang bisa didownload. Sumber yang tersedia hanya thumbnail/preview atau tidak mengekspos media asli.'
          : 'yt-dlp selesai tetapi tidak menghasilkan file media.',
      );
    }

    if (files.length > 1) {
      const zipStartedAt = nowMs();
      const usedNames = new Set<string>();
      const zipEntries: ZipFilePathEntry[] = files.map((filePath, index) => ({
        name: ensureUniqueName(
          sanitizeDownloadName(path.basename(filePath), `media-${index + 1}${path.extname(filePath)}`),
          usedNames,
        ),
        path: filePath,
      }));
      const zip = await createZipFileStream(zipEntries);
      const zipName = `${baseFileName}.zip`;
      logDownloadTiming('zip-prepare', zipStartedAt, {
        recordingId,
        platform: recording.platform,
        fileCount: files.length,
        zipBytes: zip.size,
      });
      logDownloadTiming('response-ready', requestStartedAt, {
        recordingId,
        platform: recording.platform,
        fileCount: files.length,
        responseType: 'zip',
      });

      const zipStream = createCleanupReadableStream(zip.stream, tempDir);
      tempDir = '';

      return new Response(zipStream, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': String(zip.size),
          'Content-Disposition': attachmentDisposition(zipName),
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const filePath = files[0];
    const extension = path.extname(filePath) || '.bin';
    const fileName = `${baseFileName}${extension}`;
    const fileStats = await stat(filePath);
    logDownloadTiming('response-ready', requestStartedAt, {
      recordingId,
      platform: recording.platform,
      fileCount: files.length,
      responseType: 'single-file',
      fileBytes: fileStats.size,
    });

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
    logDownloadTiming('error', requestStartedAt, {
      recordingId: recordingIdForLog,
      platform: platformForLog,
      error: errorMessage,
    });
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
