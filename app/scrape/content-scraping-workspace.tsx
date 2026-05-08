'use client';

import { useMemo, useState } from 'react';
import { Instagram, X, YouTube } from '@mui/icons-material';
import {
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

import InstagramScraper from '../components/ScrapeIG';
import XScraper from '../components/ScrapeX';
import YouTubeScraper from '../components/ScrapeYoutube';
import { adminPalette, adminPanelSx } from '../lib/adminPalette';

type PlatformId = 'youtube' | 'instagram' | 'x';

const PLATFORM_OPTIONS: Array<{
  id: PlatformId;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}> = [
  {
    id: 'youtube',
    label: 'YouTube',
    subtitle: 'Video channel & short updates',
    icon: <YouTube sx={{ fontSize: 19 }} />,
    color: '#d82424',
  },
  {
    id: 'x',
    label: 'X',
    subtitle: 'Thread, tweet, dan update cepat',
    icon: <X sx={{ fontSize: 18 }} />,
    color: '#1a1a1a',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    subtitle: 'Post feed dan konten visual',
    icon: <Instagram sx={{ fontSize: 19 }} />,
    color: '#d23271',
  },
];

function getPlatformLabel(platformId: PlatformId): string {
  return PLATFORM_OPTIONS.find((option) => option.id === platformId)?.label || platformId;
}

function getScraper(platformId: PlatformId): React.ReactNode {
  if (platformId === 'youtube') {
    return <YouTubeScraper />;
  }

  if (platformId === 'instagram') {
    return <InstagramScraper />;
  }

  return <XScraper />;
}

export default function ContentScrapingWorkspace() {
  const [activePlatform, setActivePlatform] = useState<PlatformId>('youtube');

  const activeOption = useMemo(
    () => PLATFORM_OPTIONS.find((option) => option.id === activePlatform) || PLATFORM_OPTIONS[0],
    [activePlatform],
  );

  return (
    <Stack spacing={1.25}>
      <Paper elevation={0} sx={adminPanelSx}>
        <Stack spacing={1.25} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>
              Content
            </Typography>
            <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
              Channel Content Scraping
            </Typography>
            <Typography sx={{ mt: 0.55, fontSize: '0.8rem', color: adminPalette.textMuted }}>
              Ambil data konten level channel dari YouTube, X, dan Instagram sekaligus.
            </Typography>
          </Box>

          <Stack spacing={1.25}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} useFlexGap>
              {PLATFORM_OPTIONS.map((platform) => {
                const active = platform.id === activePlatform;

                return (
                  <Button
                    key={platform.id}
                    variant={active ? 'contained' : 'outlined'}
                    onClick={() => setActivePlatform(platform.id)}
                    startIcon={platform.icon}
                    sx={{
                      minHeight: 48,
                      borderRadius: 999,
                      px: 2,
                      justifyContent: 'flex-start',
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: active ? platform.color : adminPalette.borderStrong,
                      color: active ? '#ffffff' : adminPalette.textSecondary,
                      backgroundColor: active ? platform.color : adminPalette.surface,
                      '&:hover': {
                        borderColor: platform.color,
                        backgroundColor: active ? platform.color : adminPalette.brandSoft,
                      },
                    }}
                  >
                    {platform.label}
                  </Button>
                );
              })}
            </Stack>

            <Divider />

            <Paper
              elevation={0}
              sx={{
                p: { xs: 1.25, md: 1.5 },
                borderRadius: 2.5,
                border: `1px solid ${adminPalette.border}`,
                backgroundColor: adminPalette.surfaceSoft,
              }}
            >
              <Stack spacing={0.75}>
                <Typography sx={{ fontWeight: 700, color: adminPalette.textPrimary }}>
                  {activeOption.label}
                </Typography>
                <Typography sx={{ color: adminPalette.textSecondary }}>{activeOption.subtitle}</Typography>
              </Stack>
            </Paper>
          </Stack>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          ...adminPanelSx,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
            Hasil Scraping
          </Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>
            Platform aktif: {getPlatformLabel(activePlatform)}. Output dapat berisi beberapa post
            dari channel yang sama.
          </Typography>
        </Box>

        <Box sx={{ p: { xs: 1.5, md: 2 } }}>{getScraper(activePlatform)}</Box>
      </Paper>
    </Stack>
  );
}
