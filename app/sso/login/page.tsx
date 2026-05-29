'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';

import { adminPalette, adminPanelSx, adminSectionLabelSx, adminTypographySx } from '@/app/lib/adminPalette';
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
    <Box sx={{ ...adminTypographySx, minHeight: '100vh', backgroundColor: adminPalette.canvas }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '80px minmax(0, 1fr)' },
          gridTemplateRows: '60px minmax(0, 1fr)',
          minHeight: '100vh',
        }}
      >
        <Box
          component="aside"
          sx={{
            display: { xs: 'none', lg: 'flex' },
            gridColumn: '1 / 2',
            gridRow: '1 / 3',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            backgroundColor: adminPalette.sidebarRail,
            borderRight: '1px solid rgba(4, 1, 1, 0.08)',
          }}
        >
          <Box
            sx={{
              width: '100%',
              height: 60,
              px: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: adminPalette.sidebarRailDarker,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.8rem',
                fontWeight: 800,
                letterSpacing: '0.12em',
                color: '#ffffff',
                textAlign: 'center',
              }}
            >
              LOGO
            </Typography>
          </Box>
        </Box>

        <Box
          component="header"
          sx={{
            gridColumn: { xs: '1 / 2', lg: '2 / 3' },
            gridRow: '1 / 2',
            height: 60,
            px: { xs: 2, md: 3 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: adminPalette.topNav,
            color: '#ffffff',
            borderBottom: `1px solid ${adminPalette.brand}`,
          }}
        >
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700 }}>
            OKI IOM
          </Typography>
          <Box
            sx={{
              px: 1.25,
              py: 0.65,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.22)',
              backgroundColor: 'rgba(255,255,255,0.16)',
            }}
          >
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'inherit' }}>
              IOM SSO
            </Typography>
          </Box>
        </Box>

        <Box
          component="main"
          sx={{
            gridColumn: { xs: '1 / 2', lg: '2 / 3' },
            gridRow: '2 / 3',
            minWidth: 0,
            px: { xs: 2, md: 3 },
            py: { xs: 2, md: 3 },
            display: 'grid',
            alignItems: 'center',
          }}
        >
          <Paper
            elevation={0}
            sx={{
              ...adminPanelSx,
              width: '100%',
              maxWidth: 680,
              mx: 'auto',
              overflow: 'hidden',
            }}
          >
            <Stack spacing={2} sx={{ px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 3 } }}>
              <Box>
                <Typography sx={adminSectionLabelSx}>
                  Authentication
                </Typography>
                <Typography
                  component="h1"
                  sx={{
                    mt: 0.7,
                    fontSize: { xs: '1.45rem', md: '1.75rem' },
                    fontWeight: 700,
                    lineHeight: 1.12,
                    color: adminPalette.textPrimary,
                  }}
                >
                  Menyambungkan ke IOM SSO
                </Typography>
                <Typography
                  sx={{
                    mt: 0.7,
                    maxWidth: 520,
                    fontSize: '0.92rem',
                    lineHeight: 1.65,
                    color: adminPalette.textSecondary,
                  }}
                >
                  Sistem sedang memeriksa sesi Keycloak dan menyiapkan akses aplikasi.
                </Typography>
              </Box>

              <Stack
                direction="row"
                spacing={1.4}
                alignItems="center"
                sx={{
                  pt: 1.75,
                  borderTop: `1px solid ${adminPalette.border}`,
                }}
              >
                <CircularProgress size={30} thickness={4.2} sx={{ color: adminPalette.brand }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                    Redirecting
                  </Typography>
                  <Typography sx={{ mt: 0.25, fontSize: '0.8rem', color: adminPalette.textMuted }}>
                    Mohon tunggu sebentar.
                  </Typography>
                </Box>
              </Stack>

              {error ? (
                <Alert severity="error" sx={{ borderRadius: 2 }}>
                  {error}
                </Alert>
              ) : null}
            </Stack>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
