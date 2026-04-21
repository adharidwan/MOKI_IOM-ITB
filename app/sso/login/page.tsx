'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';

import { getValidAccessToken, initKeycloak, loginWithSso } from '@/app/lib/keycloak';

async function syncSessionCookie(token: string): Promise<void> {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'Gagal menyimpan sesi login.');
  }
}

export default function SsoLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const searchParams = new URLSearchParams(window.location.search);
    const returnTo = searchParams.get('returnTo') || '/';
    const redirectTarget = `${window.location.origin}${returnTo.startsWith('/') ? returnTo : '/'}`;

    const bootstrap = async () => {
      try {
        const authenticated = await initKeycloak();

        if (!authenticated) {
          await loginWithSso(redirectTarget);
          return;
        }

        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('Token akses SSO tidak tersedia.');
        }

        await syncSessionCookie(token);

        if (!cancelled) {
          router.replace(returnTo);
          router.refresh();
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Login SSO gagal.');
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 3 }}>
      <Paper sx={{ width: '100%', maxWidth: 520, p: 4, borderRadius: 4 }}>
        <Stack spacing={2} alignItems="center" textAlign="center">
          <CircularProgress />
          <Typography variant="h5" fontWeight={800}>
            Menyambungkan ke IOM SSO
          </Typography>
          <Typography color="text.secondary">
            Sistem sedang memeriksa sesi Keycloak dan menyiapkan akses aplikasi.
          </Typography>
          {error ? <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert> : null}
        </Stack>
      </Paper>
    </Box>
  );
}
