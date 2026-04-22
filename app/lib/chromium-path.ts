import fs from 'fs';
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

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value === 'true';
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

export function getPlaywrightLaunchOptions(): LaunchOptions {
  const executablePath = resolveChromiumExecutablePath();
  const headed = shouldUseHeadedBrowser();
  const args = process.platform === 'linux' ? ['--disable-dev-shm-usage'] : [];

  return {
    executablePath,
    headless: !headed,
    slowMo: headed ? 100 : 0,
    args,
  };
}
