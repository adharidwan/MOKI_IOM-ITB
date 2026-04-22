'use server';

import { revalidatePath } from 'next/cache';

import {
  deleteContentRecording,
  upsertContentRecording,
  type ContentRecordingInput,
} from '../lib/api';
import { scrapeContentFromLink } from '../lib/scrape-content-link';
import type { ContentRecording, ContentRecordingPlatform } from '../lib/types';

const PLATFORM_OPTIONS: ContentRecordingPlatform[] = ['youtube', 'x', 'Instagram'];

export interface ContentRecordingFormState {
  title: string;
  platform: ContentRecordingPlatform;
  upload_date: string;
  link: string;
  source_post_id: string;
  thumbnail_url: string;
}

export interface ScrapeContentRecordingResult {
  success: boolean;
  data?: Partial<ContentRecordingFormState>;
  error?: string;
}

export interface SaveContentRecordingResult {
  success: boolean;
  record?: ContentRecording;
  error?: string;
}

export interface DeleteContentRecordingResult {
  success: boolean;
  error?: string;
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim();
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function normalizeInput(input: ContentRecordingFormState): ContentRecordingInput {
  const title = normalizeText(input.title);
  const platform = input.platform;
  const uploadDate = normalizeText(input.upload_date);
  const link = normalizeText(input.link);

  if (!title) {
    throw new Error('Title wajib diisi.');
  }

  if (!PLATFORM_OPTIONS.includes(platform)) {
    throw new Error('Platform tidak valid.');
  }

  if (!isValidDate(uploadDate)) {
    throw new Error('Tanggal upload wajib diisi dengan format yang valid.');
  }

  if (!link) {
    throw new Error('Link wajib diisi.');
  }

  return {
    title,
    platform,
    upload_date: uploadDate,
    link,
    source_post_id: normalizeText(input.source_post_id) || null,
    thumbnail_url: normalizeText(input.thumbnail_url) || null,
  };
}

export async function scrapeContentRecordingAction(
  rawLink: string,
): Promise<ScrapeContentRecordingResult> {
  const link = normalizeText(rawLink);

  if (!link) {
    return {
      success: false,
      error: 'Link wajib diisi sebelum auto-fill dijalankan.',
    };
  }

  try {
    const scraped = await scrapeContentFromLink(link);

    return {
      success: true,
      data: {
        title: normalizeText(scraped.title),
        platform: scraped.platform,
        upload_date: normalizeText(scraped.upload_date),
        link: normalizeText(scraped.link) || link,
        source_post_id: normalizeText(scraped.source_post_id || ''),
        thumbnail_url: normalizeText(scraped.thumbnail_url || ''),
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Gagal mengambil metadata dari link tersebut.',
    };
  }
}

export async function saveContentRecordingAction(
  input: ContentRecordingFormState,
): Promise<SaveContentRecordingResult> {
  try {
    const record = await upsertContentRecording(normalizeInput(input));
    revalidatePath('/content-record');

    return {
      success: true,
      record,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan content recording.',
    };
  }
}

export async function deleteContentRecordingAction(
  id: string,
): Promise<DeleteContentRecordingResult> {
  try {
    await deleteContentRecording(id);
    revalidatePath('/content-record');

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Gagal menghapus content recording.',
    };
  }
}
