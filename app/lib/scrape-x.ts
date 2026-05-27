"use server";

const SCRAPE_ERROR_MESSAGE = "Gagal mengambil data X saat ini.";

interface ScrapeOptions {
  minPosts?: number;
}

export interface ScrapedXPost {
  id: string;
  title: string;
  link: string;
  content: string;
  upload_date?: string;
  thumbnail?: string;
}

export interface XScrapeResult {
  channel?: string;
  videos?: ScrapedXPost[];
  error?: string;
}

const FEED_URL_BUILDERS = [
  (username: string) => `https://nitter.net/${username}/rss`,
  (username: string) => `https://nitter.poast.org/${username}/rss`,
  (username: string) => `https://rsshub.app/twitter/user/${username}`,
];

function normalizeUsername(rawUsername: string): string {
  return String(rawUsername || "")
    .trim()
    .replace(/^@/, "");
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

function toIsoDate(value: string | undefined): string {
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

function parseXmlItems(
  xml: string,
): Array<{
  title: string;
  link: string;
  pubDate: string;
  description: string;
  thumbnail: string;
}> {
  const items = Array.from(
    xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
  ).map((match) => match[1]);

  return items
    .map((item) => {
      const title = decodeXmlEntities(
        item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "",
      );
      const link = decodeXmlEntities(
        item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "",
      );
      const pubDate = decodeXmlEntities(
        item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || "",
      );
      const description = decodeXmlEntities(
        item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || "",
      );
      const mediaThumbnail = decodeXmlEntities(
        item.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1] ||
          "",
      );
      const mediaContent = decodeXmlEntities(
        item.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1] || "",
      );

      return {
        title,
        link,
        pubDate,
        description,
        thumbnail: mediaThumbnail || mediaContent,
      };
    })
    .filter((item) => item.link.startsWith("http"));
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
        continue;
      }

      const xml = await response.text();
      if (xml.includes("<item")) {
        return xml;
      }

      lastError = `Feed kosong dari ${feedUrl}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError || "Semua sumber feed X gagal diakses.");
}

export async function scrape_x(
  username: string,
  options: ScrapeOptions = {},
): Promise<XScrapeResult> {
  const minPosts = Math.min(Math.max(Math.trunc(options.minPosts || 20), 1), 50);
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    return { error: "Username X wajib diisi." };
  }

  try {
    const xml = await fetchFeedXml(normalizedUsername);
    const items = parseXmlItems(xml)
      .filter((item) => /\/status\/\d+/.test(item.link))
      .slice(0, minPosts);

    const tweets: ScrapedXPost[] = items.map((item, index) => {
      const statusId = item.link.match(/\/status\/(\d+)/)?.[1] || `x-${index}`;
      const cleanTitle = item.title.replace(/^\s*RT\s+/i, "").trim();

      return {
        id: statusId,
        title: cleanTitle || `Tweet ${index + 1}`,
        link: item.link,
        content: cleanTitle || item.description,
        upload_date: toIsoDate(item.pubDate),
        thumbnail: item.thumbnail,
      };
    });

    const uniqueTweets = Array.from(
      new Map(tweets.map((tweet) => [tweet.id, tweet] as const)).values(),
    );

    return {
      channel: `@${normalizedUsername}`,
      videos: uniqueTweets.slice(0, minPosts),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Scrape X feed error:", message);
    return { error: SCRAPE_ERROR_MESSAGE };
  }
}
