import 'server-only';

import { chromium } from 'playwright-core';

import { getPlaywrightLaunchOptions } from './chromium-path';
import type { ContentRecordingInput } from './api';
import type { ContentRecordingPlatform } from './types';
import { createYtDlpClient } from './yt-dlp';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

type ScrapedContentDraft = Omit<ContentRecordingInput, 'title' | 'upload_date'> &
  Partial<Pick<ContentRecordingInput, 'title' | 'upload_date'>>;

interface BrowserMetadata {
  articlePublishedTime: string;
  canonical: string;
  description: string;
  ogDescription: string;
  ogImage: string;
  ogTitle: string;
  pageTitle: string;
  scripts: string[];
  timeValues: string[];
  twitterDescription: string;
  twitterImage: string;
  twitterTitle: string;
}

type JsonLike = Record<string, unknown>;

function tryParseUrl(rawLink: string): URL | null {
  const candidate = String(rawLink || '').trim();
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate);
  } catch {
    try {
      return new URL(`https://${candidate}`);
    } catch {
      return null;
    }
  }
}

export function detectPlatformFromLink(rawLink: string): ContentRecordingPlatform | null {
  const url = tryParseUrl(rawLink);
  if (!url) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();

  if (hostname === 'youtu.be' || hostname.endsWith('youtube.com')) {
    return 'youtube';
  }

  if (
    hostname === 'x.com' ||
    hostname.endsWith('.x.com') ||
    hostname === 'twitter.com' ||
    hostname.endsWith('.twitter.com')
  ) {
    return 'x';
  }

  if (hostname === 'instagram.com' || hostname.endsWith('.instagram.com')) {
    return 'Instagram';
  }

  return null;
}

function cleanText(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickFirstNonEmpty(...values: Array<string | null | undefined>): string {
  return values.map((value) => cleanText(value)).find((value) => value.length > 0) || '';
}

function toIsoDate(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 1e12 ? value : value * 1000;
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  const rawValue = cleanText(typeof value === 'string' ? value : '');
  if (!rawValue) {
    return '';
  }

  if (/^\d{8}$/.test(rawValue)) {
    return `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`;
  }

  const parsedMs = Date.parse(rawValue);
  if (!Number.isNaN(parsedMs)) {
    return new Date(parsedMs).toISOString().slice(0, 10);
  }

  return '';
}

function flattenJsonLd(value: unknown): JsonLike[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenJsonLd(entry));
  }

  const record = value as JsonLike;
  const nestedEntries = Object.values(record).flatMap((entry) => flattenJsonLd(entry));
  return [record, ...nestedEntries];
}

function parseJsonLdCandidates(scripts: string[]): JsonLike[] {
  return scripts.flatMap((script) => {
    const raw = script.trim();
    if (!raw) {
      return [];
    }

    try {
      return flattenJsonLd(JSON.parse(raw));
    } catch {
      return [];
    }
  });
}

function normalizePageTitle(value: string, platform: ContentRecordingPlatform): string {
  const cleaned = cleanText(value);

  if (platform === 'x') {
    return cleaned.replace(/\s*\/\s*X\s*$/i, '').replace(/\s+on X:?$/i, '').trim();
  }

  if (platform === 'Instagram') {
    return cleaned
      .replace(/\s*Instagram photos and videos\s*$/i, '')
      .replace(/\s*on Instagram:?\s*/i, ' ')
      .replace(/\s*[|:•-]\s*$/i, '')
      .trim();
  }

  return cleaned;
}

function extractSourcePostId(link: string, platform: ContentRecordingPlatform): string | null {
  const url = tryParseUrl(link);
  if (!url) {
    return null;
  }

  if (platform === 'youtube') {
    if (url.hostname.toLowerCase() === 'youtu.be') {
      return cleanText(url.pathname.split('/').filter(Boolean)[0] || '') || null;
    }

    const videoId = url.searchParams.get('v');
    if (videoId) {
      return cleanText(videoId) || null;
    }

    const pathSegments = url.pathname.split('/').filter(Boolean);
    const shortsIndex = pathSegments.findIndex((segment) => segment === 'shorts');
    if (shortsIndex !== -1) {
      return cleanText(pathSegments[shortsIndex + 1]) || null;
    }

    return null;
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);
  const marker =
    platform === 'x'
      ? pathSegments.findIndex((segment) => segment === 'status')
      : pathSegments.findIndex((segment) => ['p', 'reel', 'tv'].includes(segment));

  if (marker === -1) {
    return null;
  }

  return cleanText(pathSegments[marker + 1] || '') || null;
}

async function scrapeYoutubeLink(link: string): Promise<ScrapedContentDraft> {
  const ytDlp = createYtDlpClient();
  const stdout = await ytDlp.execPromise([
    link,
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
  ]);

  const data = JSON.parse(stdout);
  const normalizedLink = pickFirstNonEmpty(data.webpage_url, data.original_url, link);
  const uploadDate =
    toIsoDate(data.upload_date) ||
    toIsoDate(data.timestamp) ||
    toIsoDate(data.release_timestamp);

  return {
    title: cleanText(data.title) || 'Untitled Video',
    platform: 'youtube',
    upload_date: uploadDate,
    link: normalizedLink,
    source_post_id: cleanText(data.id) || extractSourcePostId(normalizedLink, 'youtube'),
    thumbnail_url: cleanText(data.thumbnail) || cleanText(data.thumbnails?.[0]?.url) || null,
  };
}

async function scrapeBrowserMetadata(link: string): Promise<BrowserMetadata> {
  const browser = await chromium.launch(getPlaywrightLaunchOptions());
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);

    return await page.evaluate(() => {
      const readMeta = (selector: string, attribute = 'content') =>
        document.querySelector(selector)?.getAttribute(attribute)?.trim() || '';

      const timeValues = Array.from(document.querySelectorAll('time[datetime]'))
        .map((element) => element.getAttribute('datetime')?.trim() || '')
        .filter((value) => value.length > 0);

      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map((element) => element.textContent || '')
        .filter((value) => value.trim().length > 0);

      return {
        articlePublishedTime: readMeta('meta[property="article:published_time"]'),
        canonical: readMeta('link[rel="canonical"]', 'href') || readMeta('meta[property="og:url"]'),
        description: readMeta('meta[name="description"]'),
        ogDescription: readMeta('meta[property="og:description"]'),
        ogImage: readMeta('meta[property="og:image"]'),
        ogTitle: readMeta('meta[property="og:title"]'),
        pageTitle: document.title || '',
        scripts,
        timeValues,
        twitterDescription: readMeta('meta[name="twitter:description"]'),
        twitterImage: readMeta('meta[name="twitter:image"]'),
        twitterTitle: readMeta('meta[name="twitter:title"]'),
      };
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function scrapeSocialLink(
  link: string,
  platform: Extract<ContentRecordingPlatform, 'x' | 'Instagram'>,
): Promise<ScrapedContentDraft> {
  const metadata = await scrapeBrowserMetadata(link);
  const jsonLdCandidates = parseJsonLdCandidates(metadata.scripts);

  const jsonLdTitle =
    jsonLdCandidates
      .map((candidate) =>
        pickFirstNonEmpty(
          typeof candidate.headline === 'string' ? candidate.headline : '',
          typeof candidate.name === 'string' ? candidate.name : '',
          typeof candidate.caption === 'string' ? candidate.caption : '',
          typeof candidate.description === 'string' ? candidate.description : '',
        ),
      )
      .find((value) => value.length > 0) || '';

  const jsonLdDate =
    jsonLdCandidates
      .map((candidate) =>
        pickFirstNonEmpty(
          typeof candidate.uploadDate === 'string' ? candidate.uploadDate : '',
          typeof candidate.datePublished === 'string' ? candidate.datePublished : '',
          typeof candidate.dateCreated === 'string' ? candidate.dateCreated : '',
        ),
      )
      .find((value) => value.length > 0) || '';

  const jsonLdImage =
    jsonLdCandidates
      .map((candidate) => {
        const thumbnailUrl = candidate.thumbnailUrl;
        if (typeof thumbnailUrl === 'string') {
          return thumbnailUrl;
        }

        if (Array.isArray(thumbnailUrl)) {
          return cleanText(
            thumbnailUrl.find((entry): entry is string => typeof entry === 'string') || '',
          );
        }

        if (typeof candidate.image === 'string') {
          return candidate.image;
        }

        if (Array.isArray(candidate.image)) {
          return cleanText(
            candidate.image.find((entry): entry is string => typeof entry === 'string') || '',
          );
        }

        return '';
      })
      .find((value) => cleanText(value).length > 0) || '';

  const canonicalLink = pickFirstNonEmpty(metadata.canonical, link);
  const title = pickFirstNonEmpty(
    jsonLdTitle,
    metadata.ogTitle,
    metadata.twitterTitle,
    metadata.ogDescription,
    metadata.twitterDescription,
    metadata.description,
    normalizePageTitle(metadata.pageTitle, platform),
  );

  return {
    title,
    platform,
    upload_date:
      toIsoDate(jsonLdDate) ||
      toIsoDate(metadata.articlePublishedTime) ||
      toIsoDate(metadata.timeValues[0]),
    link: canonicalLink,
    source_post_id: extractSourcePostId(canonicalLink, platform),
    thumbnail_url: pickFirstNonEmpty(jsonLdImage, metadata.ogImage, metadata.twitterImage) || null,
  };
}

export async function scrapeContentFromLink(link: string): Promise<ScrapedContentDraft> {
  const normalizedLink = cleanText(link);
  const platform = detectPlatformFromLink(normalizedLink);

  if (!platform) {
    throw new Error('Link harus berasal dari YouTube, X, atau Instagram.');
  }

  if (platform === 'youtube') {
    return scrapeYoutubeLink(normalizedLink);
  }

  return scrapeSocialLink(normalizedLink, platform);
}
