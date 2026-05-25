import { type SQL, sql } from 'drizzle-orm';

function pgArray(values: readonly string[] | null | undefined, type: 'text' | 'uuid'): SQL {
  if (values == null) {
    return sql.raw(`null::${type}[]`);
  }

  if (!values.length) {
    return sql.raw(`array[]::${type}[]`);
  }

  return sql`array[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::${sql.raw(type)}[]`;
}

export function pgTextArray(values: readonly string[] | null | undefined): SQL {
  return pgArray(values, 'text');
}

export function pgUuidArray(values: readonly string[] | null | undefined): SQL {
  return pgArray(values, 'uuid');
}
