import 'server-only';

import fs from 'fs';
import path from 'path';

const COOKIES_DIR = path.join(process.cwd(), '.cache', 'cookies');

const UPLOAD_PATHS = {
  instagram: path.join(COOKIES_DIR, 'instagram-storage-state.json'),
  youtube: path.join(COOKIES_DIR, 'youtube-cookies.txt'),
  x: path.join(COOKIES_DIR, 'x-cookies.txt'),
} as const;

export type CookiePlatform = 'instagram' | 'youtube' | 'x';

export interface CookieStatus {
  configured: boolean;
  source: 'upload' | 'env' | 'none';
  lastModified?: number;
  fileName?: string;
}

function ensureCookiesDir(): void {
  if (!fs.existsSync(COOKIES_DIR)) {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
  }
}

export function getUploadPath(platform: CookiePlatform): string {
  return UPLOAD_PATHS[platform];
}

export function hasUploadedCookies(platform: CookiePlatform): boolean {
  const filePath = UPLOAD_PATHS[platform];
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

export function deleteUploadedCookies(platform: CookiePlatform): void {
  const filePath = UPLOAD_PATHS[platform];
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function saveUploadedCookies(platform: CookiePlatform, content: string | Buffer): string {
  ensureCookiesDir();
  const filePath = UPLOAD_PATHS[platform];
  fs.writeFileSync(filePath, content, { encoding: platform === 'instagram' ? 'utf-8' : 'utf-8', mode: 0o600 });
  return filePath;
}

function getInstagramCookieFromEnv(): string {
  return String(process.env.INSTAGRAM_COOKIE || '').trim();
}

function getInstagramCookieFromUpload(): string {
  const filePath = UPLOAD_PATHS.instagram;
  if (!fs.existsSync(filePath)) return '';

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const state = JSON.parse(raw) as {
      cookies?: Array<{ name?: string; value?: string; domain?: string }>;
    };

    return (state.cookies || [])
      .filter((cookie) => String(cookie.domain || '').includes('instagram.com'))
      .map((cookie) => `${String(cookie.name || '').trim()}=${String(cookie.value || '').trim()}`)
      .filter((entry) => entry !== '=')
      .join('; ');
  } catch {
    return '';
  }
}

export function getInstagramCookieHeader(): string {
  const uploaded = getInstagramCookieFromUpload();
  if (uploaded) return uploaded;

  return getInstagramCookieFromEnv();
}

export function getInstagramCsfrToken(): string {
  const cookie = getInstagramCookieHeader();
  if (!cookie) return '';

  const match = cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? match[1].trim() : '';
}

export function getInstagramStorageStatePath(): string | null {
  if (hasUploadedCookies('instagram')) {
    return UPLOAD_PATHS.instagram;
  }

  const storageStatePath = path.join(process.cwd(), '.cache', 'ig-storage-state.json');
  if (fs.existsSync(storageStatePath)) {
    return storageStatePath;
  }

  return null;
}

function getYtDlpCookieFromEnv(platform: 'youtube' | 'x'): string {
  const prefix = platform === 'youtube' ? 'YOUTUBE_YT_DLP_COOKIES' : 'X_YT_DLP_COOKIES';
  const contentVar = `${prefix}_CONTENT`;
  const pathVar = `${prefix}_PATH`;

  const pathVal = String(process.env[pathVar] || '').trim();
  if (pathVal && fs.existsSync(pathVal)) {
    return fs.readFileSync(pathVal, 'utf-8');
  }

  return String(process.env[contentVar] || '').trim();
}

export function getYtDlpCookiesContent(platform: 'youtube' | 'x'): string {
  if (hasUploadedCookies(platform)) {
    return fs.readFileSync(UPLOAD_PATHS[platform], 'utf-8');
  }

  return getYtDlpCookieFromEnv(platform);
}

export function getCookieStatus(platform: CookiePlatform): CookieStatus {
  if (hasUploadedCookies(platform)) {
    const filePath = UPLOAD_PATHS[platform];
    const stat = fs.statSync(filePath);
    return {
      configured: true,
      source: 'upload',
      lastModified: stat.mtimeMs,
      fileName: path.basename(filePath),
    };
  }

  const hasEnv =
    platform === 'instagram'
      ? getInstagramCookieFromEnv() !== ''
      : getYtDlpCookieFromEnv(platform as 'youtube' | 'x') !== '';

  return {
    configured: hasEnv,
    source: hasEnv ? 'env' : 'none',
  };
}

export function getAllCookieStatuses(): Record<CookiePlatform, CookieStatus> {
  return {
    instagram: getCookieStatus('instagram'),
    youtube: getCookieStatus('youtube'),
    x: getCookieStatus('x'),
  };
}

const NL = '\n';

function normalizeNewlines(value: string): string {
  return value.replace(/\\r\\n/g, NL).replace(/\\n/g, NL).replace(/\\t/g, '\t');
}

function looksLikeNetscapeFormat(content: string): boolean {
  const lines = normalizeNewlines(content)
    .split(NL)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  if (lines.length === 0) return false;

  if (lines[0].startsWith('# Netscape HTTP Cookie File') || lines[0].startsWith('# HTTP Cookie File')) {
    return true;
  }

  const dataLines = lines.filter((line) => !line.startsWith('#'));
  if (dataLines.length === 0) return false;

  const firstDataLine = dataLines[0];
  const parts = firstDataLine.split('\t');

  return parts.length >= 6;
}

function looksLikeCookieHeader(content: string): boolean {
  const trimmed = content.trim();
  return /^[\w.-]+=[^;]+(;\s*[\w.-]+=[^;]+)*$/.test(trimmed) && trimmed.includes('=');
}

function looksLikeStorageState(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && Array.isArray(parsed.cookies);
  } catch {
    return false;
  }
}

export interface CookieValidationResult {
  valid: boolean;
  error?: string;
  normalizedContent?: string;
  format?: 'storage-state' | 'cookie-header' | 'netscape';
}

export function validateAndNormalizeCookieFile(
  platform: CookiePlatform,
  rawContent: string,
): CookieValidationResult {
  const trimmed = rawContent.trim();

  if (!trimmed) {
    return { valid: false, error: 'File is empty.' };
  }

  if (platform === 'instagram') {
    if (looksLikeStorageState(trimmed)) {
      const parsed = JSON.parse(trimmed) as {
        cookies?: Array<{ name?: string; value?: string; domain?: string }>;
      };
      const hasSessionId = (parsed.cookies || []).some(
        (cookie) => cookie.name === 'sessionid' && String(cookie.domain || '').includes('instagram.com'),
      );
      if (!hasSessionId) {
        return { valid: false, error: 'No sessionid cookie found for instagram.com domain. The file may not be a valid Instagram session.' };
      }
      return { valid: true, normalizedContent: trimmed, format: 'storage-state' };
    }

    if (looksLikeCookieHeader(trimmed)) {
      if (!trimmed.includes('sessionid=')) {
        return { valid: false, error: 'Cookie header missing required sessionid cookie. Make sure you exported cookies for instagram.com.' };
      }
      const cookies = trimmed.split(';').map((entry) => entry.trim()).filter((entry) => entry.includes('='));
      const storageState = JSON.stringify(
        {
          cookies: cookies.map((entry) => {
            const [name, ...rest] = entry.split('=');
            return {
              name: name.trim(),
              value: rest.join('=').trim(),
              domain: '.instagram.com',
              path: '/',
              expires: -1,
              httpOnly: name.trim() === 'sessionid',
              secure: true,
              sameSite: 'Lax',
            };
          }),
          origins: [],
        },
        null,
        2,
      );
      return { valid: true, normalizedContent: storageState, format: 'cookie-header' };
    }

    return { valid: false, error: 'Invalid format. Expected a Playwright storage state JSON file (exported via browser extension like "EditThisCookie"), or a raw cookie header string (sessionid=xxx; csrftoken=yyy).' };
  }

  const normalized = normalizeNewlines(trimmed);
  if (!looksLikeNetscapeFormat(normalized)) {
    return {
      valid: false,
      error: 'Invalid format. Expected a Netscape-format cookies.txt file. Use a browser extension like "cookies.txt" to export cookies. The file should have tab-separated columns of cookie data.',
    };
  }

  return { valid: true, normalizedContent: normalized, format: 'netscape' };
}
