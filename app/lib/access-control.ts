import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';

import { db } from './db/client';
import { pgTextArray } from './db/pg-array';
import { upsertAdminAppUserRow } from './repositories/access-control';
import { SSO_SESSION_COOKIE } from './sso-config';
import { verifySsoAccessToken, type VerifiedSsoToken } from './sso-server';

export const FEATURE_DEFINITIONS = [
  { key: 'contacts', path: '/contacts', label: 'Contacts', description: 'Direktori kontak dan upload CSV.' },
  { key: 'groups', path: '/group', label: 'Groups', description: 'Kelola grup dan anggota penerima.' },
  { key: 'blast', path: '/blastmessage', label: 'Blast', description: 'Susun dan kirim blast message.' },
  { key: 'ticket', path: '/ticket', label: 'Ticket', description: 'Kelola tiket dan balasan pelanggan.' },
  { key: 'whatsapp', path: '/whatsapp', label: 'WhatsApp', description: 'Pantau instance, QR, runtime, dan antrean outbound WhatsApp.' },
  { key: 'scrape', path: '/scrape', label: 'Import', description: 'Ambil konten dari channel eksternal.' },
  { key: 'content-record', path: '/content-record', label: 'Library', description: 'Kelola arsip konten publikasi.' },
  { key: 'content-assets', path: '/content-assets', label: 'Assets', description: 'Drafting dan manajemen asset image/video konten.' },
] as const;

export type FeatureKey = (typeof FEATURE_DEFINITIONS)[number]['key'];

export interface AccessControlledUser {
  sub: string;
  email: string | null;
  name: string | null;
  roles: string[];
}

export interface ManagedAccessUser extends AccessControlledUser {
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  features: FeatureKey[];
}

export interface AccessControlOverview {
  totalUsers: number;
  adminUsers: number;
  nonAdminUsers: number;
  usersWithAccess: number;
}

export interface PaginatedManagedAccessUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  featureKey?: string;
}

export interface PaginatedManagedAccessUsersResponse {
  items: ManagedAccessUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function extractRoles(payload: VerifiedSsoToken): string[] {
  return Array.isArray(payload.realm_access?.roles)
    ? payload.realm_access.roles.filter((role): role is string => typeof role === 'string')
    : [];
}

function normalizeFeatureKeys(values: string[]): FeatureKey[] {
  const allowed = new Set(FEATURE_DEFINITIONS.map((feature) => feature.key));
  return Array.from(new Set(values.filter((value): value is FeatureKey => allowed.has(value as FeatureKey))));
}

function normalizePage(value: number | undefined): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
}

function normalizePageSize(value: number | undefined): number {
  const pageSize = Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 20;
  return Math.min(Math.max(pageSize, 10), 100);
}

function hasAdminRoleValue(roles: unknown): boolean {
  return Array.isArray(roles) && roles.some((role) => role === 'admin');
}

function mapManagedAccessUser(user: {
  sso_sub: unknown;
  email: unknown;
  name: unknown;
  roles: unknown;
  first_seen_at: unknown;
  last_seen_at: unknown;
}, featuresBySub: Map<string, string[]>): ManagedAccessUser {
  const sub = String(user.sso_sub);

  return {
    sub,
    email: typeof user.email === 'string' ? user.email : null,
    name: typeof user.name === 'string' ? user.name : null,
    roles: Array.isArray(user.roles) ? user.roles.filter((role): role is string => typeof role === 'string') : [],
    firstSeenAt: typeof user.first_seen_at === 'string' ? user.first_seen_at : null,
    lastSeenAt: typeof user.last_seen_at === 'string' ? user.last_seen_at : null,
    features: normalizeFeatureKeys(featuresBySub.get(sub) || []),
  };
}

function rowsFromResult<T>(result: { rows?: unknown[] }): T[] {
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}

function firstRowFromResult<T>(result: { rows?: unknown[] }): T | null {
  return rowsFromResult<T>(result)[0] ?? null;
}

function applyAccessUserSearch<T extends { sso_sub: unknown; email: unknown; name: unknown }>(
  users: T[],
  search: string,
): T[] {
  const term = search.trim().toLowerCase();

  if (!term) {
    return users;
  }

  return users.filter((user) =>
    [user.sso_sub, user.email, user.name].some((value) => String(value || '').toLowerCase().includes(term)),
  );
}

function toUser(payload: VerifiedSsoToken): AccessControlledUser {
  if (!payload.sub) {
    throw new Error('Token SSO tidak memiliki subject.');
  }

  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    name:
      typeof payload.name === 'string'
        ? payload.name
        : typeof payload.preferred_username === 'string'
          ? payload.preferred_username
          : null,
    roles: extractRoles(payload),
  };
}

export function isAdminRole(roles: string[]): boolean {
  return roles.includes('admin');
}

export async function getCurrentUserFromToken(token: string): Promise<AccessControlledUser> {
  return toUser(await verifySsoAccessToken(token));
}

export async function getCurrentUserFromRequest(request: Request): Promise<AccessControlledUser> {
  if (process.env.NEXT_PUBLIC_DISABLE_SSO === 'true') {
    return {
      sub: 'local-dev',
      email: 'dev@local',
      name: 'Local Developer',
      roles: ['admin'],
    };
  }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : request.headers
        .get('cookie')
        ?.split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(`${SSO_SESSION_COOKIE}=`))
        ?.slice(SSO_SESSION_COOKIE.length + 1);

  if (!token) {
    throw new Error('Sesi SSO tidak tersedia.');
  }

  return getCurrentUserFromToken(decodeURIComponent(token));
}

export async function getCurrentUserFromCookies(): Promise<AccessControlledUser> {
  if (process.env.NEXT_PUBLIC_DISABLE_SSO === 'true') {
    return {
      sub: 'local-dev',
      email: 'dev@local',
      name: 'Local Developer',
      roles: ['admin'],
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SSO_SESSION_COOKIE)?.value;

  if (!token) {
    redirect('/sso/login');
  }

  return getCurrentUserFromToken(token);
}

export async function upsertManagedUser(user: AccessControlledUser): Promise<void> {
  await upsertAdminAppUserRow({
    ssoSub: user.sub,
    email: user.email,
    name: user.name,
    roles: user.roles,
    lastSeenAt: new Date().toISOString(),
  });
}

export async function getGrantedFeaturesForUser(user: AccessControlledUser): Promise<FeatureKey[]> {
  if (isAdminRole(user.roles)) {
    return FEATURE_DEFINITIONS.map((feature) => feature.key);
  }

  const result = await db.execute(sql`
    select feature_key
    from public.admin_feature_permissions
    where sso_sub = ${user.sub}
  `);

  return normalizeFeatureKeys(rowsFromResult<{ feature_key: unknown }>(result).map((row) => String(row.feature_key)));
}

export async function hasFeatureAccess(user: AccessControlledUser, featureKey: FeatureKey): Promise<boolean> {
  if (isAdminRole(user.roles)) {
    return true;
  }

  const features = await getGrantedFeaturesForUser(user);
  return features.includes(featureKey);
}

export async function hasAnyFeatureAccess(user: AccessControlledUser, featureKeys: FeatureKey[]): Promise<boolean> {
  if (isAdminRole(user.roles)) {
    return true;
  }

  const features = await getGrantedFeaturesForUser(user);
  return featureKeys.some((featureKey) => features.includes(featureKey));
}

export async function requireFeatureAccess(featureKey: FeatureKey): Promise<AccessControlledUser> {
  const user = await getCurrentUserFromCookies();
  const allowed = await hasFeatureAccess(user, featureKey);

  if (!allowed) {
    redirect('/access-denied');
  }

  return user;
}

export async function requireAnyFeatureFromRequest(
  request: Request,
  featureKeys: FeatureKey[],
): Promise<AccessControlledUser> {
  const user = await getCurrentUserFromRequest(request);
  const allowed = await hasAnyFeatureAccess(user, featureKeys);

  if (!allowed) {
    throw new Error('Akun ini belum memiliki akses ke fitur yang diminta.');
  }

  return user;
}

export async function requireAdminFromRequest(request: Request): Promise<AccessControlledUser> {
  const user = await getCurrentUserFromRequest(request);

  if (!isAdminRole(user.roles)) {
    throw new Error('Hanya admin yang dapat mengatur akses akun.');
  }

  return user;
}

export async function requireAdminAccess(): Promise<AccessControlledUser> {
  const user = await getCurrentUserFromCookies();

  if (!isAdminRole(user.roles)) {
    redirect('/access-denied');
  }

  return user;
}

export async function listManagedAccessUsers(): Promise<ManagedAccessUser[]> {
  const [usersResult, permissionsResult] = await Promise.all([
    db.execute(sql`
      select sso_sub, email, name, roles, first_seen_at::text, last_seen_at::text
      from public.admin_app_users
      order by last_seen_at desc
    `),
    db.execute(sql`select sso_sub, feature_key from public.admin_feature_permissions`),
  ]);

  const featuresBySub = new Map<string, string[]>();
  rowsFromResult<{ sso_sub: unknown; feature_key: unknown }>(permissionsResult).forEach((permission) => {
    const key = String(permission.sso_sub);
    featuresBySub.set(key, [...(featuresBySub.get(key) || []), String(permission.feature_key)]);
  });

  return rowsFromResult<Parameters<typeof mapManagedAccessUser>[0]>(usersResult).map((user) => mapManagedAccessUser(user, featuresBySub));
}

export async function getAccessControlOverview(): Promise<AccessControlOverview> {
  const users = await listManagedAccessUsers();

  return {
    totalUsers: users.length,
    adminUsers: users.filter((user) => isAdminRole(user.roles)).length,
    nonAdminUsers: users.filter((user) => !isAdminRole(user.roles)).length,
    usersWithAccess: users.filter((user) => isAdminRole(user.roles) || user.features.length > 0).length,
  };
}

export async function getManagedAccessUser(ssoSub: string): Promise<ManagedAccessUser | null> {
  const [userResult, permissionsResult] = await Promise.all([
    db.execute(sql`
      select sso_sub, email, name, roles, first_seen_at::text, last_seen_at::text
      from public.admin_app_users
      where sso_sub = ${ssoSub}
      limit 1
    `),
    db.execute(sql`
      select sso_sub, feature_key
      from public.admin_feature_permissions
      where sso_sub = ${ssoSub}
    `),
  ]);

  const user = firstRowFromResult<Parameters<typeof mapManagedAccessUser>[0]>(userResult);

  if (!user) {
    return null;
  }

  const featuresBySub = new Map<string, string[]>();
  rowsFromResult<{ sso_sub: unknown; feature_key: unknown }>(permissionsResult).forEach((permission) => {
    const key = String(permission.sso_sub);
    featuresBySub.set(key, [...(featuresBySub.get(key) || []), String(permission.feature_key)]);
  });

  return mapManagedAccessUser(user, featuresBySub);
}

export async function getPaginatedManagedAccessUsers({
  page,
  pageSize,
  search = '',
  featureKey = '',
}: PaginatedManagedAccessUsersParams): Promise<PaginatedManagedAccessUsersResponse> {
  const normalizedPage = normalizePage(page);
  const normalizedPageSize = normalizePageSize(pageSize);
  const normalizedFeatureKey = normalizeFeatureKeys(featureKey ? [featureKey] : [])[0] || '';
  const permissionsResult = await db.execute(sql`
    select sso_sub, feature_key
    from public.admin_feature_permissions
  `);

  const featuresBySub = new Map<string, string[]>();
  rowsFromResult<{ sso_sub: unknown; feature_key: unknown }>(permissionsResult).forEach((permission) => {
    const key = String(permission.sso_sub);
    featuresBySub.set(key, [...(featuresBySub.get(key) || []), String(permission.feature_key)]);
  });

  if (!normalizedFeatureKey && !search.trim()) {
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const usersResult = await db.execute(sql`
      select
        sso_sub,
        email,
        name,
        roles,
        first_seen_at::text,
        last_seen_at::text,
        count(*) over()::integer as total_count
      from public.admin_app_users
      order by last_seen_at desc
      limit ${normalizedPageSize}
      offset ${offset}
    `);

    const users = rowsFromResult<Parameters<typeof mapManagedAccessUser>[0] & { total_count: unknown }>(usersResult);
    const total = Number(users[0]?.total_count || 0);
    const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));

    return {
      items: users.map((user) => mapManagedAccessUser(user, featuresBySub)),
      total,
      page: Math.min(normalizedPage, totalPages),
      pageSize: normalizedPageSize,
      totalPages,
    };
  }

  const usersResult = await db.execute(sql`
    select sso_sub, email, name, roles, first_seen_at::text, last_seen_at::text
    from public.admin_app_users
    order by last_seen_at desc
  `);
  const users = rowsFromResult<Parameters<typeof mapManagedAccessUser>[0]>(usersResult);

  const filteredUsers = applyAccessUserSearch(users, search).filter((user) => {
    if (!normalizedFeatureKey) {
      return true;
    }

    const sub = String(user.sso_sub);
    return hasAdminRoleValue(user.roles) || normalizeFeatureKeys(featuresBySub.get(sub) || []).includes(normalizedFeatureKey);
  });
  const total = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const safePage = Math.min(normalizedPage, totalPages);

  return {
    items: filteredUsers
      .slice((safePage - 1) * normalizedPageSize, safePage * normalizedPageSize)
      .map((user) => mapManagedAccessUser(user, featuresBySub)),
    total,
    page: safePage,
    pageSize: normalizedPageSize,
    totalPages,
  };
}

export async function replaceUserFeatureAccess(
  targetSub: string,
  featureKeys: string[],
  actorSub: string,
): Promise<FeatureKey[]> {
  const normalizedFeatureKeys = normalizeFeatureKeys(featureKeys);
  await db.execute(sql`
    delete from public.admin_feature_permissions
    where sso_sub = ${targetSub}
  `);

  if (!normalizedFeatureKeys.length) {
    return [];
  }

  await db.execute(sql`
    insert into public.admin_feature_permissions (sso_sub, feature_key, granted_by_sub)
    select ${targetSub}, feature_key, ${actorSub}
    from unnest(${pgTextArray(normalizedFeatureKeys)}) as feature_key
  `);

  return normalizedFeatureKeys;
}
