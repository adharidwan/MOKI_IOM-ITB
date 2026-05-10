"use server";

import { createYtDlpClient } from "./yt-dlp";

const SCRAPE_ERROR_MESSAGE = "Gagal mengambil data YouTube saat ini.";

export interface YouTubeVideo {
  id: string;
  title: string;
  link: string;
  upload_date?: string;
  duration?: number;
  view_count?: number;
  thumbnail?: string;
}

export interface ScrapeResult {
  channel?: string;
  videoCount?: number;
  videos?: YouTubeVideo[];
  error?: string;
}

interface YouTubeScrapeEntry {
  id?: string;
  title?: string;
  url?: string;
  upload_date?: string;
  timestamp?: number;
  duration?: number;
  view_count?: number;
  thumbnails?: Array<{ url?: string }>;
}

interface YouTubeScrapePayload {
  id?: string;
  title?: string;
  channel_id?: string;
  entries?: YouTubeScrapeEntry[];
}

function toIsoDate(value: string | number | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value > 1e12 ? value : value * 1000;
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return "";
}

// Hanya bertugas mengambil channel_id dari URL channel
async function fetchYouTubeChannelId(baseUrl: string): Promise<string> {
  const ytDlp = createYtDlpClient();
  const stdout = await ytDlp.execPromise([
    baseUrl,
    "--flat-playlist",
    "--playlist-items",
    "0",
    "--dump-single-json",
    "--no-warnings",
  ]);
  const data = JSON.parse(stdout) as YouTubeScrapePayload;
  const channelId = data.channel_id || data.id || "";
  console.log(`[YT scrape] Resolved channel_id: ${channelId}`);
  return channelId;
}

function parseYouTubeRssXml(xml: string): YouTubeVideo[] {
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).map(
    (m) => m[1],
  );

  return entries.map((entry, index) => {
    const id =
      entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1]?.trim() ||
      `v-${index}`;
    const title =
      entry.match(/<title>(.*?)<\/title>/)?.[1]?.trim() || "Untitled";
    const published =
      entry.match(/<published>(.*?)<\/published>/)?.[1]?.trim() || "";
    const thumbnail =
      entry.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1]?.trim() || "";
    const viewCount =
      entry.match(/<media:statistics[^>]+views="([^"]+)"/)?.[1]?.trim() || "0";

    return {
      id,
      title,
      link: `https://www.youtube.com/watch?v=${id}`,
      upload_date: toIsoDate(published),
      view_count: parseInt(viewCount, 10) || 0,
      thumbnail: thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    } as YouTubeVideo;
  });
}

async function fetchRssFeed(
  channelId: string,
  handle: string,
): Promise<YouTubeVideo[]> {
  const rssUrls = [
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    // Fallback pakai handle jika channel_id gagal (HTTP 500)
    handle ? `https://www.youtube.com/feeds/videos.xml?user=${handle}` : null,
  ].filter(Boolean) as string[];

  for (const rssUrl of rssUrls) {
    console.log(`[YT scrape] Trying RSS: ${rssUrl}`);
    try {
      const response = await fetch(rssUrl, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml, */*",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        console.warn(`[YT scrape] RSS HTTP ${response.status} for ${rssUrl}`);
        continue;
      }

      const xml = await response.text();
      console.log(`[YT scrape] RSS XML length: ${xml.length} from ${rssUrl}`);

      const videos = parseYouTubeRssXml(xml).slice(0, 10);
      if (videos.length > 0) {
        console.log(`[YT scrape] RSS parsed ${videos.length} videos`);
        return videos;
      }

      console.warn(`[YT scrape] RSS returned 0 videos from ${rssUrl}`);
    } catch (err) {
      console.warn(
        `[YT scrape] RSS fetch error for ${rssUrl}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return [];
}

export async function scrape_youtube(
  channelUrl: string,
): Promise<ScrapeResult> {
  console.log(`[YT scrape] Starting scrape for: ${channelUrl}`);

  const baseUrl = channelUrl.replace(/\/(videos|shorts|streams|live)\/?$/, "");
  // Ekstrak handle dari URL, misal "@IOM-ITB" → "IOM-ITB"
  const handle = baseUrl.match(/@([\w-]+)/)?.[1] || "";

  // Strategi 1: RSS feed
  try {
    console.log(`[YT scrape] Trying RSS feed strategy...`);
    const channelId = await fetchYouTubeChannelId(baseUrl);

    if (channelId) {
      const videos = await fetchRssFeed(channelId, handle);
      if (videos.length > 0) {
        return {
          channel: handle || "Unknown Channel",
          videoCount: videos.length,
          videos,
        };
      }
    }
  } catch (rssError) {
    console.warn(
      `[YT scrape] RSS strategy failed:`,
      rssError instanceof Error ? rssError.message : String(rssError),
    );
  }

  // Strategi 2: yt-dlp fallback
  console.log(`[YT scrape] Falling back to yt-dlp...`);
  const ytDlp = createYtDlpClient();

  try {
    const args = [
      `${baseUrl}/videos`,
      "--flat-playlist",
      "--playlist-items",
      "1:10",
      "--dump-single-json",
      "--no-warnings",
    ];

    console.log(`[YT scrape] yt-dlp args:`, args);
    const stdout = await ytDlp.execPromise(args);

    if (!stdout) throw new Error("Empty stdout dari yt-dlp.");

    const data = JSON.parse(stdout) as YouTubeScrapePayload;
    console.log(
      `[YT scrape] yt-dlp _type: ${(data as any)._type}, entries: ${data.entries?.length ?? 0}`,
    );

    const rawEntries: YouTubeScrapeEntry[] = [];
    for (const entry of data.entries || []) {
      const e = entry as any;
      if (e._type === "playlist" && Array.isArray(e.entries)) {
        console.log(`[YT scrape] Expanding sub-playlist "${e.title}"`);
        rawEntries.push(...e.entries);
      } else {
        rawEntries.push(entry);
      }
    }

    const videos: YouTubeVideo[] = rawEntries
      .filter((e) => {
        const keep = !!e?.id && e.id !== data.id && e.id !== data.channel_id;
        if (!keep) {
          console.warn(`[YT scrape] Entry filtered out — id: ${e?.id}`);
        }
        return keep;
      })
      .slice(0, 10)
      .map((entry) => {
        const id = entry.id!;
        return {
          id,
          title: entry.title || "Untitled Video",
          link: `https://www.youtube.com/watch?v=${id}`,
          upload_date:
            toIsoDate(entry.upload_date) || toIsoDate(entry.timestamp),
          duration: entry.duration,
          view_count: entry.view_count,
          thumbnail:
            entry.thumbnails?.[0]?.url ||
            `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
      });

    console.log(`[YT scrape] yt-dlp final video count: ${videos.length}`);
    return {
      channel: data.title || handle || "Unknown Channel",
      videoCount: videos.length,
      videos,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[YT scrape] All strategies failed:", message);
    return { error: SCRAPE_ERROR_MESSAGE };
  }
}
