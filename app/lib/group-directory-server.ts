import 'server-only';

import type { CsvContactInput } from './api';
import { getSupabaseAdminClient } from './supabase-server';
import type { CsvContact } from './types';

export type SortDirection = 'asc' | 'desc';
export type GroupSortKey = 'name' | 'memberCount';
export type GroupMemberSortKey = 'nama' | 'no_telp' | 'jenis_kelamin';

const DEFAULT_GROUP_SORT_BY: GroupSortKey = 'memberCount';
const DEFAULT_GROUP_SORT_DIR: SortDirection = 'desc';
const DEFAULT_GROUP_MEMBER_SORT_BY: GroupMemberSortKey = 'nama';
const DEFAULT_GROUP_MEMBER_SORT_DIR: SortDirection = 'asc';

export interface PaginatedContactGroupsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: GroupSortKey;
  sortDir?: SortDirection;
}

export interface PaginatedContactGroupsResponse {
  items: Array<{
    name: string;
    memberCount: number;
    previewNames: string[];
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedGroupMembersParams {
  groupName: string;
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: GroupMemberSortKey;
  sortDir?: SortDirection;
}

export interface PaginatedGroupMembersResponse {
  items: CsvContact[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function toCsvContact(record: Record<string, unknown>): CsvContact {
  return {
    id: String(record.id || ''),
    no_telp: String(record.no_telp || ''),
    nama: String(record.nama || ''),
    jenis_kelamin: String(record.jenis_kelamin || ''),
    jabatan: record.jabatan === null || record.jabatan === undefined ? null : String(record.jabatan),
    group_names: Array.isArray(record.group_names)
      ? record.group_names.filter((value): value is string => typeof value === 'string')
      : [],
    source_file: record.source_file === null || record.source_file === undefined ? null : String(record.source_file),
    imported_at: String(record.imported_at || ''),
    created_at: String(record.created_at || ''),
  };
}

function normalizeSortDirection(sortDir: string | undefined, fallback: SortDirection): SortDirection {
  return sortDir === 'asc' || sortDir === 'desc' ? sortDir : fallback;
}

function normalizeGroupSortKey(sortBy: string | undefined): GroupSortKey {
  return sortBy === 'name' || sortBy === 'memberCount' ? sortBy : DEFAULT_GROUP_SORT_BY;
}

function normalizeGroupMemberSortKey(sortBy: string | undefined): GroupMemberSortKey {
  return sortBy === 'nama' || sortBy === 'no_telp' || sortBy === 'jenis_kelamin'
    ? sortBy
    : DEFAULT_GROUP_MEMBER_SORT_BY;
}

export async function getPaginatedContactGroups({
  page = 1,
  pageSize = 20,
  search = '',
  sortBy = DEFAULT_GROUP_SORT_BY,
  sortDir = DEFAULT_GROUP_SORT_DIR,
}: PaginatedContactGroupsParams): Promise<PaginatedContactGroupsResponse> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const normalizedSortBy = normalizeGroupSortKey(sortBy);
  const normalizedSortDir = normalizeSortDirection(sortDir, DEFAULT_GROUP_SORT_DIR);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('list_csv_contact_groups', {
    p_search: search.trim() || null,
    p_page: safePage,
    p_page_size: safePageSize,
    p_sort_by: normalizedSortBy === 'name' ? 'group_name' : 'member_count',
    p_sort_dir: normalizedSortDir,
  });

  if (error) {
    throw new Error(`Failed to fetch paginated groups: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const total = Number(rows[0]?.total_count || 0);

  return {
    items: rows.map((row) => ({
      name: String(row.group_name || ''),
      memberCount: Number(row.member_count || 0),
      previewNames: Array.isArray(row.preview_names)
        ? row.preview_names.filter((value: unknown): value is string => typeof value === 'string')
        : [],
    })),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function getPaginatedGroupMembers({
  groupName,
  page = 1,
  pageSize = 20,
  search = '',
  sortBy = DEFAULT_GROUP_MEMBER_SORT_BY,
  sortDir = DEFAULT_GROUP_MEMBER_SORT_DIR,
}: PaginatedGroupMembersParams): Promise<PaginatedGroupMembersResponse> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const normalizedSortBy = normalizeGroupMemberSortKey(sortBy);
  const normalizedSortDir = normalizeSortDirection(sortDir, DEFAULT_GROUP_MEMBER_SORT_DIR);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('list_csv_contact_group_members', {
    p_group_name: groupName,
    p_search: search.trim() || null,
    p_page: safePage,
    p_page_size: safePageSize,
    p_sort_by: normalizedSortBy,
    p_sort_dir: normalizedSortDir,
  });

  if (error) {
    throw new Error(`Failed to fetch group members: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const total = Number(rows[0]?.total_count || 0);

  return {
    items: rows.map((row) => toCsvContact(row as Record<string, unknown>)),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function resolveGroupRecipientsPreview(groupNames: string[]): Promise<{
  totalRecipients: number;
  previewRecipients: Array<Pick<CsvContact, 'id' | 'no_telp' | 'nama' | 'group_names'>>;
}> {
  const normalizedGroupNames = Array.from(
    new Set(groupNames.map((groupName) => String(groupName || '').trim()).filter(Boolean)),
  );

  if (!normalizedGroupNames.length) {
    return { totalRecipients: 0, previewRecipients: [] };
  }

  const supabase = getSupabaseAdminClient();
  const { data, error, count } = await supabase
    .from('csv_contacts')
    .select('id, no_telp, nama, group_names', { count: 'exact' })
    .overlaps('group_names', normalizedGroupNames)
    .order('nama', { ascending: true })
    .limit(6);

  if (error) {
    throw new Error(`Failed to resolve group preview recipients: ${error.message}`);
  }

  return {
    totalRecipients: count || 0,
    previewRecipients: (Array.isArray(data) ? data : []).map((row) => ({
      id: String(row.id || ''),
      no_telp: String(row.no_telp || ''),
      nama: String(row.nama || ''),
      group_names: Array.isArray(row.group_names)
        ? row.group_names.filter((value): value is string => typeof value === 'string')
        : [],
    })),
  };
}

export async function resolveAllGroupRecipients(groupNames: string[]): Promise<CsvContactInput[]> {
  const normalizedGroupNames = Array.from(
    new Set(groupNames.map((groupName) => String(groupName || '').trim()).filter(Boolean)),
  );

  if (!normalizedGroupNames.length) {
    return [];
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('csv_contacts')
    .select('no_telp, nama, jenis_kelamin, jabatan, group_names')
    .overlaps('group_names', normalizedGroupNames)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to resolve group recipients: ${error.message}`);
  }

  return (Array.isArray(data) ? data : []).map((row) => ({
    no_telp: String(row.no_telp || ''),
    nama: String(row.nama || ''),
    jenis_kelamin: String(row.jenis_kelamin || ''),
    jabatan: row.jabatan === null || row.jabatan === undefined ? undefined : String(row.jabatan),
    group_names: Array.isArray(row.group_names)
      ? row.group_names.filter((value): value is string => typeof value === 'string')
      : [],
  }));
}
