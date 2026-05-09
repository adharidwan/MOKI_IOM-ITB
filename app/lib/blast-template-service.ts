import 'server-only';

import { getSupabaseAdminClient } from './supabase-server';

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

export async function listBlastTemplates(input: ListBlastTemplatesInput = {}): Promise<ListBlastTemplatesResult> {
  const supabase = getSupabaseAdminClient();
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(100, Math.max(5, Number(input.pageSize || 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = String(input.search || '').trim();
  let query = supabase
    .from('blast_message_templates')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (search) {
    const escapedSearch = search.replace(/[%_]/g, (value) => `\\${value}`);
    query = query.or(`title.ilike.%${escapedSearch}%,description.ilike.%${escapedSearch}%,content.ilike.%${escapedSearch}%`);
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Gagal memuat template blast: ${error.message}`);
  }

  const total = count || 0;
  return {
    items: ((data || []) as BlastTemplateRecord[]).map(toSummary),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createBlastTemplate(input: SaveBlastTemplateInput): Promise<BlastTemplateSummary> {
  validateTemplateInput(input);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('blast_message_templates')
    .insert({
      title: String(input.title || '').trim(),
      description: String(input.description || '').trim(),
      content: String(input.content || '').trim(),
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan template blast: ${error.message}`);
  }

  return toSummary(data as BlastTemplateRecord);
}

export async function updateBlastTemplate(id: string, input: SaveBlastTemplateInput): Promise<BlastTemplateSummary> {
  validateTemplateInput(input, true);
  const supabase = getSupabaseAdminClient();
  const changes: Record<string, string> = { updated_at: new Date().toISOString() };

  if (input.title !== undefined) changes.title = String(input.title).trim();
  if (input.description !== undefined) changes.description = String(input.description).trim();
  if (input.content !== undefined) changes.content = String(input.content).trim();

  const { data, error } = await supabase
    .from('blast_message_templates')
    .update(changes)
    .eq('id', id)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Gagal memperbarui template blast: ${error.message}`);
  }

  return toSummary(data as BlastTemplateRecord);
}

export async function deleteBlastTemplate(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('blast_message_templates')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw new Error(`Gagal menghapus template blast: ${error.message}`);
  }
}
