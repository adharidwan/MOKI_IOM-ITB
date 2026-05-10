import * as fs from 'node:fs';
import * as process from 'node:process';
import { lookup } from 'node:dns/promises';
import type { LaunchOptions } from 'playwright-core';

const EXPLICIT_CHROMIUM_PATH_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  process.env.CHROMIUM_PATH,
];

const SYSTEM_CHROMIUM_PATH_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

const INSTAGRAM_HOSTNAMES = [
  'www.instagram.com',
  'instagram.com',
  'i.instagram.com',
  'static.cdninstagram.com',
  'scontent.cdninstagram.com',
];

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

async function resolveInstagramHostResolverRules(): Promise<string | undefined> {
  const resolvedRules: string[] = [];

  for (const hostname of INSTAGRAM_HOSTNAMES) {
    try {
      const { address } = await lookup(hostname, { family: 4 });
      if (address) {
        resolvedRules.push(`MAP ${hostname} ${address}`);
      }
    } catch {
      continue;
    }
  }

  return resolvedRules.length > 0 ? resolvedRules.join(', ') : undefined;
}

function resolveFirstExistingPath(candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function resolveChromiumExecutablePath(): string | undefined {
  const explicitPath = resolveFirstExistingPath(EXPLICIT_CHROMIUM_PATH_CANDIDATES);
  if (explicitPath) {
    return explicitPath;
  }

  if (isTruthy(process.env.PLAYWRIGHT_USE_SYSTEM_CHROMIUM)) {
    return resolveFirstExistingPath(SYSTEM_CHROMIUM_PATH_CANDIDATES);
  }

  return undefined;
}

export function shouldUseHeadedBrowser(): boolean {
  return isTruthy(process.env.PLAYWRIGHT_HEADED);
}

export async function getPlaywrightLaunchOptions(): Promise<LaunchOptions> {
  const executablePath = resolveChromiumExecutablePath();
  const headed = shouldUseHeadedBrowser();
  const args = process.platform === 'linux' ? ['--disable-dev-shm-usage'] : [];
  const hostResolverRules = await resolveInstagramHostResolverRules();

  if (hostResolverRules) {
    args.push(`--host-resolver-rules=${hostResolverRules}`);
  }

  return {
    executablePath,
    headless: !headed,
    slowMo: headed ? 100 : 0,
    args,
  };
}
