export type DatabaseRow = Record<string, unknown>;

export type SortDirection = 'asc' | 'desc';

export function rowsFromResult(result: { rows?: unknown[] }): DatabaseRow[] {
  return (Array.isArray(result.rows) ? result.rows : []) as DatabaseRow[];
}

export function firstRowFromResult(result: { rows?: unknown[] }): DatabaseRow | null {
  return rowsFromResult(result)[0] ?? null;
}
