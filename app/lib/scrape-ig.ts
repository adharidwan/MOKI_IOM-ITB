"use server";

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
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

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

async function scrapeInstagramProfileLinks(
  username: string,
): Promise<string[]> {
  const profileUrl = `https://www.instagram.com/${username}/`;
  console.log(`[IG scrape] Starting profile link extraction for ${username}`);

  const chromium = await loadPlaywrightChromium();
  const browser = await chromium.launch(await getPlaywrightLaunchOptions());
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
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
  const page = await context.newPage();

  try {
    console.log(`[IG scrape] Navigating to ${profileUrl}`);
    await page.goto(profileUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    console.log(`[IG scrape] Page loaded, waiting for DOM to settle`);
    await page.waitForTimeout(4000);

    const debugInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodySnippet: document.body.innerHTML.slice(0, 800),
        allAnchors: Array.from(document.querySelectorAll("a[href]"))
          .slice(0, 20)
          .map((a) => a.getAttribute("href")),
        hasLoginForm: !!document.querySelector('input[name="username"]'),
        hasPostLinks: !!document.querySelector(
          'a[href*="/p/"], a[href*="/reel/"]',
        ),
      };
    });
    console.log(
      "[IG scrape] Page debug info:",
      JSON.stringify(debugInfo, null, 2),
    );

    if (
      debugInfo.title.includes("couldn't load") ||
      debugInfo.title === "Instagram"
    ) {
      console.warn(
        "[IG scrape] Page failed to load properly, retrying after delay...",
      );
      await page.waitForTimeout(3000);
      await page.reload({ waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(4000);

      // Re-check setelah reload
      const retryTitle = await page.title();
      console.log(`[IG scrape] After retry, title: ${retryTitle}`);
    }

    return await page.evaluate(() => {
      const seen = new Set<string>();
      const anchors = Array.from(
        document.querySelectorAll(
          'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
        ),
      );

      const results = anchors
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
        .filter((href) => {
          if (!href || seen.has(href)) {
            return false;
          }

          seen.add(href);
          return true;
        })
        .slice(0, 12);

      console.log(
        `[IG scrape] Found ${anchors.length} total post links, ${results.length} unique`,
      );
      return results;
    });
  } catch (error) {
    console.error(
      `[IG scrape] Profile link extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function scrapeInstagramPostsFromPlaywright(
  username: string,
): Promise<InstagramPost[]> {
  try {
    const links = await scrapeInstagramProfileLinks(username);
    console.log(
      `[IG scrape] Retrieved ${links.length} profile links for ${username}`,
    );

    if (links.length === 0) {
      console.warn(`[IG scrape] No post links found in profile ${username}`);
      return [];
    }

    const results = await Promise.allSettled(
      links.slice(0, INSTAGRAM_PROFILE_MAX_POSTS).map(async (link, index) => {
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
      `[IG scrape] Playwright scrape error: ${error instanceof Error ? error.message : String(error)}`,
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

function getCookieValue(cookie: string, key: string): string {
  return (
    cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${key}=`))
      ?.slice(key.length + 1) || ""
  );
}

function getInstagramHeaders(referer: string): HeadersInit {
  const cookie = String(process.env.INSTAGRAM_COOKIE || "").trim();
  const csrfToken = getCookieValue(cookie, "csrftoken");

  return {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    "x-ig-app-id": "936619743392459",
    ...(csrfToken ? { "x-csrftoken": csrfToken } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
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
): Promise<string[]> {
  const normalizedMediaId = String(mediaId || "").trim();
  if (!normalizedMediaId || normalizedMediaId.startsWith("ig-")) {
    return normalizeMediaUrls(fallbackUrls);
  }

  const url = `${INSTAGRAM_MEDIA_INFO_API}${encodeURIComponent(normalizedMediaId)}/info/`;

  try {
    const response = await fetch(url, {
      headers: getInstagramHeaders(`https://www.instagram.com/p/${shortcode}/`),
      cache: "no-store",
    });

    if (!response.ok) {
      return normalizeMediaUrls(fallbackUrls);
    }

    const mediaUrls = parseInstagramMediaInfoUrls(await response.json());
    return mediaUrls.length ? mediaUrls : normalizeMediaUrls(fallbackUrls);
  } catch (error) {
    console.warn("[IG scrape] media info failed", {
      mediaId: normalizedMediaId,
      message: error instanceof Error ? error.message : String(error),
    });
    return normalizeMediaUrls(fallbackUrls);
  }
}

function parseXmlItems(xml: string): InstagramPost[] {
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
        upload_date: toIsoDate(pubDate),
      };
    })
    .filter((item) => item.link.startsWith("http"));
}

async function parseInstagramProfilePosts(
  payload: unknown,
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
      );

      return {
        ...post,
        thumbnail: mediaUrls[0] || post.thumbnail,
        media_urls: mediaUrls,
        owner_username: ownerUsername,
      };
    }),
  );
}

async function fetchProfilePosts(username: string): Promise<InstagramPost[]> {
  const url = `${INSTAGRAM_PROFILE_API}?username=${encodeURIComponent(username)}`;
  const referer = `https://www.instagram.com/${username}/`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: getInstagramHeaders(referer),
      cache: "no-store",
    });
  } catch (error) {
    const cause =
      error instanceof Error && "cause" in error
        ? String((error as Error & { cause?: unknown }).cause || "")
        : "";
    throw new Error(
      `Fetch profile API gagal: ${error instanceof Error ? error.message : String(error)} ${cause}`.trim(),
    );
  }

  if (!response.ok) {
    const body = (await response.text().catch(() => ""))
      .slice(0, 220)
      .replace(/\s+/g, " ");
    throw new Error(
      `Profile API HTTP ${response.status}: ${body || response.statusText}`,
    );
  }

  const payload = await response.json();
  const posts = await parseInstagramProfilePosts(payload, username);

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

export async function scrape_ig(username: string) {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    console.warn("[IG scrape] Empty username provided");
    return { error: "Username Instagram wajib diisi." };
  }

  console.log(
    `[IG scrape] Starting scrape for username: ${normalizedUsername}`,
  );

  // Strategi 1: RSS feed (tidak butuh login)
  try {
    console.log(`[IG scrape] Trying RSS feed...`);
    const xml = await fetchFeedXml(normalizedUsername);
    const posts = parseXmlItems(xml);
    console.log(`[IG scrape] RSS feed success: ${posts.length} posts`);
    if (posts.length > 0) {
      return { channel: `@${normalizedUsername}`, videos: posts };
    }
    console.warn(`[IG scrape] RSS returned 0 items, trying API...`);
  } catch (rssError) {
    console.warn(
      `[IG scrape] RSS feed failed:`,
      rssError instanceof Error ? rssError.message : String(rssError),
    );
  }

  // Strategi 2: Instagram Profile API
  try {
    console.log(`[IG scrape] Trying Instagram Profile API...`);
    const posts = await fetchProfilePosts(normalizedUsername);
    console.log(`[IG scrape] Profile API success: ${posts.length} posts`);
    return { channel: `@${normalizedUsername}`, videos: posts };
  } catch (apiError) {
    console.warn(
      `[IG scrape] Profile API failed:`,
      apiError instanceof Error ? apiError.message : String(apiError),
    );
  }

  // Strategi 3: Playwright (last resort, kemungkinan besar kena login wall)
  try {
    console.log(`[IG scrape] Trying Playwright as last resort...`);
    const posts = await scrapeInstagramPostsFromPlaywright(normalizedUsername);
    console.log(`[IG scrape] Playwright success: ${posts.length} posts`);
    return { channel: `@${normalizedUsername}`, videos: posts };
  } catch (scrapeError) {
    console.error(
      `[IG scrape] All strategies failed:`,
      scrapeError instanceof Error ? scrapeError.message : String(scrapeError),
    );
    return { error: SCRAPE_ERROR_MESSAGE };
  }
}
