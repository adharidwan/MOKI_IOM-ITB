import 'server-only';

import fs from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';

type YtDlpCookiePlatform = 'x' | 'youtube';

interface CookieEnvConfig {
  content: string;
  fileName: string;
  path: string;
}

interface ResolvedCookies {
  path: string;
  source: 'path' | 'content' | '';
}

function getCookieEnvConfig(platform: YtDlpCookiePlatform): CookieEnvConfig {
  if (platform === 'youtube') {
    return {
      content: String(process.env.YOUTUBE_YT_DLP_COOKIES_CONTENT || '').trim(),
      fileName: 'youtube-yt-dlp-cookies.txt',
      path: String(process.env.YOUTUBE_YT_DLP_COOKIES_PATH || '').trim(),
    };
  }

  return {
    content: String(process.env.X_YT_DLP_COOKIES_CONTENT || '').trim(),
    fileName: 'x-yt-dlp-cookies.txt',
    path: String(process.env.X_YT_DLP_COOKIES_PATH || '').trim(),
  };
}

function normalizeCookieContent(value: string): string {
  return value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export async function resolveYtDlpCookies(
  platform: YtDlpCookiePlatform,
  tempDir: string,
): Promise<ResolvedCookies> {
  const config = getCookieEnvConfig(platform);

  if (config.path && fs.existsSync(config.path)) {
    return { path: config.path, source: 'path' };
  }

  if (!config.content) {
    return { path: '', source: '' };
  }

  const cookiesPath = path.join(tempDir, config.fileName);
  await writeFile(cookiesPath, normalizeCookieContent(config.content), { encoding: 'utf8', mode: 0o600 });

  return { path: cookiesPath, source: 'content' };
}
