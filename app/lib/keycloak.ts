'use client';

import Keycloak from 'keycloak-js';

import { assertClientSsoConfig, ssoConfig } from './sso-config';

let keycloakInstance: Keycloak | null = null;
let initPromise: Promise<boolean> | null = null;

function getKeycloakInstance(): Keycloak {
  assertClientSsoConfig();

  if (!keycloakInstance) {
    keycloakInstance = new Keycloak({
      url: ssoConfig.keycloakUrl,
      realm: ssoConfig.realm,
      clientId: ssoConfig.clientId,
    });
  }

  return keycloakInstance;
}

export async function initKeycloak(): Promise<boolean> {
  if (!initPromise) {
    const keycloak = getKeycloakInstance();
    initPromise = keycloak.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      checkLoginIframe: false,
      responseMode: 'query',
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      silentCheckSsoFallback: true,
    });
  }

  return initPromise;
}

export function getKeycloak(): Keycloak {
  return getKeycloakInstance();
}

export async function getValidAccessToken(minValidity = 30): Promise<string | undefined> {
  const keycloak = getKeycloakInstance();

  if (!keycloak.authenticated) {
    return undefined;
  }

  await keycloak.updateToken(minValidity);
  return keycloak.token;
}

export function loginWithSso(redirectUri = window.location.href): Promise<void> {
  return getKeycloakInstance().login({ redirectUri });
}

export async function logoutFromSso(redirectUri = `${window.location.origin}/`): Promise<void> {
  const keycloak = getKeycloakInstance();
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  await keycloak.logout({ redirectUri });
}
