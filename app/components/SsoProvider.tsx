'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Alert,
  Backdrop,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

import { getKeycloak, getValidAccessToken, initKeycloak, loginWithSso, logoutFromSso } from '@/app/lib/keycloak';

interface SsoContextValue {
  userName: string | null;
  userEmail: string | null;
  roles: string[];
  logout: () => Promise<void>;
}

const SsoContext = createContext<SsoContextValue | null>(null);

async function syncSessionCookie(token: string): Promise<void> {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'Gagal menyimpan sesi SSO di server.');
  }
}

function shouldAttachAuthHeader(input: RequestInfo | URL): boolean {
  const requestUrl =
    typeof input === 'string'
      ? new URL(input, window.location.origin)
      : input instanceof URL
        ? input
        : new URL(input.url, window.location.origin);

  return requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith('/api/');
}

export default function SsoProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/sso/login';
  const [ready, setReady] = useState(isLoginPage);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    if (isLoginPage) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const authenticated = await initKeycloak();

        if (!authenticated) {
          await loginWithSso(`${window.location.origin}/sso/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }

        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('Token akses SSO tidak tersedia.');
        }

        await syncSessionCookie(token);

        if (cancelled) {
          return;
        }

        const keycloak = getKeycloak();
        const realmRoles = Array.isArray(keycloak.tokenParsed?.realm_access?.roles)
          ? keycloak.tokenParsed.realm_access.roles.filter((role): role is string => typeof role === 'string')
          : [];

        setUserName(typeof keycloak.tokenParsed?.name === 'string' ? keycloak.tokenParsed.name : null);
        setUserEmail(typeof keycloak.tokenParsed?.email === 'string' ? keycloak.tokenParsed.email : null);
        setRoles(realmRoles);
        setReady(true);
        setError(null);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Autentikasi SSO gagal.');
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [isLoginPage, pathname]);

  useEffect(() => {
    if (!ready || isLoginPage) {
      return;
    }

    let cancelled = false;
    const refreshSession = async () => {
      try {
        const token = await getValidAccessToken();
        if (!token || cancelled) {
          return;
        }

        await syncSessionCookie(token);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Gagal menyegarkan sesi SSO.');
        }
      }
    };

    void refreshSession();
    const intervalId = window.setInterval(() => {
      void refreshSession();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isLoginPage, ready]);

  useEffect(() => {
    if (!ready || isLoginPage) {
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!shouldAttachAuthHeader(input)) {
        return originalFetch(input, init);
      }

      const token = await getValidAccessToken();
      const headers = new Headers(init?.headers);

      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      return originalFetch(input, {
        ...init,
        credentials: init?.credentials || 'include',
        headers,
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [isLoginPage, ready]);

  const contextValue = useMemo<SsoContextValue>(
    () => ({
      userName,
      userEmail,
      roles,
      logout: async () => {
        await logoutFromSso();
        router.replace('/sso/login');
      },
    }),
    [roles, router, userEmail, userName],
  );

  if (isLoginPage) {
    return children;
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 3 }}>
        <Paper sx={{ maxWidth: 560, p: 3, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Alert severity="error">{error}</Alert>
            <Typography variant="body2" color="text.secondary">
              Periksa konfigurasi `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID`, audience, dan role yang diizinkan.
            </Typography>
            <Button
              variant="contained"
              onClick={() => {
                setError(null);
                setReady(false);
                void loginWithSso(`${window.location.origin}/sso/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
              }}
            >
              Coba login ulang
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  if (!ready) {
    return (
      <>
        <Backdrop open sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}>
          <Stack spacing={2} alignItems="center">
            <CircularProgress color="inherit" />
            <Typography variant="body1">Menyiapkan sesi SSO...</Typography>
          </Stack>
        </Backdrop>
        {children}
      </>
    );
  }

  return (
    <SsoContext.Provider value={contextValue}>
      <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: (theme) => theme.zIndex.appBar }}>
        <Paper
          elevation={3}
          sx={{
            px: 2,
            py: 1.25,
            borderRadius: 999,
            display: 'flex',
            gap: 1.5,
            alignItems: 'center',
            bgcolor: 'rgba(255,255,255,0.94)',
          }}
        >
          <Stack spacing={0}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.1 }}>
              {userName || 'Pengguna SSO'}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.1 }}>
              {userEmail || roles.join(', ') || 'IOM SSO'}
            </Typography>
          </Stack>
          <Button
            size="small"
            variant="outlined"
            sx={{ borderRadius: 999, textTransform: 'none' }}
            onClick={() => {
              void contextValue.logout();
            }}
          >
            Logout
          </Button>
        </Paper>
      </Box>
      {children}
    </SsoContext.Provider>
  );
}

export function useSso(): SsoContextValue {
  const context = useContext(SsoContext);

  if (!context) {
    throw new Error('useSso must be used within SsoProvider.');
  }

  return context;
}
