import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '../db/client';
import { pgTextArray } from '../db/pg-array';
import { rowsFromResult, type DatabaseRow, type SortDirection } from './types';

export type GroupSortKey = 'group_name' | 'member_count';
export type GroupMemberSortKey = 'nama' | 'no_telp' | 'jenis_kelamin';

export interface ListContactGroupsQuery {
  search: string | null;
  page: number;
  pageSize: number;
  sortBy: GroupSortKey;
  sortDir: SortDirection;
}

export interface ListGroupMembersQuery {
  groupName: string;
  search: string | null;
  page: number;
  pageSize: number;
  sortBy: GroupMemberSortKey;
  sortDir: SortDirection;
}

export async function listContactGroupRows(query: ListContactGroupsQuery): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select *
    from public.list_csv_contact_groups(
      ${query.search},
      ${query.page},
      ${query.pageSize},
      ${query.sortBy},
      ${query.sortDir}
    )
  `);

  return rowsFromResult(result);
}

export async function listGroupMemberRows(query: ListGroupMembersQuery): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select *
    from public.list_csv_contact_group_members(
      ${query.groupName},
      ${query.search},
      ${query.page},
      ${query.pageSize},
      ${query.sortBy},
      ${query.sortDir}
    )
  `);

  return rowsFromResult(result);
}

export async function resolveGroupRecipientRows(
  groupNames: string[],
  limit: number | null,
  sortBy: 'nama' | 'created_at',
): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select *
    from public.resolve_csv_contact_group_recipients(
      ${pgTextArray(groupNames)},
      ${limit},
      ${sortBy}
    )
  `);

  return rowsFromResult(result);
}

export async function resolveGroupRecipientRowsFromContacts(
  groupNames: string[],
  limit: number | null,
): Promise<{ rows: DatabaseRow[]; total: number }> {
  const result = await db.execute(sql`
    select
      id,
      no_telp,
      nama,
      jenis_kelamin,
      jabatan,
      group_names,
      source_file,
      imported_at,
      created_at,
      count(*) over ()::integer as total_count
    from public.csv_contacts
    where group_names && ${pgTextArray(groupNames)}
    order by nama asc
    ${limit === null ? sql`` : sql`limit ${limit}`}
  `);
  const rows = rowsFromResult(result);

  return {
    rows,
    total: Number(rows[0]?.total_count || 0),
  };
}
