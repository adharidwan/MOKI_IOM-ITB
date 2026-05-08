"use server";

import { revalidatePath } from "next/cache";

import { upsertContentRecording } from "../lib/api";
import { scrapeContentFromLink } from "../lib/scrape-content-link";
import { getSupabaseAdminClient } from "../lib/supabase-server";
import type { ContentRecordingPlatform, ContentRecordingType } from "../lib/types";

export interface ScrapedRecordingCandidate {
  title: string;
  platform: ContentRecordingPlatform;
  upload_date?: string;
  link: string;
  source_post_id?: string;
  thumbnail_url?: string;
  caption?: string;
  content_type?: ContentRecordingType;
}

interface ExportFailure {
  link: string;
  error: string;
}

export interface ExportScrapedContentResult {
  success: boolean;
  savedCount: number;
  failed: ExportFailure[];
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "").trim();
}

function normalizeDate(value: string | null | undefined): string {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }

  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))) {
    return raw;
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return "";
}

function normalizeContentType(value: string | null | undefined): ContentRecordingType | null {
  const normalized = normalizeText(value);
  const validTypes: ContentRecordingType[] = ['video', 'short', 'reel', 'post', 'tweet', 'article', 'other'];
  return validTypes.includes(normalized as ContentRecordingType)
    ? normalized as ContentRecordingType
    : null;
}

function dedupeByLink(
  items: ScrapedRecordingCandidate[],
): ScrapedRecordingCandidate[] {
  const seen = new Set<string>();
  const deduped: ScrapedRecordingCandidate[] = [];

  for (const item of items) {
    const link = normalizeText(item.link);
    if (!link) {
      continue;
    }

    const key = link.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function findExistingRecording(candidate: {
  link: string;
}): Promise<string | null> {
  const supabase = getSupabaseAdminClient();

  const { data: linkMatches, error: linkError } = await supabase
    .from("content_recordings")
    .select("id, title, link")
    .eq("link", candidate.link)
    .limit(1);

  if (linkError) {
    throw new Error(
      `Gagal mengecek duplikasi berdasarkan link: ${linkError.message}`,
    );
  }

  if (linkMatches?.length) {
    return linkMatches[0].title || candidate.link;
  }

  return null;
}

async function enrichCandidate(candidate: ScrapedRecordingCandidate): Promise<{
  title: string;
  platform: ContentRecordingPlatform;
  uploadDate: string;
  link: string;
  sourcePostId: string;
  thumbnailUrl: string;
  caption: string;
  contentType: ContentRecordingType | null;
}> {
  const link = normalizeText(candidate.link);
  let title = normalizeText(candidate.title);
  let platform = candidate.platform;
  let uploadDate = normalizeDate(candidate.upload_date);
  let sourcePostId = normalizeText(candidate.source_post_id);
  let thumbnailUrl = normalizeText(candidate.thumbnail_url);
  let caption = normalizeText(candidate.caption);
  let contentType = normalizeContentType(candidate.content_type);

  const needsHydration =
    !title || !uploadDate || !sourcePostId || !thumbnailUrl;

  if (link && needsHydration) {
    try {
      const scraped = await scrapeContentFromLink(link);

      title = title || normalizeText(scraped.title);
      uploadDate = uploadDate || normalizeDate(scraped.upload_date);
      sourcePostId =
        sourcePostId || normalizeText(scraped.source_post_id || "");
      thumbnailUrl = thumbnailUrl || normalizeText(scraped.thumbnail_url || "");
      caption = caption || normalizeText(scraped.caption || "");
      contentType = contentType || normalizeContentType(scraped.content_type || "");
      platform = platform || scraped.platform;
    } catch (error) {
      // Keep original candidate values and let validation below determine if enough data is available.
      console.warn("[exportScrapedContentAction] metadata enrichment failed", {
        link,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    title,
    platform,
    uploadDate,
    link,
    sourcePostId,
    thumbnailUrl,
    caption,
    contentType,
  };
}

export async function exportScrapedContentAction(
  items: ScrapedRecordingCandidate[],
): Promise<ExportScrapedContentResult> {
  const candidates = dedupeByLink(items || []);
  if (!candidates.length) {
    return {
      success: false,
      savedCount: 0,
      failed: [{ link: "", error: "Tidak ada data terpilih untuk diekspor." }],
    };
  }

  let savedCount = 0;
  const failed: ExportFailure[] = [];

  for (const candidate of candidates) {
    const { link, title, platform, uploadDate, sourcePostId, thumbnailUrl, caption, contentType } =
      await enrichCandidate(candidate);

    if (!link || !uploadDate) {
      failed.push({
        link,
        error:
          "Data belum lengkap (wajib: link, upload_date). Ulangi scrape agar metadata lebih lengkap.",
      });
      continue;
    }

    try {
      const existing = await findExistingRecording({ link });

      if (existing) {
        failed.push({
          link,
          error: `Konten dengan link ini sudah ada: ${link}`,
        });
        continue;
      }
    } catch (error) {
      failed.push({
        link,
        error:
          error instanceof Error
            ? error.message
            : "Gagal mengecek konten yang sudah ada.",
      });
      continue;
    }

    try {
      await upsertContentRecording({
        title,
        platform,
        upload_date: uploadDate,
        link,
        caption: caption || null,
        content_type: contentType || null,
        source_post_id: sourcePostId || null,
        thumbnail_url: thumbnailUrl || null,
      });
      savedCount += 1;
    } catch (error) {
      failed.push({
        link,
        error:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan content recording.",
      });
    }
  }

  revalidatePath("/content-record");
  revalidatePath("/scrape");

  return {
    success: savedCount > 0,
    savedCount,
    failed,
  };
}
