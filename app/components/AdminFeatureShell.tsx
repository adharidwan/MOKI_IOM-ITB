"use client"

import Link from 'next/link';
import { Box, Button, Chip, Container, Paper, Stack, Typography } from '@mui/material';

interface AdminFeatureShellProps {
  title: string;
  description: string;
  currentPath: '/contacts' | '/blastmessage';
  badge?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  {
    href: '/contacts' as const,
    label: 'Kontak & Grup',
    helper: 'Tambah, cari, dan rapikan daftar penerima.',
  },
  {
    href: '/blastmessage' as const,
    label: 'Blast Message',
    helper: 'Pilih penerima, tulis pesan, lalu kirim.',
  },
];

export default function AdminFeatureShell({
  title,
  description,
  currentPath,
  badge,
  actions,
  children,
}: AdminFeatureShellProps) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        py: { xs: 3, md: 5 },
        background:
          'linear-gradient(180deg, #f8f4e8 0%, #fdfcf8 28%, #eef6f5 100%)',
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={3}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 4,
              border: '1px solid rgba(26, 71, 42, 0.12)',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
            }}
          >
            <Stack spacing={3}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', md: 'center' }}
              >
                <Stack spacing={1.5} sx={{ maxWidth: 760 }}>
                  {badge ? (
                    <Chip
                      label={badge}
                      sx={{
                        alignSelf: 'flex-start',
                        backgroundColor: '#e4f2d2',
                        color: '#1f4d2e',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        px: 1,
                      }}
                    />
                  ) : null}
                  <Typography
                    component="h1"
                    sx={{
                      fontSize: { xs: '2rem', md: '2.8rem' },
                      lineHeight: 1.15,
                      fontWeight: 800,
                      color: '#163020',
                    }}
                  >
                    {title}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: { xs: '1.05rem', md: '1.15rem' },
                      lineHeight: 1.7,
                      color: '#355046',
                      maxWidth: 680,
                    }}
                  >
                    {description}
                  </Typography>
                </Stack>

                {actions ? <Box>{actions}</Box> : null}
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                {NAV_ITEMS.map((item) => {
                  const active = item.href === currentPath;

                  return (
                    <Paper
                      key={item.href}
                      elevation={0}
                      sx={{
                        flex: 1,
                        p: 2.5,
                        borderRadius: 3,
                        border: active
                          ? '2px solid #1f6f5f'
                          : '1px solid rgba(31, 111, 95, 0.18)',
                        backgroundColor: active ? '#f2fbf8' : '#fffdf8',
                      }}
                    >
                      <Stack spacing={1.5}>
                        <Typography
                          sx={{
                            fontSize: '1.15rem',
                            fontWeight: 800,
                            color: '#123629',
                          }}
                        >
                          {item.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1rem',
                            lineHeight: 1.6,
                            color: '#4d665d',
                          }}
                        >
                          {item.helper}
                        </Typography>
                        <Link href={item.href} style={{ textDecoration: 'none' }}>
                          <Button
                            variant={active ? 'contained' : 'outlined'}
                            size="large"
                            sx={{
                              alignSelf: 'flex-start',
                              minWidth: 180,
                              borderRadius: 999,
                              px: 3,
                              py: 1.1,
                              fontSize: '1rem',
                              fontWeight: 700,
                              textTransform: 'none',
                              backgroundColor: active ? '#1f6f5f' : undefined,
                              borderColor: '#1f6f5f',
                              color: active ? '#ffffff' : '#1f6f5f',
                            }}
                          >
                            {active ? 'Halaman aktif' : 'Buka halaman'}
                          </Button>
                        </Link>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Stack>
          </Paper>

          {children}
        </Stack>
      </Container>
    </Box>
  );
}
