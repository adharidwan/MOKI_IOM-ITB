import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { adminAppUsers, adminFeaturePermissions } from '../db/schema';
import type { DatabaseRow } from './types';

export async function upsertAdminAppUserRow(row: typeof adminAppUsers.$inferInsert): Promise<DatabaseRow> {
  const [record] = await db.insert(adminAppUsers)
    .values(row)
    .onConflictDoUpdate({
      target: adminAppUsers.ssoSub,
      set: {
        email: row.email,
        name: row.name,
        roles: row.roles,
        lastSeenAt: row.lastSeenAt,
      },
    })
    .returning();

  if (!record) {
    throw new Error('Failed to upsert admin app user.');
  }

  return record as DatabaseRow;
}

export async function listAdminAppUserRows(): Promise<DatabaseRow[]> {
  return db.select()
    .from(adminAppUsers)
    .orderBy(adminAppUsers.lastSeenAt) as Promise<DatabaseRow[]>;
}

export async function getAdminAppUserRow(ssoSub: string): Promise<DatabaseRow | null> {
  const rows = await db.select()
    .from(adminAppUsers)
    .where(eq(adminAppUsers.ssoSub, ssoSub))
    .limit(1);

  return (rows[0] ?? null) as DatabaseRow | null;
}

export async function listAdminFeaturePermissionRows(ssoSub?: string): Promise<DatabaseRow[]> {
  const query = db.select().from(adminFeaturePermissions);

  if (!ssoSub) {
    return query as Promise<DatabaseRow[]>;
  }

  return query.where(eq(adminFeaturePermissions.ssoSub, ssoSub)) as Promise<DatabaseRow[]>;
}

export async function replaceAdminFeaturePermissions(
  ssoSub: string,
  featureKeys: string[],
  grantedBySub?: string | null,
): Promise<void> {
  await db.delete(adminFeaturePermissions)
    .where(eq(adminFeaturePermissions.ssoSub, ssoSub));

  if (featureKeys.length) {
    await db.insert(adminFeaturePermissions).values(
      featureKeys.map((featureKey) => ({
        ssoSub,
        featureKey,
        grantedBySub: grantedBySub ?? null,
      })),
    );
  }
}
