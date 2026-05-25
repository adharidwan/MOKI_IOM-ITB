import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { pgUuidArray } from '../db/pg-array';
import { contentRecordingTags, contentRecordings } from '../db/schema';
import { firstRowFromResult, rowsFromResult, type DatabaseRow, type SortDirection } from './types';

export type ContentRecordingSortKey = 'title' | 'platform' | 'content_type' | 'upload_date' | 'created_at' | 'updated_at';

export interface ListContentRecordingsQuery {
  search: string | null;
  platform: string | null;
  contentType: string | null;
  tagIds: string[];
  page: number;
  pageSize: number;
  sortBy: ContentRecordingSortKey;
  sortDir: SortDirection;
}

export interface UpsertContentRecordingRecord {
  id?: string | null;
  title?: string | null;
  platform: string;
  caption?: string | null;
  description?: string | null;
  content_type?: string | null;
  upload_date: string;
  link: string;
  source_post_id?: string | null;
  thumbnail_url?: string | null;
  media_urls?: string[] | null;
}

export async function listContentRecordingRows(): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select
      content_recordings.*,
      coalesce(
        jsonb_agg(to_jsonb(content_tags.*) order by content_tags.name)
          filter (where content_tags.id is not null),
        '[]'::jsonb
      ) as tags
    from public.content_recordings
    left join public.content_recording_tags on content_recording_tags.content_recording_id = content_recordings.id
    left join public.content_tags on content_tags.id = content_recording_tags.tag_id
    group by content_recordings.id
    order by content_recordings.upload_date desc, content_recordings.created_at desc
  `);

  return rowsFromResult(result);
}

export async function listPaginatedContentRecordingRows(query: ListContentRecordingsQuery): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select *
    from public.list_content_recordings(
      ${query.search},
      ${query.platform},
      ${query.contentType},
      ${pgUuidArray(query.tagIds)},
      ${query.page},
      ${query.pageSize},
      ${query.sortBy},
      ${query.sortDir}
    )
  `);

  return rowsFromResult(result);
}

export async function getContentRecordingsOverviewRow(): Promise<DatabaseRow | null> {
  const result = await db.execute(sql`
    select *
    from public.get_content_recordings_overview()
  `);

  return firstRowFromResult(result);
}

export async function findContentRecordingIdByLink(link: string): Promise<string | null> {
  const result = await db.execute(sql`
    select id
    from public.content_recordings
    where link = ${link}
    order by updated_at desc, created_at desc
    limit 1
  `);

  return String(firstRowFromResult(result)?.id || '') || null;
}

export async function updateContentRecordingRecordById(
  id: string,
  input: UpsertContentRecordingRecord,
  tagIds?: string[],
): Promise<void> {
  await db.update(contentRecordings)
    .set({
      title: input.title ?? null,
      platform: input.platform,
      caption: input.caption ?? null,
      description: input.description ?? null,
      contentType: input.content_type ?? null,
      uploadDate: input.upload_date,
      link: input.link,
      sourcePostId: input.source_post_id ?? null,
      thumbnailUrl: input.thumbnail_url ?? null,
      mediaUrls: input.media_urls ?? [],
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contentRecordings.id, id));

  if (tagIds) {
    await replaceContentRecordingTagRows(id, tagIds);
  }
}

export async function replaceContentRecordingTagRows(contentRecordingId: string, tagIds: string[]): Promise<void> {
  const normalizedTagIds = Array.from(new Set(tagIds.map((id) => String(id || '').trim()).filter(Boolean)));

  await db.delete(contentRecordingTags).where(eq(contentRecordingTags.contentRecordingId, contentRecordingId));

  if (normalizedTagIds.length) {
    await db.insert(contentRecordingTags).values(
      normalizedTagIds.map((tagId) => ({
        contentRecordingId,
        tagId,
      })),
    ).onConflictDoNothing();
  }
}

export async function upsertContentRecordingRecord(
  input: UpsertContentRecordingRecord,
  tagIds: string[],
): Promise<DatabaseRow> {
  const [row] = await db.insert(contentRecordings)
    .values({
      id: input.id || undefined,
      title: input.title ?? null,
      platform: input.platform,
      caption: input.caption ?? null,
      description: input.description ?? null,
      contentType: input.content_type ?? null,
      uploadDate: input.upload_date,
      link: input.link,
      sourcePostId: input.source_post_id ?? null,
      thumbnailUrl: input.thumbnail_url ?? null,
      mediaUrls: input.media_urls ?? [],
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: contentRecordings.link,
      set: {
        title: sql`excluded.title`,
        platform: sql`excluded.platform`,
        caption: sql`excluded.caption`,
        description: sql`excluded.description`,
        contentType: sql`excluded.content_type`,
        uploadDate: sql`excluded.upload_date`,
        sourcePostId: sql`excluded.source_post_id`,
        thumbnailUrl: sql`excluded.thumbnail_url`,
        mediaUrls: sql`excluded.media_urls`,
        updatedAt: sql`timezone('utc'::text, now())`,
      },
    })
    .returning();

  if (!row) {
    throw new Error('Failed to upsert content recording.');
  }

  await replaceContentRecordingTagRows(row.id, tagIds);

  return row as DatabaseRow;
}

export async function getContentRecordingRowById(id: string): Promise<DatabaseRow | null> {
  const result = await db.execute(sql`
    select
      content_recordings.*,
      coalesce(
        jsonb_agg(to_jsonb(content_tags.*) order by content_tags.name)
          filter (where content_tags.id is not null),
        '[]'::jsonb
      ) as tags
    from public.content_recordings
    left join public.content_recording_tags on content_recording_tags.content_recording_id = content_recordings.id
    left join public.content_tags on content_tags.id = content_recording_tags.tag_id
    where content_recordings.id = ${id}
    group by content_recordings.id
    limit 1
  `);

  return firstRowFromResult(result);
}

export async function deleteContentRecordingRecord(id: string): Promise<void> {
  await db.delete(contentRecordings).where(eq(contentRecordings.id, id));
}
