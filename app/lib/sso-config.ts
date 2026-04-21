const DEFAULT_KEYCLOAK_URL = 'https://iom-sso.kirisame.jp.net';
const DEFAULT_KEYCLOAK_REALM = 'iom-itb-sso';
const DEFAULT_ALLOWED_ROLES = ['admin', 'pengurus-bidang-1'];
export const SSO_SESSION_COOKIE = 'iom_sso_access_token';

function parseAllowedRoles(rawValue: string | undefined): string[] {
  const parsed = String(rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length ? parsed : DEFAULT_ALLOWED_ROLES;
}

export const ssoConfig = {
  keycloakUrl: process.env.NEXT_PUBLIC_KEYCLOAK_URL || DEFAULT_KEYCLOAK_URL,
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || DEFAULT_KEYCLOAK_REALM,
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || '',
  issuer:
    process.env.KEYCLOAK_ISSUER_URL ||
    `${process.env.NEXT_PUBLIC_KEYCLOAK_URL || DEFAULT_KEYCLOAK_URL}/realms/${
      process.env.NEXT_PUBLIC_KEYCLOAK_REALM || DEFAULT_KEYCLOAK_REALM
    }`,
  jwksUri:
    process.env.KEYCLOAK_JWKS_URI ||
    `${process.env.NEXT_PUBLIC_KEYCLOAK_URL || DEFAULT_KEYCLOAK_URL}/realms/${
      process.env.NEXT_PUBLIC_KEYCLOAK_REALM || DEFAULT_KEYCLOAK_REALM
    }/protocol/openid-connect/certs`,
  audience: process.env.KEYCLOAK_AUDIENCE || 'backend-api',
  allowedRoles: parseAllowedRoles(process.env.SSO_ALLOWED_ROLES),
};

export function assertClientSsoConfig(): void {
  if (!ssoConfig.clientId) {
    throw new Error('NEXT_PUBLIC_KEYCLOAK_CLIENT_ID is required for SSO.');
  }
}
