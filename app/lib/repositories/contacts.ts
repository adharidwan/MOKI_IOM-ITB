import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { pgTextArray, pgUuidArray } from '../db/pg-array';
import { csvContacts } from '../db/schema';
import { rowsFromResult, type DatabaseRow, type SortDirection } from './types';

export type CsvContactSortKey = 'imported_at' | 'nama' | 'no_telp' | 'status';

export interface CsvContactInputRecord {
  no_telp: string;
  nama: string;
  jenis_kelamin: string;
  jabatan?: string | null;
  group_names?: string[];
  source_file?: string | null;
  imported_at?: string;
}

export interface ListCsvContactsQuery {
  search: string | null;
  groupName: string | null;
  page: number;
  pageSize: number;
  sortBy: CsvContactSortKey;
  sortDir: SortDirection;
}

export async function getCsvContactRowsByPhoneNumbers(phoneNumbers: string[]): Promise<DatabaseRow[]> {
  if (!phoneNumbers.length) {
    return [];
  }

  const result = await db.execute(sql`
    select *
    from public.csv_contacts
    where no_telp = any(${pgTextArray(phoneNumbers)})
  `);

  return rowsFromResult(result);
}

export async function upsertCsvContactRows(rows: CsvContactInputRecord[]): Promise<number> {
  if (!rows.length) {
    return 0;
  }

  await db.insert(csvContacts)
    .values(rows.map((row) => ({
      noTelp: row.no_telp,
      nama: row.nama,
      jenisKelamin: row.jenis_kelamin,
      jabatan: row.jabatan ?? null,
      groupNames: row.group_names ?? [],
      sourceFile: row.source_file ?? null,
      importedAt: row.imported_at,
    })))
    .onConflictDoUpdate({
      target: csvContacts.noTelp,
      set: {
        nama: sql`excluded.nama`,
        jenisKelamin: sql`excluded.jenis_kelamin`,
        jabatan: sql`excluded.jabatan`,
        groupNames: sql`excluded.group_names`,
        sourceFile: sql`excluded.source_file`,
        importedAt: sql`excluded.imported_at`,
      },
    });

  return rows.length;
}

export async function listCsvContactRows(): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select *
    from public.csv_contacts
    order by created_at desc
  `);

  return rowsFromResult(result);
}

export async function listPaginatedCsvContactRows(query: ListCsvContactsQuery): Promise<DatabaseRow[]> {
  const result = await db.execute(sql`
    select *
    from public.list_csv_contacts(
      ${query.search},
      ${query.groupName},
      ${query.page},
      ${query.pageSize},
      ${query.sortBy},
      ${query.sortDir}
    )
  `);

  return rowsFromResult(result);
}

export async function countCsvContacts(): Promise<number> {
  const result = await db.execute(sql`
    select count(*)::integer as count
    from public.csv_contacts
  `);

  return Number(rowsFromResult(result)[0]?.count || 0);
}

export async function countUngroupedCsvContacts(): Promise<number> {
  const result = await db.execute(sql`
    select count(*)::integer as count
    from public.csv_contacts
    where group_names = '{}'::text[]
  `);

  return Number(rowsFromResult(result)[0]?.count || 0);
}

export async function upsertSingleCsvContactRow(row: CsvContactInputRecord): Promise<DatabaseRow> {
  const result = await db.execute(sql`
    insert into public.csv_contacts (
      no_telp,
      nama,
      jenis_kelamin,
      jabatan,
      group_names,
      imported_at
    )
    values (
      ${row.no_telp},
      ${row.nama},
      ${row.jenis_kelamin},
      ${row.jabatan ?? null},
      ${pgTextArray(row.group_names ?? [])},
      ${row.imported_at}
    )
    on conflict (no_telp) do update
    set
      nama = excluded.nama,
      jenis_kelamin = excluded.jenis_kelamin,
      jabatan = excluded.jabatan,
      group_names = excluded.group_names,
      imported_at = excluded.imported_at
    returning *
  `);
  const record = rowsFromResult(result)[0];

  if (!record) {
    throw new Error('Failed to upsert CSV contact.');
  }

  return record as DatabaseRow;
}

export async function updateCsvContactRow(id: string, row: CsvContactInputRecord): Promise<DatabaseRow> {
  const result = await db.execute(sql`
    update public.csv_contacts
    set
      no_telp = ${row.no_telp},
      nama = ${row.nama},
      jenis_kelamin = ${row.jenis_kelamin},
      jabatan = ${row.jabatan ?? null},
      group_names = ${pgTextArray(row.group_names ?? [])}
    where id = ${id}
    returning *
  `);
  const record = rowsFromResult(result)[0];

  if (!record) {
    throw new Error('CSV contact not found.');
  }

  return record as DatabaseRow;
}

export async function addCsvContactGroups(contactIds: string[], groupNames: string[]): Promise<number> {
  const result = await db.execute(sql`
    select public.add_csv_contact_groups(${pgUuidArray(contactIds)}, ${pgTextArray(groupNames)}) as count
  `);

  return Number(rowsFromResult(result)[0]?.count || 0);
}

export async function deleteCsvContactRow(id: string): Promise<void> {
  await db.delete(csvContacts).where(eq(csvContacts.id, id));
}
