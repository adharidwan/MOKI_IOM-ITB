import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSupabaseAdminClient } from './supabase-server';
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

function extractRoles(payload: VerifiedSsoToken): string[] {
  return Array.isArray(payload.realm_access?.roles)
    ? payload.realm_access.roles.filter((role): role is string => typeof role === 'string')
    : [];
}

function normalizeFeatureKeys(values: string[]): FeatureKey[] {
  const allowed = new Set(FEATURE_DEFINITIONS.map((feature) => feature.key));
  return Array.from(new Set(values.filter((value): value is FeatureKey => allowed.has(value as FeatureKey))));
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
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('admin_app_users')
    .upsert(
      {
        sso_sub: user.sub,
        email: user.email,
        name: user.name,
        roles: user.roles,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'sso_sub' },
    );

  if (error) {
    throw new Error(`Gagal menyimpan akun SSO: ${error.message}`);
  }
}

export async function getGrantedFeaturesForUser(user: AccessControlledUser): Promise<FeatureKey[]> {
  if (isAdminRole(user.roles)) {
    return FEATURE_DEFINITIONS.map((feature) => feature.key);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('admin_feature_permissions')
    .select('feature_key')
    .eq('sso_sub', user.sub);

  if (error) {
    throw new Error(`Gagal memuat akses fitur: ${error.message}`);
  }

  return normalizeFeatureKeys((data || []).map((row) => String(row.feature_key)));
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
  const supabase = getSupabaseAdminClient();
  const [{ data: users, error: usersError }, { data: permissions, error: permissionsError }] = await Promise.all([
    supabase.from('admin_app_users').select('sso_sub,email,name,roles,first_seen_at,last_seen_at').order('last_seen_at', { ascending: false }),
    supabase.from('admin_feature_permissions').select('sso_sub,feature_key'),
  ]);

  if (usersError) {
    throw new Error(`Gagal memuat akun: ${usersError.message}`);
  }

  if (permissionsError) {
    throw new Error(`Gagal memuat permission: ${permissionsError.message}`);
  }

  const featuresBySub = new Map<string, string[]>();
  (permissions || []).forEach((permission) => {
    const key = String(permission.sso_sub);
    featuresBySub.set(key, [...(featuresBySub.get(key) || []), String(permission.feature_key)]);
  });

  return (users || []).map((user) => ({
    sub: String(user.sso_sub),
    email: typeof user.email === 'string' ? user.email : null,
    name: typeof user.name === 'string' ? user.name : null,
    roles: Array.isArray(user.roles) ? user.roles.filter((role): role is string => typeof role === 'string') : [],
    firstSeenAt: typeof user.first_seen_at === 'string' ? user.first_seen_at : null,
    lastSeenAt: typeof user.last_seen_at === 'string' ? user.last_seen_at : null,
    features: normalizeFeatureKeys(featuresBySub.get(String(user.sso_sub)) || []),
  }));
}

export async function replaceUserFeatureAccess(
  targetSub: string,
  featureKeys: string[],
  actorSub: string,
): Promise<FeatureKey[]> {
  const normalizedFeatureKeys = normalizeFeatureKeys(featureKeys);
  const supabase = getSupabaseAdminClient();
  const { error: deleteError } = await supabase.from('admin_feature_permissions').delete().eq('sso_sub', targetSub);

  if (deleteError) {
    throw new Error(`Gagal menghapus akses lama: ${deleteError.message}`);
  }

  if (!normalizedFeatureKeys.length) {
    return [];
  }

  const { error: insertError } = await supabase.from('admin_feature_permissions').insert(
    normalizedFeatureKeys.map((featureKey) => ({
      sso_sub: targetSub,
      feature_key: featureKey,
      granted_by_sub: actorSub,
    })),
  );

  if (insertError) {
    throw new Error(`Gagal menyimpan akses baru: ${insertError.message}`);
  }

  return normalizedFeatureKeys;
}
