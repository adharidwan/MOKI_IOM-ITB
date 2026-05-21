import 'server-only';

import type { CsvContactInput } from './api';
import {
  listContactGroupRows,
  listGroupMemberRows,
  resolveGroupRecipientRows,
  resolveGroupRecipientRowsFromContacts,
} from './repositories';
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

function normalizeGroupNames(values: string[]): string[] {
  const byKey = new Map<string, string>();

  values.forEach((value) => {
    const groupName = String(value || '').trim();
    if (groupName) {
      byKey.set(groupName.toLowerCase(), groupName);
    }
  });

  return Array.from(byKey.values());
}

function toGroupNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((groupName): groupName is string => typeof groupName === 'string')
    : [];
}

async function resolveGroupRecipientsFromContacts(
  groupNames: string[],
  limit: number | null,
): Promise<{ rows: CsvContact[]; total: number }> {
  const fallback = await resolveGroupRecipientRowsFromContacts(groupNames, limit);

  return {
    rows: fallback.rows.map((row) => toCsvContact(row)),
    total: fallback.total,
  };
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
  const rows = await listContactGroupRows({
    search: search.trim() || null,
    page: safePage,
    pageSize: safePageSize,
    sortBy: normalizedSortBy === 'name' ? 'group_name' : 'member_count',
    sortDir: normalizedSortDir,
  });

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
  const rows = await listGroupMemberRows({
    groupName,
    search: search.trim() || null,
    page: safePage,
    pageSize: safePageSize,
    sortBy: normalizedSortBy,
    sortDir: normalizedSortDir,
  });

  const total = Number(rows[0]?.total_count || 0);

  return {
    items: rows.map((row) => toCsvContact(row)),
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
  const normalizedGroupNames = normalizeGroupNames(groupNames);

  if (!normalizedGroupNames.length) {
    return { totalRecipients: 0, previewRecipients: [] };
  }

  try {
    const rows = await resolveGroupRecipientRows(normalizedGroupNames, 6, 'nama');
    return {
      totalRecipients: Number(rows[0]?.total_count || 0),
      previewRecipients: rows.map((row) => ({
        id: String(row.id || ''),
        no_telp: String(row.no_telp || ''),
        nama: String(row.nama || ''),
        group_names: toGroupNames(row.group_names),
      })),
    };
  } catch {
    const fallback = await resolveGroupRecipientsFromContacts(normalizedGroupNames, 6);

    return {
      totalRecipients: fallback.total,
      previewRecipients: fallback.rows.map((row) => ({
        id: row.id,
        no_telp: row.no_telp,
        nama: row.nama,
        group_names: row.group_names,
      })),
    };
  }
}

export async function resolveAllGroupRecipients(groupNames: string[]): Promise<CsvContactInput[]> {
  const normalizedGroupNames = normalizeGroupNames(groupNames);

  if (!normalizedGroupNames.length) {
    return [];
  }

  try {
    const rows = await resolveGroupRecipientRows(normalizedGroupNames, null, 'created_at');
    return rows.map((row) => ({
      no_telp: String(row.no_telp || ''),
      nama: String(row.nama || ''),
      jenis_kelamin: String(row.jenis_kelamin || ''),
      jabatan: row.jabatan === null || row.jabatan === undefined ? undefined : String(row.jabatan),
      group_names: toGroupNames(row.group_names),
    }));
  } catch {
    const fallback = await resolveGroupRecipientsFromContacts(normalizedGroupNames, null);

    return fallback.rows.map((row) => ({
      no_telp: row.no_telp,
      nama: row.nama,
      jenis_kelamin: row.jenis_kelamin,
      jabatan: row.jabatan || undefined,
      group_names: row.group_names,
    }));
  }
}
