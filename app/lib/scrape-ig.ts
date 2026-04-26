"use server";

const SCRAPE_ERROR_MESSAGE = "Gagal mengambil data Instagram saat ini.";

interface InstagramPost {
  id: string;
  title: string;
  link: string;
  thumbnail: string;
  upload_date?: string;
}

const FEED_URL_BUILDERS = [
  (username: string) => `https://rsshub.app/instagram/user/${username}`,
  (username: string) =>
    `https://rsshub.rssforever.com/instagram/user/${username}`,
];

const INSTAGRAM_PROFILE_API =
  "https://i.instagram.com/api/v1/users/web_profile_info/";

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

      return {
        id: idFromLink,
        title:
          title ||
          description.substring(0, 80) ||
          `Instagram Post ${index + 1}`,
        link,
        thumbnail: mediaContent || enclosure,
        upload_date: toIsoDate(pubDate),
      };
    })
    .filter((item) => item.link.startsWith("http"));
}

function parseInstagramProfilePosts(payload: unknown): InstagramPost[] {
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
              taken_at_timestamp?: number;
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

  return edges
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
      const uploadDate = toIsoDate(node?.taken_at_timestamp);

      if (!shortcode) {
        return null;
      }

      return {
        id,
        title: caption ? caption.slice(0, 80) : `Instagram Post ${index + 1}`,
        link: `https://www.instagram.com/p/${shortcode}/`,
        thumbnail,
        upload_date: uploadDate,
      } as InstagramPost;
    })
    .filter((item): item is InstagramPost => Boolean(item));
}

async function fetchProfilePosts(username: string): Promise<InstagramPost[]> {
  const url = `${INSTAGRAM_PROFILE_API}?username=${encodeURIComponent(username)}`;
  const referer = `https://www.instagram.com/${username}/`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "x-ig-app-id": "936619743392459",
        Referer: referer,
        Origin: "https://www.instagram.com",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
      },
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
  const posts = parseInstagramProfilePosts(payload);

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
    return { error: "Username Instagram wajib diisi." };
  }

  try {
    const posts = await fetchProfilePosts(normalizedUsername);
    return { channel: `@${normalizedUsername}`, videos: posts };
  } catch (profileError) {
    console.warn("[IG scrape] profile API failed, falling back to RSS", {
      username: normalizedUsername,
      message:
        profileError instanceof Error
          ? profileError.message
          : String(profileError),
    });

    try {
      const xml = await fetchFeedXml(normalizedUsername);
      const posts = parseXmlItems(xml);
      return { channel: `@${normalizedUsername}`, videos: posts };
    } catch (feedError) {
      console.error(
        "Scrape IG feed error:",
        feedError instanceof Error ? feedError.message : String(feedError),
      );
      return { error: SCRAPE_ERROR_MESSAGE };
    }
  }
}
