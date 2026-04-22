"use server";

import YTDlpWrap from 'yt-dlp-wrap';

const SCRAPE_ERROR_MESSAGE = 'Gagal mengambil data YouTube saat ini.';

export interface YouTubeVideo {
  id: string;
  title: string;
  link: string;
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
  duration?: number;
  view_count?: number;
  thumbnails?: Array<{ url?: string }>;
}

interface YouTubeScrapePayload {
  id?: string;
  title?: string;
  entries?: YouTubeScrapeEntry[];
}

export async function scrape_youtube(channelUrl: string): Promise<ScrapeResult> {
  const ytDlp = new YTDlpWrap();

  try {
    const args = [
      channelUrl,
      '--flat-playlist',
      '--playlist-items',
      '1:20',
      '--dump-single-json',
      '--no-warnings',
      '--quiet',
    ];

    const stdout = await ytDlp.execPromise(args);

    if (!stdout) {
      throw new Error('Tidak ada data yang diterima dari yt-dlp.');
    }

    const data = JSON.parse(stdout) as YouTubeScrapePayload;

    const videos: YouTubeVideo[] = (data.entries || [])
      .filter((entry) => entry && (entry.url || entry.id) && entry.id !== data.id)
      .map((entry, index) => {
        const rawId = entry.id || `v-${index}`;
        const uniqueId = rawId === data.id ? `${rawId}-${index}` : rawId;

        return {
          id: uniqueId,
          title: entry.title || 'Untitled Video',
          link: entry.url
            ? entry.url.startsWith('http')
              ? entry.url
              : `https://www.youtube.com/watch?v=${entry.id}`
            : `https://www.youtube.com/watch?v=${entry.id}`,
          duration: entry.duration,
          view_count: entry.view_count,
          thumbnail: entry.thumbnails?.[0]?.url || '',
        };
      });

    return {
      channel: data.title || 'Unknown Channel',
      videoCount: videos.length,
      videos,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Scraper Backend Error:', message);
    return {
      error: SCRAPE_ERROR_MESSAGE,
    };
  }
}
