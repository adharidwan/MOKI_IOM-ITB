'use client';

import { useMemo, useState } from 'react';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import TipsAndUpdatesRoundedIcon from '@mui/icons-material/TipsAndUpdatesRounded';
import { Instagram, X, YouTube } from '@mui/icons-material';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

import InstagramScraper from '../components/ScrapeIG';
import XScraper from '../components/ScrapeX';
import YouTubeScraper from '../components/ScrapeYoutube';

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
    <Stack spacing={3}>
      <Box
        sx={{
          display: 'grid',
          
        }}
      >
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid rgba(22, 48, 32, 0.1)',
            overflow: 'hidden',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,250,247,0.96) 100%)',
          }}
        >
          <Box
            sx={{
              px: { xs: 2, md: 3 },
              py: 2.5,
              background:
                'linear-gradient(135deg, rgba(31,111,95,0.08) 0%, rgba(217,167,84,0.12) 100%)',
            }}
          >
            <Stack spacing={1}>
              <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#163020' }}>
                Channel Scraping Workspace
              </Typography>
              <Typography sx={{ color: '#50665d', lineHeight: 1.7 }}>
                Halaman ini untuk pengambilan data keseluruhan channel. Satu kali proses scrape
                bisa menghasilkan banyak post, lalu dipilih mana saja yang akan diteruskan.
              </Typography>
            </Stack>
          </Box>

          <Stack spacing={2.25} sx={{ p: { xs: 2, md: 3 } }}>
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
                      borderColor: active ? platform.color : 'rgba(22, 48, 32, 0.2)',
                      color: active ? '#ffffff' : '#1f6f5f',
                      backgroundColor: active ? platform.color : '#ffffff',
                      '&:hover': {
                        borderColor: platform.color,
                        backgroundColor: active ? platform.color : 'rgba(31,111,95,0.04)',
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
                p: 2,
                borderRadius: 2.5,
                border: '1px solid rgba(22, 48, 32, 0.08)',
                backgroundColor: '#ffffff',
              }}
            >
              <Stack spacing={0.75}>
                <Typography sx={{ fontWeight: 700, color: '#163020' }}>
                  {activeOption.label}
                </Typography>
                <Typography sx={{ color: '#50665d' }}>{activeOption.subtitle}</Typography>
              </Stack>
            </Paper>
          </Stack>
        </Paper>
      </Box>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid rgba(22, 48, 32, 0.1)',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
        }}
      >
        <Box sx={{ px: { xs: 2, md: 3 }, py: 2.5, borderBottom: '1px solid rgba(22, 48, 32, 0.08)' }}>
          <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: '#163020' }}>
            Hasil Scraping
          </Typography>
          <Typography sx={{ mt: 0.75, color: '#50665d' }}>
            Platform aktif: {getPlatformLabel(activePlatform)}. Output dapat berisi beberapa post
            dari channel yang sama.
          </Typography>
        </Box>

        <Box sx={{ p: { xs: 2, md: 3 } }}>{getScraper(activePlatform)}</Box>
      </Paper>
    </Stack>
  );
}
