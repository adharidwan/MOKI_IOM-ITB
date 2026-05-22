import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from './db/client';
import { pgUuidArray } from './db/pg-array';
import { createObjectSignedUrl, downloadObject, removeObject, removeObjects } from './object-storage';
import type { ContentAsset, ContentAssetProject, ContentTag } from './types';

export const CONTENT_ASSET_BUCKET = 'content-assets';

export interface ContentAssetInput {
  projectId?: string | null;
  uploader: string;
  uploaderEmail?: string | null;
  projectName: string;
  originalFilename: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  notes?: string | null;
}

export interface UpdateContentAssetInput {
  id: string;
  originalFilename?: string | null;
  notes?: string | null;
  tagIds?: string[];
}

export interface UpdateContentAssetProjectInput {
  id: string;
  projectName: string;
  notes?: string | null;
  tagIds?: string[];
}

export interface ContentAssetProjectInput {
  createdBy: string;
  createdByEmail?: string | null;
  projectName: string;
  notes?: string | null;
}

type RawRecord = Record<string, unknown>;

function rowsFromResult<T>(result: { rows?: unknown[] }): T[] {
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}

function firstRowFromResult<T>(result: { rows?: unknown[] }): T | null {
  return rowsFromResult<T>(result)[0] ?? null;
}

function toContentTags(value: unknown): ContentTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((tag) => {
      const record = tag as RawRecord;
      return {
        id: String(record.id || ''),
        name: String(record.name || ''),
        created_at: record.created_at === null || record.created_at === undefined ? undefined : String(record.created_at),
      };
    })
    .filter((tag) => tag.id && tag.name);
}

function toContentAsset(record: RawRecord, signedUrl: string | null = null): ContentAsset {
  return {
    id: String(record.id || ''),
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || ''),
    uploader: String(record.uploader || ''),
    uploader_email:
      record.uploader_email === null || record.uploader_email === undefined
        ? null
        : String(record.uploader_email),
    project_id:
      record.project_id === null || record.project_id === undefined
        ? null
        : String(record.project_id),
    project_name: String(record.project_name || ''),
    original_filename: String(record.original_filename || ''),
    storage_bucket: String(record.storage_bucket || CONTENT_ASSET_BUCKET),
    storage_path: String(record.storage_path || ''),
    mime_type: String(record.mime_type || ''),
    file_size: Number(record.file_size || 0),
    notes: record.notes === null || record.notes === undefined ? null : String(record.notes),
    tags: toContentTags(record.tags),
    signed_url: signedUrl,
  };
}

function toContentAssetProject(record: RawRecord, previewAsset: ContentAsset | null = null): ContentAssetProject {
  return {
    id: String(record.id || ''),
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || ''),
    created_by: String(record.created_by || ''),
    created_by_email:
      record.created_by_email === null || record.created_by_email === undefined
        ? null
        : String(record.created_by_email),
    project_name: String(record.project_name || ''),
    notes: record.notes === null || record.notes === undefined ? null : String(record.notes),
    asset_count: Number(record.asset_count || 0),
    image_count: Number(record.image_count || 0),
    video_count: Number(record.video_count || 0),
    total_file_size: Number(record.total_file_size || 0),
    latest_asset_at:
      record.latest_asset_at === null || record.latest_asset_at === undefined
        ? null
        : String(record.latest_asset_at),
    tags: toContentTags(record.tags),
    preview_asset: previewAsset,
  };
}

async function createSignedUrl(bucket: string, path: string): Promise<string | null> {
  return createObjectSignedUrl(bucket, path, 60 * 60);
}

async function rowsToContentAssets(rows: RawRecord[]): Promise<ContentAsset[]> {
  return Promise.all(
    rows.map(async (record) => toContentAsset(
      record,
      await createSignedUrl(
        String(record.storage_bucket || CONTENT_ASSET_BUCKET),
        String(record.storage_path || ''),
      ),
    )),
  );
}

async function queryContentAssets(whereSql = sql`true`, limit = 200): Promise<RawRecord[]> {
  const result = await db.execute(sql`
    select
      content_assets.id,
      content_assets.created_at::text,
      content_assets.updated_at::text,
      content_assets.uploader,
      content_assets.uploader_email,
      content_assets.project_id,
      content_assets.project_name,
      content_assets.original_filename,
      content_assets.storage_bucket,
      content_assets.storage_path,
      content_assets.mime_type,
      content_assets.file_size,
      content_assets.notes,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', content_tags.id,
            'name', content_tags.name,
            'created_at', content_tags.created_at::text
          )
          order by content_tags.name
        ) filter (where content_tags.id is not null),
        '[]'::jsonb
      ) as tags
    from public.content_assets
    left join public.content_asset_tags on content_asset_tags.content_asset_id = content_assets.id
    left join public.content_tags on content_tags.id = content_asset_tags.tag_id
    where ${whereSql}
    group by content_assets.id
    order by content_assets.created_at desc
    limit ${limit}
  `);

  return rowsFromResult<RawRecord>(result);
}

async function queryContentAssetProjects(whereSql = sql`true`, limit = 200): Promise<RawRecord[]> {
  const result = await db.execute(sql`
    select
      content_asset_projects.id,
      content_asset_projects.created_at::text,
      content_asset_projects.updated_at::text,
      content_asset_projects.created_by,
      content_asset_projects.created_by_email,
      content_asset_projects.project_name,
      content_asset_projects.notes,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', content_tags.id,
            'name', content_tags.name,
            'created_at', content_tags.created_at::text
          )
          order by content_tags.name
        ) filter (where content_tags.id is not null),
        '[]'::jsonb
      ) as tags
    from public.content_asset_projects
    left join public.content_asset_project_tags on content_asset_project_tags.content_asset_project_id = content_asset_projects.id
    left join public.content_tags on content_tags.id = content_asset_project_tags.tag_id
    where ${whereSql}
    group by content_asset_projects.id
    order by content_asset_projects.updated_at desc
    limit ${limit}
  `);

  return rowsFromResult<RawRecord>(result);
}

export async function listContentAssets(): Promise<ContentAsset[]> {
  return rowsToContentAssets(await queryContentAssets(sql`true`, 200));
}

export async function listContentAssetProjects(): Promise<ContentAssetProject[]> {
  const [projects, assetsWithUrls] = await Promise.all([
    queryContentAssetProjects(sql`true`, 200),
    rowsToContentAssets(await queryContentAssets(sql`true`, 1000)),
  ]);

  return projects.map((project) => {
    const projectId = String(project.id || '');
    const projectAssets = assetsWithUrls.filter((asset) => asset.project_id === projectId);
    const latestAsset = projectAssets[0] || null;

    return toContentAssetProject(
      {
        ...project,
        asset_count: projectAssets.length,
        image_count: projectAssets.filter((asset) => asset.mime_type.startsWith('image/')).length,
        video_count: projectAssets.filter((asset) => asset.mime_type.startsWith('video/')).length,
        total_file_size: projectAssets.reduce((total, asset) => total + asset.file_size, 0),
        latest_asset_at: latestAsset?.created_at || null,
      },
      latestAsset,
    );
  });
}

export async function getContentAssetProject(id: string): Promise<ContentAssetProject | null> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Project id wajib diisi.');
  }

  const project = firstRowFromResult<RawRecord>({
    rows: await queryContentAssetProjects(sql`content_asset_projects.id = ${normalizedId}`, 1),
  });

  if (!project) {
    return null;
  }

  const assets = await listContentAssetsByProject(normalizedId);
  const latestAsset = assets[0] || null;

  return toContentAssetProject(
    {
      ...project,
      asset_count: assets.length,
      image_count: assets.filter((asset) => asset.mime_type.startsWith('image/')).length,
      video_count: assets.filter((asset) => asset.mime_type.startsWith('video/')).length,
      total_file_size: assets.reduce((total, asset) => total + asset.file_size, 0),
      latest_asset_at: latestAsset?.created_at || null,
    },
    latestAsset,
  );
}

export async function listContentAssetsByProject(projectId: string): Promise<ContentAsset[]> {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) {
    throw new Error('Project id wajib diisi.');
  }

  return rowsToContentAssets(await queryContentAssets(sql`content_assets.project_id = ${normalizedProjectId}`, 500));
}

export async function getContentAsset(id: string): Promise<ContentAsset | null> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Asset id wajib diisi.');
  }

  const record = firstRowFromResult<RawRecord>({
    rows: await queryContentAssets(sql`content_assets.id = ${normalizedId}`, 1),
  });

  if (!record) {
    return null;
  }

  return toContentAsset(
    record,
    await createSignedUrl(
      String(record.storage_bucket || CONTENT_ASSET_BUCKET),
      String(record.storage_path || ''),
    ),
  );
}

export async function downloadContentAssetObject(asset: ContentAsset): Promise<Blob> {
  if (!asset.storage_bucket || !asset.storage_path) {
    throw new Error('Lokasi storage asset tidak valid.');
  }

  try {
    return await downloadObject(asset.storage_bucket, asset.storage_path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Gagal download asset "${asset.original_filename}": ${message}`);
  }
}

export async function createContentAssetProject(input: ContentAssetProjectInput): Promise<ContentAssetProject> {
  const projectName = String(input.projectName || '').replace(/\s+/g, ' ').trim();
  if (!projectName) {
    throw new Error('Nama project wajib diisi.');
  }

  const result = await db.execute(sql`
    insert into public.content_asset_projects (created_by, created_by_email, project_name, notes, updated_at)
    values (${input.createdBy}, ${input.createdByEmail || null}, ${projectName}, ${input.notes || null}, ${new Date().toISOString()}::timestamptz)
    returning id, created_at::text, updated_at::text, created_by, created_by_email, project_name, notes
  `);
  const record = firstRowFromResult<RawRecord>(result);

  if (!record) {
    throw new Error('Gagal membuat project asset.');
  }

  return toContentAssetProject({ ...record, tags: [] });
}

export async function createContentAsset(input: ContentAssetInput): Promise<ContentAsset> {
  const result = await db.execute(sql`
    insert into public.content_assets (
      project_id,
      uploader,
      uploader_email,
      project_name,
      original_filename,
      storage_bucket,
      storage_path,
      mime_type,
      file_size,
      notes,
      updated_at
    )
    values (
      ${input.projectId || null},
      ${input.uploader},
      ${input.uploaderEmail || null},
      ${input.projectName},
      ${input.originalFilename},
      ${input.storageBucket},
      ${input.storagePath},
      ${input.mimeType},
      ${input.fileSize},
      ${input.notes || null},
      ${new Date().toISOString()}::timestamptz
    )
    returning
      id,
      created_at::text,
      updated_at::text,
      uploader,
      uploader_email,
      project_id,
      project_name,
      original_filename,
      storage_bucket,
      storage_path,
      mime_type,
      file_size,
      notes
  `);
  const record = firstRowFromResult<RawRecord>(result);

  if (!record) {
    throw new Error('Gagal menyimpan metadata asset.');
  }

  return toContentAsset(
    { ...record, tags: [] },
    await createSignedUrl(input.storageBucket, input.storagePath),
  );
}

function normalizeTagIds(tagIds: string[] | undefined): string[] {
  return Array.from(new Set((tagIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
}

async function replaceContentAssetTags(assetId: string, tagIds: string[]): Promise<void> {
  const normalizedTagIds = normalizeTagIds(tagIds);

  await db.execute(sql`
    delete from public.content_asset_tags
    where content_asset_id = ${assetId}
  `);

  if (!normalizedTagIds.length) {
    return;
  }

  await db.execute(sql`
    insert into public.content_asset_tags (content_asset_id, tag_id)
    select ${assetId}, tag_id
    from unnest(${pgUuidArray(normalizedTagIds)}) as tag_id
    on conflict do nothing
  `);
}

async function replaceContentAssetProjectTags(projectId: string, tagIds: string[]): Promise<void> {
  const normalizedTagIds = normalizeTagIds(tagIds);

  await db.execute(sql`
    delete from public.content_asset_project_tags
    where content_asset_project_id = ${projectId}
  `);

  if (!normalizedTagIds.length) {
    return;
  }

  await db.execute(sql`
    insert into public.content_asset_project_tags (content_asset_project_id, tag_id)
    select ${projectId}, tag_id
    from unnest(${pgUuidArray(normalizedTagIds)}) as tag_id
    on conflict do nothing
  `);
}

export async function updateContentAsset(input: UpdateContentAssetInput): Promise<ContentAsset> {
  const normalizedId = String(input.id || '').trim();
  const originalFilename = String(input.originalFilename || '').replace(/\s+/g, ' ').trim();

  if (!normalizedId) {
    throw new Error('Asset id wajib diisi.');
  }

  if (input.originalFilename !== undefined && !originalFilename) {
    throw new Error('Nama asset wajib diisi.');
  }

  const result = await db.execute(sql`
    update public.content_assets
    set
      original_filename = case when ${input.originalFilename !== undefined} then ${originalFilename} else original_filename end,
      notes = ${input.notes || null},
      updated_at = ${new Date().toISOString()}::timestamptz
    where id = ${normalizedId}
    returning id
  `);

  if (!firstRowFromResult<RawRecord>(result)) {
    throw new Error('Asset tidak ditemukan.');
  }

  if (input.tagIds) {
    await replaceContentAssetTags(normalizedId, input.tagIds);
  }

  const asset = await getContentAsset(normalizedId);
  if (!asset) {
    throw new Error('Asset tidak ditemukan.');
  }

  return asset;
}

export async function updateContentAssetProject(input: UpdateContentAssetProjectInput): Promise<ContentAssetProject> {
  const normalizedId = String(input.id || '').trim();
  const projectName = String(input.projectName || '').replace(/\s+/g, ' ').trim();

  if (!normalizedId) {
    throw new Error('Project id wajib diisi.');
  }

  if (!projectName) {
    throw new Error('Nama project wajib diisi.');
  }

  const result = await db.execute(sql`
    update public.content_asset_projects
    set
      project_name = ${projectName},
      notes = ${input.notes || null},
      updated_at = ${new Date().toISOString()}::timestamptz
    where id = ${normalizedId}
    returning id
  `);

  if (!firstRowFromResult<RawRecord>(result)) {
    throw new Error('Project asset tidak ditemukan.');
  }

  await db.execute(sql`
    update public.content_assets
    set project_name = ${projectName}, updated_at = ${new Date().toISOString()}::timestamptz
    where project_id = ${normalizedId}
  `);

  if (input.tagIds) {
    await replaceContentAssetProjectTags(normalizedId, input.tagIds);
  }

  const project = await getContentAssetProject(normalizedId);
  if (!project) {
    throw new Error('Project asset tidak ditemukan.');
  }

  return project;
}

export async function deleteContentAsset(id: string): Promise<void> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Asset id wajib diisi.');
  }

  const asset = await getContentAsset(normalizedId);
  if (!asset) {
    throw new Error('Asset tidak ditemukan.');
  }

  await db.execute(sql`
    delete from public.content_assets
    where id = ${normalizedId}
  `);

  await removeObject(asset.storage_bucket || CONTENT_ASSET_BUCKET, asset.storage_path);
}

export async function deleteContentAssetProject(id: string): Promise<void> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    throw new Error('Project id wajib diisi.');
  }

  const project = await getContentAssetProject(normalizedId);
  if (!project) {
    throw new Error('Project asset tidak ditemukan.');
  }

  const assets = await listContentAssetsByProject(normalizedId);
  const storagePathsByBucket = new Map<string, string[]>();
  assets.forEach((asset) => {
    if (!asset.storage_path) {
      return;
    }
    storagePathsByBucket.set(asset.storage_bucket, [...(storagePathsByBucket.get(asset.storage_bucket) || []), asset.storage_path]);
  });

  await db.execute(sql`
    delete from public.content_assets
    where project_id = ${normalizedId}
  `);
  await db.execute(sql`
    delete from public.content_asset_projects
    where id = ${normalizedId}
  `);

  for (const [bucket, paths] of storagePathsByBucket) {
    await removeObjects(bucket, paths);
  }
}
