import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const launchMock = vi.fn();
const execPromiseMock = vi.fn();

vi.mock('playwright-core', () => ({
  chromium: {
    launch: launchMock,
  },
}));

vi.mock('yt-dlp-wrap', () => ({
  default: class MockYTDlpWrap {
    execPromise = execPromiseMock;
  },
}));

describe('scraper smoke tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PLAYWRIGHT_HEADED;
    delete process.env.WHATSAPP_HEADED;
    delete process.env.PLAYWRIGHT_CHROMIUM_PATH;
    delete process.env.WHATSAPP_CHROMIUM_PATH;
    delete process.env.CHROMIUM_PATH;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves chromium path from environment candidates', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-path-'));
    const chromiumBinary = path.join(tempDir, 'chromium');
    fs.writeFileSync(chromiumBinary, '');
    process.env.WHATSAPP_CHROMIUM_PATH = chromiumBinary;

    const { resolveChromiumExecutablePath } = await import('../app/lib/chromium-path');

    expect(resolveChromiumExecutablePath()).toBe(chromiumBinary);
  });

  it('launches Playwright headless by default', async () => {
    launchMock.mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn(),
          waitForTimeout: vi.fn(),
          title: vi.fn().mockResolvedValue('Instagram'),
          innerText: vi.fn().mockResolvedValue(''),
          locator: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
          evaluate: vi.fn().mockResolvedValue([]),
        }),
      }),
      close: vi.fn(),
    });

    const { scrape_ig } = await import('../app/lib/scrape-ig');
    await scrape_ig('iom_itb.official');

    expect(launchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        slowMo: 0,
      }),
    );
  });

  it('returns sanitized YouTube scrape errors', async () => {
    execPromiseMock.mockRejectedValue(new Error('spawn yt-dlp ENOENT /usr/bin/yt-dlp'));

    const { scrape_youtube } = await import('../app/lib/scrape-youtube');
    const result = await scrape_youtube('https://www.youtube.com/@IOM-ITB/videos');

    expect(result).toEqual({
      error: 'Gagal mengambil data YouTube saat ini.',
    });
  });
});
