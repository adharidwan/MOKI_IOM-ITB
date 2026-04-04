import fs from 'fs';

const CHROMIUM_PATH_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  process.env.WHATSAPP_CHROMIUM_PATH,
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

export function resolveChromiumExecutablePath(): string | undefined {
  for (const candidate of CHROMIUM_PATH_CANDIDATES) {
    if (!candidate) {
      continue;
    }

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function shouldUseHeadedBrowser(): boolean {
  const value = process.env.PLAYWRIGHT_HEADED ?? process.env.WHATSAPP_HEADED;
  return value === '1' || value === 'true';
}
