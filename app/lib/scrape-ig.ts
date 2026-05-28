"use server";

import fs from "node:fs";
import https from "node:https";
import path from "node:path";

import { getPlaywrightLaunchOptions } from "./chromium-path";
import { scrapeContentFromLink } from "./scrape-content-link";

const SCRAPE_ERROR_MESSAGE = "Gagal mengambil data Instagram saat ini.";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const INSTAGRAM_PROFILE_MAX_POSTS = 12;

interface InstagramPost {
  id: string;
  title: string;
  link: string;
  thumbnail: string;
  media_urls: string[];
  owner_username?: string;
  upload_date?: string;
}

const FEED_URL_BUILDERS = [
  (username: string) => `https://rsshub.app/instagram/user/${username}`,
  (username: string) =>
    `https://rsshub.rssforever.com/instagram/user/${username}`,
];

const INSTAGRAM_PROFILE_API =
  "https://i.instagram.com/api/v1/users/web_profile_info/";
const INSTAGRAM_MEDIA_INFO_API = "https://i.instagram.com/api/v1/media/";

interface InstagramScrapeOptions {
  maxPosts?: number;
  noNewPostsTimeoutMs?: number;
  scrollPauseMs?: number;
}

function normalizeUsername(rawUsername: string): string {
  return cleanText(rawUsername).replace(/^@/, "");
}

function cleanText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickFirstNonEmpty(
  ...values: Array<string | null | undefined>
): string {
  return (
    values.map((value) => cleanText(value)).find((value) => value.length > 0) ||
    ""
  );
}

function extractInstagramShortcode(link: string): string {
  const candidate = cleanText(link);

  if (!candidate) {
    return "";
  }

  let url: URL | null = null;

  try {
    url = new URL(candidate);
  } catch {
    try {
      url = new URL(`https://${candidate}`);
    } catch {
      url = null;
    }
  }

  if (!url) {
    return "";
  }

  const pathSegments = url.pathname.split("/").filter(Boolean);
  const marker = pathSegments.findIndex((segment) =>
    ["p", "reel", "tv"].includes(segment),
  );

  if (marker === -1) {
    return "";
  }

  return cleanText(pathSegments[marker + 1] || "");
}

async function loadPlaywrightChromium(): Promise<any> {
  const loader = new Function('return import("playwright-core")');
  const module = await loader();
  return module.chromium;
}

const STORAGE_STATE_PATH = path.join(
  process.cwd(),
  ".cache",
  "ig-storage-state.json",
);

const IG_COOKIE_HEADER_PATH = path.join(
  process.cwd(),
  ".cache",
  "ig-cookie-header.txt",
);
const IG_STATUS_PATH = path.join(
  process.cwd(),
  ".cache",
  "ig-scrape-status.json",
);

function ensureStorageStateDir(): void {
  const storageStateDir = path.dirname(STORAGE_STATE_PATH);

  if (!fs.existsSync(storageStateDir)) {
    fs.mkdirSync(storageStateDir, { recursive: true });
  }
}

function serializeCookieHeader(
  cookies: Array<{ name?: string; value?: string; domain?: string }>,
): string {
  return cookies
    .filter((cookie) => String(cookie.domain || "").includes("instagram.com"))
    .map(
      (cookie) =>
        `${String(cookie.name || "").trim()}=${String(cookie.value || "").trim()}`,
    )
    .filter((entry) => entry !== "=")
    .join("; ");
}

function saveCookieHeader(cookieHeader: string): void {
  ensureStorageStateDir();
  fs.writeFileSync(IG_COOKIE_HEADER_PATH, cookieHeader, "utf-8");
}

function ensureStatusDir(): void {
  const statusDir = path.dirname(IG_STATUS_PATH);

  if (!fs.existsSync(statusDir)) {
    fs.mkdirSync(statusDir, { recursive: true });
  }
}

function writeInstagramScrapeStatus(status: {
  stage: string;
  message: string;
}): void {
  ensureStatusDir();
  fs.writeFileSync(
    IG_STATUS_PATH,
    JSON.stringify(
      {
        ...status,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function clearInstagramScrapeStatus(): void {
  writeInstagramScrapeStatus({ stage: "idle", message: "Siap" });
}

function loadCookieHeaderFromCache(): string {
  try {
    return fs.existsSync(IG_COOKIE_HEADER_PATH)
      ? String(fs.readFileSync(IG_COOKIE_HEADER_PATH, "utf-8") || "").trim()
      : "";
  } catch {
    return "";
  }
}

function loadCookieHeaderFromEnv(): string {
  return String(process.env.INSTAGRAM_COOKIE || "").trim();
}

function loadCookieHeaderFromStorageState(): string {
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    return "";
  }

  try {
    const raw = fs.readFileSync(STORAGE_STATE_PATH, "utf-8");
    const state = JSON.parse(raw) as {
      cookies?: Array<{ name?: string; value?: string; domain?: string }>;
    };

    return serializeCookieHeader(state.cookies || []);
  } catch {
    return "";
  }
}

export async function loginInstagramAndSaveSession(): Promise<{
  ok: boolean;
  message: string;
}> {
  const chromium = await loadPlaywrightChromium();

  ensureStorageStateDir();

  const launchOptions = await getPlaywrightLaunchOptions();

  const browser = await chromium.launch({
    ...launchOptions,
    args: [
      ...(launchOptions.args || []),
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1366,900",
    ],
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  });

  const page = await context.newPage();

  try {
    console.log("[IG login] Membuka halaman login Instagram...");
    console.log("[IG login] Silakan login, konfirmasi email jika diminta.");
    console.log(
      "[IG login] Script menunggu hingga sessionid muncul (maks 5 menit)...",
    );

    await page.goto("https://www.instagram.com/accounts/login/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const POLL_INTERVAL_MS = 2000;
    const TIMEOUT_MS = 5 * 60 * 1000;
    const deadline = Date.now() + TIMEOUT_MS;

    let sessionId = "";

    while (Date.now() < deadline) {
      await page.waitForTimeout(POLL_INTERVAL_MS);

      const cookies = await context.cookies(["https://www.instagram.com"]);
      const found = cookies.find(
        (cookie: { name?: string; value?: string }) =>
          cookie.name === "sessionid" && String(cookie.value || "").length > 0,
      );

      if (found) {
        sessionId = found.value;
        console.log(
          `[IG login] sessionid ditemukan: ${sessionId.slice(0, 8)}...`,
        );
        break;
      }

      const url = page.url();
      console.log(`[IG login] Menunggu sessionid... (URL: ${url})`);
    }

    if (!sessionId) {
      throw new Error(
        "Timeout 5 menit: sessionid tidak muncul. Pastikan login dan konfirmasi email selesai.",
      );
    }

    await page.waitForTimeout(2000);

    await context.storageState({ path: STORAGE_STATE_PATH });

    const raw = fs.readFileSync(STORAGE_STATE_PATH, "utf-8");
    const state = JSON.parse(raw) as {
      cookies?: Array<{ name: string; value: string }>;
    };
    const sessionCookie = state.cookies?.find(
      (cookie) => cookie.name === "sessionid",
    );

    if (!sessionCookie?.value) {
      throw new Error(
        "sessionid tidak ditemukan setelah login. Pastikan login berhasil.",
      );
    }

    saveCookieHeader(sessionId);

    console.log(`[IG login] Session tersimpan ke: ${STORAGE_STATE_PATH}`);

    return {
      ok: true,
      message: `Session tersimpan. sessionid: ${sessionId.slice(0, 8)}...`,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function scrapeInstagramProfileLinks(
  username: string,
  options?: InstagramScrapeOptions,
): Promise<string[]> {
  const profileUrl = `https://www.instagram.com/${username}/`;
  const maxPosts = Math.max(
    1,
    options?.maxPosts || INSTAGRAM_PROFILE_MAX_POSTS,
  );
  const noNewPostsTimeoutMs = Math.max(
    5000,
    options?.noNewPostsTimeoutMs || 25000,
  );
  const scrollPauseMs = Math.max(500, options?.scrollPauseMs || 2000);

  console.log(`[IG scrape] Starting profile link extraction for ${username}`);

  const chromium = await loadPlaywrightChromium();

  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error(
      "Belum ada session. Panggil loginInstagramAndSaveSession() terlebih dahulu.",
    );
  }

  let savedState: { cookies?: Array<{ name: string; value: string }> };

  try {
    savedState = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, "utf-8"));
  } catch {
    throw new Error("File session rusak. Login ulang diperlukan.");
  }

  const sessionCookie = savedState.cookies?.find(
    (cookie) => cookie.name === "sessionid",
  );

  if (!sessionCookie?.value) {
    throw new Error(
      "sessionid tidak ditemukan di session. Login ulang diperlukan.",
    );
  }

  console.log(
    `[IG scrape] Session ditemukan (sessionid: ${sessionCookie.value.slice(0, 8)}...)`,
  );

  console.log(`[IG scrape] Launching headless browser`);

  const launchOptions = await getPlaywrightLaunchOptions();

  const browser = await chromium.launch({
    ...launchOptions,
    args: [
      ...(launchOptions.args || []),
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--window-size=1366,900",
      "--disable-dev-shm-usage",
      "--disable-extensions-except=",
      "--disable-plugins-discovery",
    ],
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    storageState: STORAGE_STATE_PATH,
    extraHTTPHeaders: {
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "sec-ch-ua":
        '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["id-ID", "id", "en-US", "en"],
    });
    (window as any).chrome = { runtime: {} };

    const originalQuery = window.navigator.permissions.query;
    (window.navigator.permissions as any).query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as any)
        : originalQuery(parameters);
  });

  const page = await context.newPage();

  try {
    writeInstagramScrapeStatus({
      stage: "finding-posts",
      message: `Mengambil daftar post Instagram untuk @${username}...`,
    });

    console.log(`[IG scrape] Navigating to ${profileUrl}`);

    await page.goto(profileUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(3000 + Math.random() * 2000);

    const currentUrl = page.url();
    console.log(`[IG scrape] Current URL: ${currentUrl}`);

    if (currentUrl.includes("/accounts/login")) {
      console.warn("[IG scrape] Redirected to login — attempting login bypass");

      try {
        const notNowBtn = page.locator('text="Not Now"').first();
        if (await notNowBtn.isVisible({ timeout: 3000 })) {
          await notNowBtn.click();
          await page.waitForTimeout(2000);
        }
      } catch {
        // no dialog
      }

      await page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForTimeout(4000);

      if (page.url().includes("/accounts/login")) {
        throw new Error(
          "Instagram membutuhkan autentikasi. Gunakan login manual terlebih dahulu.",
        );
      }
    }

    await page.waitForTimeout(2000);

    try {
      await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', {
        timeout: 15000,
      });
    } catch {
      console.warn(
        "[IG scrape] Timeout waiting for post links, proceeding anyway",
      );
    }

    const seen = new Set<string>();
    let lastNewLinkAt = Date.now();

    while (
      seen.size < maxPosts &&
      Date.now() - lastNewLinkAt < noNewPostsTimeoutMs
    ) {
      const discoveredLinks = await page.evaluate(() => {
        const anchors = Array.from(
          document.querySelectorAll(
            'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
          ),
        );

        return anchors
          .map((anchor) => {
            const href = anchor.getAttribute("href") || "";

            try {
              return href.startsWith("http")
                ? href
                : new URL(href, window.location.origin).toString();
            } catch {
              return "";
            }
          })
          .filter(Boolean);
      });

      const previousSize = seen.size;

      for (const link of discoveredLinks) {
        if (seen.size >= maxPosts) {
          break;
        }

        if (!seen.has(link)) {
          seen.add(link);
        }
      }

      if (seen.size > previousSize) {
        lastNewLinkAt = Date.now();
      }

      if (seen.size >= maxPosts) {
        break;
      }

      const previousLinkCount = seen.size;

      await page.mouse.wheel(0, 2400);
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      await page.waitForTimeout(Math.min(1200, scrollPauseMs));

      try {
        await page.waitForFunction(
          (expectedCount: number) =>
            document.querySelectorAll(
              'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
            ).length > expectedCount,
          previousLinkCount,
          { timeout: scrollPauseMs },
        );
      } catch {
        // Instagram sering lambat memuat batch berikutnya; timeout di sini normal.
      }

      await page.waitForTimeout(scrollPauseMs);
    }

    try {
      await context.storageState({ path: STORAGE_STATE_PATH });
      const sessionCookies = await context.cookies([
        "https://www.instagram.com",
      ]);
      const cookieHeader = serializeCookieHeader(sessionCookies);

      if (cookieHeader.includes("sessionid=")) {
        saveCookieHeader(cookieHeader);
      }

      console.log("[IG scrape] Session state saved");
    } catch {
      console.warn("[IG scrape] Failed to save session state");
    }

    return Array.from(seen).slice(0, maxPosts);
  } catch (error) {
    console.error(
      `[IG scrape] Profile link extraction failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function scrapeInstagramPostsFromPlaywright(
  username: string,
  options?: InstagramScrapeOptions,
): Promise<InstagramPost[]> {
  try {
    const links = await scrapeInstagramProfileLinks(username, options);

    console.log(
      `[IG scrape] Retrieved ${links.length} profile links for ${username}`,
    );

    if (links.length === 0) {
      console.warn(`[IG scrape] No post links found in profile ${username}`);
      return [];
    }

    const maxPosts = Math.max(
      1,
      options?.maxPosts || INSTAGRAM_PROFILE_MAX_POSTS,
    );

    const results = await Promise.allSettled(
      links.slice(0, maxPosts).map(async (link, index) => {
        console.log(
          `[IG scrape] Processing post ${index + 1}/${links.length}: ${link}`,
        );

        const scraped = await scrapeContentFromLink(link);
        const shortcode =
          extractInstagramShortcode(scraped.link || link) || `ig-${index}`;

        const mediaUrls = normalizeMediaUrls([
          ...(scraped.media_urls || []),
          scraped.thumbnail_url,
        ]);

        return {
          id: cleanText(scraped.source_post_id || shortcode),
          title: pickFirstNonEmpty(
            scraped.caption,
            scraped.title,
            `Instagram Post ${index + 1}`,
          ),
          link: cleanText(scraped.link || link),
          thumbnail: mediaUrls[0] || cleanText(scraped.thumbnail_url || ""),
          media_urls: mediaUrls,
          owner_username: username,
          upload_date: cleanText(scraped.upload_date || ""),
        } as InstagramPost;
      }),
    );

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<InstagramPost> =>
        result.status === "fulfilled",
    );

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    if (rejected.length > 0) {
      console.warn(
        `[IG scrape] ${rejected.length} posts failed to scrape:`,
        rejected.map((r) =>
          r.reason instanceof Error ? r.reason.message : String(r.reason),
        ),
      );
    }

    const posts = fulfilled
      .map((result) => result.value)
      .filter((item) => item.link.startsWith("http"));

    console.log(`[IG scrape] Successfully scraped ${posts.length} posts`);

    return posts;
  } catch (error) {
    console.error(
      `[IG scrape] Playwright scrape error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    throw error;
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .trim();
}

function toIsoDate(value: string | number | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value > 1e12 ? value : value * 1000;
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const parsed = Date.parse(raw);

  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return "";
}

function normalizeMediaUrls(
  values: Array<string | null | undefined>,
): string[] {
  const byUrl = new Map<string, string>();

  values.forEach((value) => {
    const url = String(value || "").trim();

    if (url) {
      byUrl.set(url, url);
    }
  });

  return Array.from(byUrl.values());
}

const INSTAGRAM_AGENT = new https.Agent({ keepAlive: true, timeout: 15000 });

async function httpsGet(
  url: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        agent: INSTAGRAM_AGENT,
        timeout: 15000,
        headers: { ...headers, "Accept-Encoding": "identity" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve({
            ok: !!res.statusCode && res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode ?? 0,
            json: () => Promise.resolve(JSON.parse(body)),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.end();
  });
}

function getCookieValue(cookie: string, key: string): string {
  return (
    cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${key}=`))
      ?.slice(key.length + 1) || ""
  );
}

function getInstagramHeaders(
  referer: string,
  cookieHeader: string,
): HeadersInit {
  const csrfToken = getCookieValue(cookieHeader, "csrftoken");

  return {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    "x-ig-app-id": "936619743392459",
    ...(csrfToken ? { "x-csrftoken": csrfToken } : {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    Referer: referer,
    Origin: "https://www.instagram.com",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  };
}

function pickInstagramImageUrl(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as {
    image_versions2?: {
      candidates?: Array<{ url?: string; width?: number; height?: number }>;
    };
    display_url?: string;
    thumbnail_src?: string;
    video_versions?: Array<{ url?: string }>;
  };

  const candidates = record.image_versions2?.candidates || [];

  const sortedCandidates = [...candidates].sort(
    (left, right) =>
      (right.width || 0) * (right.height || 0) -
      (left.width || 0) * (left.height || 0),
  );

  return String(
    record.video_versions?.[0]?.url ||
      sortedCandidates[0]?.url ||
      record.display_url ||
      record.thumbnail_src ||
      "",
  ).trim();
}

function parseInstagramMediaInfoUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as {
    items?: Array<{
      carousel_media?: unknown[];
      image_versions2?: {
        candidates?: Array<{ url?: string; width?: number; height?: number }>;
      };
      video_versions?: Array<{ url?: string }>;
    }>;
  };

  const item = root.items?.[0];

  if (!item) {
    return [];
  }

  if (Array.isArray(item.carousel_media) && item.carousel_media.length > 0) {
    return normalizeMediaUrls(item.carousel_media.map(pickInstagramImageUrl));
  }

  return normalizeMediaUrls([pickInstagramImageUrl(item)]);
}

async function fetchPostMediaUrls(
  mediaId: string,
  shortcode: string,
  fallbackUrls: string[],
  cookieHeader: string,
): Promise<string[]> {
  const normalizedMediaId = String(mediaId || "").trim();

  if (!normalizedMediaId || normalizedMediaId.startsWith("ig-")) {
    return normalizeMediaUrls(fallbackUrls);
  }

  const url = `${INSTAGRAM_MEDIA_INFO_API}${encodeURIComponent(
    normalizedMediaId,
  )}/info/`;

  try {
    const response = await httpsGet(
      url,
      getInstagramHeaders(
        `https://www.instagram.com/p/${shortcode}/`,
        cookieHeader,
      ),
    );

    if (!response.ok) {
      return normalizeMediaUrls(fallbackUrls);
    }

    const mediaUrls = parseInstagramMediaInfoUrls(await response.json() as Record<string, unknown>);

    return mediaUrls.length ? mediaUrls : normalizeMediaUrls(fallbackUrls);
  } catch (error) {
    console.warn("[IG scrape] media info failed", {
      mediaId: normalizedMediaId,
      message: error instanceof Error ? error.message : String(error),
    });

    return normalizeMediaUrls(fallbackUrls);
  }
}

function parseXmlItems(xml: string, username: string): InstagramPost[] {
  const items = Array.from(
    xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
  ).map((match) => match[1]);

  return items
    .map((item, index) => {
      const title = decodeXmlEntities(
        item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "",
      );

      const link = decodeXmlEntities(
        item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "",
      );

      const mediaContent = decodeXmlEntities(
        item.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1] || "",
      );

      const enclosure = decodeXmlEntities(
        item.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1] || "",
      );

      const description = decodeXmlEntities(
        item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || "",
      );

      const pubDate = decodeXmlEntities(
        item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || "",
      );

      const idFromLink =
        link.match(/\/(p|reel|tv)\/([^/?#]+)/i)?.[2] || `ig-${index}`;

      const mediaUrls = normalizeMediaUrls([mediaContent, enclosure]);

      return {
        id: idFromLink,
        title:
          title ||
          description.substring(0, 80) ||
          `Instagram Post ${index + 1}`,
        link,
        thumbnail: mediaUrls[0] || "",
        media_urls: mediaUrls,
        owner_username: username,
        upload_date: toIsoDate(pubDate),
      };
    })
    .filter((item) => item.link.startsWith("http"));
}

async function parseInstagramProfilePosts(
  payload: unknown,
  username: string,
  cookieHeader: string,
): Promise<InstagramPost[]> {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as {
    data?: {
      user?: {
        edge_owner_to_timeline_media?: {
          edges?: Array<{
            node?: {
              id?: string;
              shortcode?: string;
              display_url?: string;
              thumbnail_src?: string;
              video_url?: string;
              taken_at_timestamp?: number;
              edge_sidecar_to_children?: {
                edges?: Array<{
                  node?: {
                    display_url?: string;
                    thumbnail_src?: string;
                    video_url?: string;
                  };
                }>;
              };
              edge_media_to_caption?: {
                edges?: Array<{
                  node?: { text?: string };
                }>;
              };
            };
          }>;
        };
      };
    };
  };

  const edges = root.data?.user?.edge_owner_to_timeline_media?.edges || [];

  const posts = edges
    .map((edge, index) => {
      const node = edge.node;
      const shortcode = String(node?.shortcode || "").trim();
      const id = String(node?.id || shortcode || `ig-${index}`).trim();

      const caption = String(
        node?.edge_media_to_caption?.edges?.[0]?.node?.text || "",
      ).trim();

      const thumbnail = String(
        node?.display_url || node?.thumbnail_src || "",
      ).trim();

      const mediaUrls = normalizeMediaUrls(
        (node?.edge_sidecar_to_children?.edges || [])
          .map(
            (child) =>
              child.node?.display_url ||
              child.node?.thumbnail_src ||
              child.node?.video_url ||
              "",
          )
          .concat(thumbnail),
      );

      const uploadDate = toIsoDate(node?.taken_at_timestamp);

      if (!shortcode) {
        return null;
      }

      return {
        id,
        title: caption ? caption.slice(0, 80) : `Instagram Post ${index + 1}`,
        link: `https://www.instagram.com/p/${shortcode}/`,
        thumbnail: mediaUrls[0] || thumbnail,
        media_urls: mediaUrls,
        owner_username: username,
        upload_date: uploadDate,
      } as InstagramPost;
    })
    .filter((item): item is InstagramPost => Boolean(item));

  return Promise.all(
    posts.map(async (post) => {
      const shortcode =
        post.link.match(/\/(p|reel|tv)\/([^/?#]+)/i)?.[2] || post.id;

      const mediaUrls = await fetchPostMediaUrls(
        post.id,
        shortcode,
        post.media_urls.length ? post.media_urls : [post.thumbnail],
        cookieHeader,
      );

      return {
        ...post,
        thumbnail: mediaUrls[0] || post.thumbnail,
        media_urls: mediaUrls,
        owner_username: username,
      };
    }),
  );
}

async function fetchProfilePosts(
  username: string,
  cookieHeader: string,
): Promise<InstagramPost[]> {
  const url = `${INSTAGRAM_PROFILE_API}?username=${encodeURIComponent(
    username,
  )}`;
  const referer = `https://www.instagram.com/${username}/`;

  let response: { ok: boolean; status: number; json(): Promise<unknown> };

  try {
    response = await httpsGet(url, getInstagramHeaders(referer, cookieHeader));
  } catch (error) {
    throw new Error(
      `Fetch profile API gagal: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Profile API HTTP ${response.status}`,
    );
  }

  const payload = await response.json();
  const posts = await parseInstagramProfilePosts(
    payload,
    username,
    cookieHeader,
  );

  if (posts.length === 0) {
    throw new Error(
      "Profile API berhasil tapi tidak ada post yang dapat diparse.",
    );
  }

  return posts;
}

async function fetchFeedXml(username: string): Promise<string> {
  let lastError: string | null = null;

  for (const buildFeedUrl of FEED_URL_BUILDERS) {
    const feedUrl = buildFeedUrl(username);

    try {
      const response = await fetch(feedUrl, {
        headers: {
          Accept:
            "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status} dari ${feedUrl}`;

        console.warn("[IG feed] non-OK response", {
          feedUrl,
          status: response.status,
        });

        continue;
      }

      const xml = await response.text();

      if (xml.includes("<item")) {
        return xml;
      }

      lastError = `Feed kosong dari ${feedUrl}`;

      console.warn("[IG feed] empty feed", { feedUrl });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      console.warn("[IG feed] fetch failed", {
        feedUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(lastError || "Semua sumber feed Instagram gagal diakses.");
}

export async function scrape_ig(
  username: string,
  options?: InstagramScrapeOptions,
) {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    console.warn("[IG scrape] Empty username provided");
    return { error: "Username Instagram wajib diisi." };
  }

  console.log(
    `[IG scrape] Starting scrape for username: ${normalizedUsername}`,
  );

  writeInstagramScrapeStatus({
    stage: "finding-posts",
    message: `Menyiapkan pengambilan post untuk @${normalizedUsername}...`,
  });

  try {
    console.log("[IG scrape] Trying RSS feed...");

    const xml = await fetchFeedXml(normalizedUsername);
    const posts = parseXmlItems(xml, normalizedUsername);

    console.log(`[IG scrape] RSS feed success: ${posts.length} posts`);

    if (posts.length > 0) {
      clearInstagramScrapeStatus();
      return { channel: `@${normalizedUsername}`, videos: posts };
    }

    console.warn("[IG scrape] RSS returned 0 items, trying API...");
  } catch (rssError) {
    console.warn(
      "[IG scrape] RSS feed failed:",
      rssError instanceof Error ? rssError.message : String(rssError),
    );
  }

  try {
    console.log("[IG scrape] Trying Instagram Profile API...");

    writeInstagramScrapeStatus({
      stage: "completing-details",
      message: `Melengkapi detail post via scrape-content-link untuk @${normalizedUsername}...`,
    });

    const posts = await fetchProfilePosts(
      normalizedUsername,
      loadCookieHeaderFromEnv() ||
        loadCookieHeaderFromCache() ||
        loadCookieHeaderFromStorageState(),
    );

    console.log(`[IG scrape] Profile API success: ${posts.length} posts`);

    clearInstagramScrapeStatus();

    return { channel: `@${normalizedUsername}`, videos: posts };
  } catch (apiError) {
    console.warn(
      "[IG scrape] Profile API failed:",
      apiError instanceof Error ? apiError.message : String(apiError),
    );
  }

  try {
    console.log("[IG scrape] Trying Playwright as last resort...");

    writeInstagramScrapeStatus({
      stage: "completing-details",
      message: `Melengkapi detail post via scrape-content-link untuk @${normalizedUsername}...`,
    });

    const posts = await scrapeInstagramPostsFromPlaywright(
      normalizedUsername,
      options,
    );

    console.log(`[IG scrape] Playwright success: ${posts.length} posts`);

    clearInstagramScrapeStatus();

    return { channel: `@${normalizedUsername}`, videos: posts };
  } catch (scrapeError) {
    console.error(
      "[IG scrape] All strategies failed:",
      scrapeError instanceof Error ? scrapeError.message : String(scrapeError),
    );

    writeInstagramScrapeStatus({
      stage: "error",
      message: "Scrape Instagram gagal.",
    });

    return { error: SCRAPE_ERROR_MESSAGE };
  }
}
