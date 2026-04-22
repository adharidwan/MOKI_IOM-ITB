'use client';

import type { ClipboardEvent } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';

import type { ContentRecording } from '../lib/types';
import type { ContentRecordingFormState } from './actions';
import {
  scrapeContentRecordingAction,
  saveContentRecordingAction,
} from './actions';

interface WorkspaceProps {
  initialRecordings: ContentRecording[];
  initialLoadError?: string | null;
}

type FlashState =
  | { severity: 'success' | 'info' | 'warning' | 'error'; message: string }
  | null;

const PLATFORM_OPTIONS = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'x', label: 'X' },
  { value: 'Instagram', label: 'Instagram' },
] as const;

const EMPTY_FORM: ContentRecordingFormState = {
  title: '',
  platform: 'youtube',
  upload_date: '',
  link: '',
  source_post_id: '',
  thumbnail_url: '',
};

function formatDateLabel(value: string): string {
  if (!value) {
    return '-';
  }

  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatPlatformLabel(value: ContentRecording['platform']): string {
  return PLATFORM_OPTIONS.find((option) => option.value === value)?.label || value;
}

export default function ContentRecordingWorkspace({
  initialRecordings,
  initialLoadError,
}: WorkspaceProps) {
  const [recordings, setRecordings] = useState(initialRecordings);
  const [form, setForm] = useState<ContentRecordingFormState>(EMPTY_FORM);
  const [flash, setFlash] = useState<FlashState>(
    initialLoadError ? { severity: 'warning', message: initialLoadError } : null,
  );
  const [lastScrapedLink, setLastScrapedLink] = useState('');
  const [isScraping, startScrapeTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  const isBusy = isScraping || isSaving;
  const totalRecordings = recordings.length;
  const sortedRecordings = [...recordings].sort((left, right) => {
    const leftValue = `${left.upload_date}-${left.created_at}`;
    const rightValue = `${right.upload_date}-${right.created_at}`;
    return rightValue.localeCompare(leftValue);
  });

  function setField<K extends keyof ContentRecordingFormState>(
    key: K,
    value: ContentRecordingFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyScrapedData(data: Partial<ContentRecordingFormState>) {
    setForm((current) => ({
      ...current,
      title: data.title || current.title,
      platform: data.platform || current.platform,
      upload_date: data.upload_date || current.upload_date,
      link: data.link || current.link,
      source_post_id: data.source_post_id || current.source_post_id,
      thumbnail_url: data.thumbnail_url || current.thumbnail_url,
    }));
  }

  function hydrateFromLink(rawLink: string) {
    const link = rawLink.trim();
    if (!link || link === lastScrapedLink) {
      return;
    }

    setFlash({
      severity: 'info',
      message: 'Mengambil metadata dari link konten...',
    });

    startScrapeTransition(async () => {
      const result = await scrapeContentRecordingAction(link);

      if (!result.success || !result.data) {
        setFlash({
          severity: 'error',
          message: result.error || 'Gagal mengambil metadata dari link.',
        });
        return;
      }

      applyScrapedData(result.data);
      setLastScrapedLink(link);
      setFlash({
        severity: result.data.upload_date ? 'success' : 'warning',
        message: result.data.upload_date
          ? 'Metadata berhasil diisi dari hasil scrape.'
          : 'Metadata sebagian berhasil diisi. Lengkapi tanggal upload bila belum tersedia.',
      });
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedLink = event.clipboardData.getData('text').trim();
    if (!pastedLink) {
      return;
    }

    event.preventDefault();
    setForm((current) => ({
      ...current,
      link: pastedLink,
      source_post_id: '',
      thumbnail_url: '',
    }));
    void Promise.resolve().then(() => hydrateFromLink(pastedLink));
  }

  function handleSubmit() {
    setFlash(null);

    startSaveTransition(async () => {
      const result = await saveContentRecordingAction(form);

      if (!result.success || !result.record) {
        setFlash({
          severity: 'error',
          message: result.error || 'Gagal menyimpan content recording.',
        });
        return;
      }

      const savedRecord = result.record;
      setRecordings((current) => {
        const next = current.filter((item) => item.link !== savedRecord.link);
        next.unshift(savedRecord);
        return next;
      });
      setForm(EMPTY_FORM);
      setLastScrapedLink('');
      setFlash({
        severity: 'success',
        message: 'Content recording berhasil disimpan ke database.',
      });
    });
  }

  return (
    <Stack spacing={3}>
      {flash ? <Alert severity={flash.severity}>{flash.message}</Alert> : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.25fr) minmax(320px, 0.75fr)' },
          gap: 3,
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
                Form Content Recording
              </Typography>
              <Typography sx={{ color: '#50665d', lineHeight: 1.7 }}>
                Paste link konten untuk auto-fill metadata dari hasil scrape. Semua field tetap bisa
                diedit manual sebelum disimpan.
              </Typography>
            </Stack>
          </Box>

          <Stack spacing={2.25} sx={{ p: { xs: 2, md: 3 } }}>
            <TextField
              label="Link konten"
              value={form.link}
              onChange={(event) => {
                setField('link', event.target.value);
                setLastScrapedLink('');
              }}
              onBlur={(event) => hydrateFromLink(event.target.value)}
              onPaste={handlePaste}
              placeholder="https://www.youtube.com/watch?v=... / https://x.com/... / https://www.instagram.com/p/..."
              fullWidth
              disabled={isBusy}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkRoundedIcon sx={{ color: '#1f6f5f' }} />
                  </InputAdornment>
                ),
              }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="outlined"
                startIcon={<AutoFixHighRoundedIcon />}
                onClick={() => hydrateFromLink(form.link)}
                disabled={isBusy || !form.link.trim()}
                sx={{
                  minHeight: 48,
                  borderRadius: 999,
                  borderColor: '#1f6f5f',
                  color: '#1f6f5f',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                {isScraping ? 'Mengambil metadata...' : 'Auto Fill dari Link'}
              </Button>

              <Button
                variant="contained"
                startIcon={<SaveRoundedIcon />}
                onClick={handleSubmit}
                disabled={isBusy}
                sx={{
                  minHeight: 48,
                  borderRadius: 999,
                  px: 3,
                  textTransform: 'none',
                  fontWeight: 700,
                  backgroundColor: '#1f6f5f',
                }}
              >
                {isSaving ? 'Menyimpan...' : 'Simpan Recording'}
              </Button>
            </Stack>

            <Divider />

            <TextField
              label="Title"
              value={form.title}
              onChange={(event) => setField('title', event.target.value)}
              fullWidth
              disabled={isBusy}
            />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 2,
              }}
            >
              <TextField
                select
                label="Platform"
                value={form.platform}
                onChange={(event) =>
                  setField(
                    'platform',
                    event.target.value as ContentRecordingFormState['platform'],
                  )
                }
                fullWidth
                disabled={isBusy}
              >
                {PLATFORM_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Tanggal upload"
                type="date"
                value={form.upload_date}
                onChange={(event) => setField('upload_date', event.target.value)}
                fullWidth
                disabled={isBusy}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />
            </Box>
          </Stack>
        </Paper>

        <Card
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid rgba(22, 48, 32, 0.1)',
            backgroundColor: '#ffffff',
          }}
        >
          <CardContent>
            <Stack spacing={2}>
              <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#163020' }}>
                Ringkasan
              </Typography>

              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  backgroundColor: '#f7faf8',
                  border: '1px solid rgba(31, 111, 95, 0.12)',
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.8rem',
                    color: '#6a7d75',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Total recording
                </Typography>
                <Typography sx={{ mt: 0.5, fontSize: '2rem', fontWeight: 800, color: '#163020' }}>
                  {totalRecordings}
                </Typography>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  backgroundColor: '#fffaf0',
                  border: '1px solid rgba(217, 167, 84, 0.18)',
                }}
              >
                <Stack spacing={1.25}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#163020' }}>
                    Catatan
                  </Typography>
                  <Typography sx={{ color: '#50665d', lineHeight: 1.7 }}>
                    Jika scrape tidak memberi tanggal atau title lengkap, Anda tetap bisa mengisi
                    manual lalu simpan.
                  </Typography>
                </Stack>
              </Paper>

              {form.thumbnail_url ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 2.5,
                    border: '1px solid rgba(22, 48, 32, 0.08)',
                  }}
                >
                  <Typography sx={{ mb: 1.25, fontSize: '0.88rem', fontWeight: 700, color: '#163020' }}>
                    Thumbnail hasil scrape
                  </Typography>
                  <Box
                    component="img"
                    src={form.thumbnail_url}
                    alt={form.title || 'Thumbnail konten'}
                    sx={{
                      display: 'block',
                      width: '100%',
                      borderRadius: 2,
                      objectFit: 'cover',
                      aspectRatio: '16 / 9',
                      backgroundColor: '#eef4f2',
                    }}
                  />
                </Paper>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
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
            Recording Tersimpan
          </Typography>
        </Box>

        <Stack spacing={0} divider={<Divider flexItem />}>
          {sortedRecordings.length === 0 ? (
            <Box sx={{ px: 3, py: 5, textAlign: 'center' }}>
              <Typography sx={{ color: '#50665d' }}>
                Belum ada content recording yang tersimpan.
              </Typography>
            </Box>
          ) : (
            sortedRecordings.map((record) => (
              <Box
                key={record.id}
                sx={{
                  px: { xs: 2, md: 3 },
                  py: 2.25,
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto auto' },
                  gap: 1.5,
                  alignItems: { lg: 'center' },
                }}
              >
                <Stack spacing={0.8} sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, color: '#163020' }}>{record.title}</Typography>
                  <Typography
                    component={Link}
                    href={record.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      color: '#1f6f5f',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {record.link}
                  </Typography>
                </Stack>

                <Chip
                  label={formatPlatformLabel(record.platform)}
                  sx={{
                    justifySelf: { lg: 'start' },
                    width: 'fit-content',
                    fontWeight: 700,
                    backgroundColor: '#eef6f5',
                    color: '#1f6f5f',
                  }}
                />

                <Typography sx={{ color: '#50665d', fontWeight: 600 }}>
                  {formatDateLabel(record.upload_date)}
                </Typography>
              </Box>
            ))
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
