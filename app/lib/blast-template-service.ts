import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from './db/client';

const MAX_TEMPLATE_TITLE_LENGTH = 120;
const MAX_TEMPLATE_DESCRIPTION_LENGTH = 240;
const MAX_TEMPLATE_CONTENT_LENGTH = 4096;

interface BlastTemplateRecord {
  id: string;
  title: string;
  description: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BlastTemplateSummary {
  id: string;
  title: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListBlastTemplatesInput {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface ListBlastTemplatesResult {
  items: BlastTemplateSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SaveBlastTemplateInput {
  title?: string;
  description?: string;
  content?: string;
}

function toSummary(record: BlastTemplateRecord): BlastTemplateSummary {
  return {
    id: record.id,
    title: record.title,
    description: record.description || '',
    content: record.content,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function validateTemplateInput(input: SaveBlastTemplateInput, partial = false): void {
  if (!partial || input.title !== undefined) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Judul template wajib diisi.');
    if (title.length > MAX_TEMPLATE_TITLE_LENGTH) throw new Error(`Judul template maksimal ${MAX_TEMPLATE_TITLE_LENGTH} karakter.`);
  }

  if (input.description !== undefined) {
    const description = String(input.description || '').trim();
    if (description.length > MAX_TEMPLATE_DESCRIPTION_LENGTH) throw new Error(`Deskripsi template maksimal ${MAX_TEMPLATE_DESCRIPTION_LENGTH} karakter.`);
  }

  if (!partial || input.content !== undefined) {
    const content = String(input.content || '').trim();
    if (!content) throw new Error('Konten template wajib diisi.');
    if (content.length > MAX_TEMPLATE_CONTENT_LENGTH) throw new Error(`Konten template maksimal ${MAX_TEMPLATE_CONTENT_LENGTH} karakter.`);
  }
}

function rowsFromResult<T>(result: { rows?: unknown[] }): T[] {
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}

function firstRowFromResult<T>(result: { rows?: unknown[] }): T | null {
  return rowsFromResult<T>(result)[0] ?? null;
}

export async function listBlastTemplates(input: ListBlastTemplatesInput = {}): Promise<ListBlastTemplatesResult> {
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(100, Math.max(5, Number(input.pageSize || 10)));
  const offset = (page - 1) * pageSize;
  const search = String(input.search || '').trim();
  const result = await db.execute(sql`
    select *, count(*) over ()::integer as total_count
    from public.blast_message_templates
    where deleted_at is null
      and (${search || null}::text is null or title ilike ${`%${search}%`} or description ilike ${`%${search}%`} or content ilike ${`%${search}%`})
    order by updated_at desc
    limit ${pageSize}
    offset ${offset}
  `);
  const rows = rowsFromResult<BlastTemplateRecord & { total_count?: number }>(result);
  const total = Number(rows[0]?.total_count || 0);
  return {
    items: rows.map(toSummary),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createBlastTemplate(input: SaveBlastTemplateInput): Promise<BlastTemplateSummary> {
  validateTemplateInput(input);
  const now = new Date().toISOString();
  const result = await db.execute(sql`
    insert into public.blast_message_templates (title, description, content, created_at, updated_at)
    values (${String(input.title || '').trim()}, ${String(input.description || '').trim()}, ${String(input.content || '').trim()}, ${now}, ${now})
    returning *
  `);

  return toSummary(firstRowFromResult<BlastTemplateRecord>(result)!);
}

export async function updateBlastTemplate(id: string, input: SaveBlastTemplateInput): Promise<BlastTemplateSummary> {
  validateTemplateInput(input, true);
  const currentResult = await db.execute(sql`
    select *
    from public.blast_message_templates
    where id = ${id}
      and deleted_at is null
    limit 1
  `);
  const current = firstRowFromResult<BlastTemplateRecord>(currentResult);
  if (!current) {
    throw new Error('Template blast tidak ditemukan.');
  }
  const result = await db.execute(sql`
    update public.blast_message_templates
    set
      title = ${input.title !== undefined ? String(input.title).trim() : current.title},
      description = ${input.description !== undefined ? String(input.description).trim() : current.description || ''},
      content = ${input.content !== undefined ? String(input.content).trim() : current.content},
      updated_at = ${new Date().toISOString()}
    where id = ${id}
    returning *
  `);

  return toSummary(firstRowFromResult<BlastTemplateRecord>(result)!);
}

export async function deleteBlastTemplate(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(sql`
    update public.blast_message_templates
    set deleted_at = ${now}, updated_at = ${now}
    where id = ${id}
  `);
}
