'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  CloseRounded as CloseIcon,
  CloudUploadOutlined as UploadIcon,
  DeleteOutlineRounded as DeleteIcon,
  HelpOutlineRounded as HelpIcon,
  CheckCircleOutlineRounded as CheckIcon,
  ErrorOutlineRounded as ErrorIcon,
  ScheduleRounded as EnvIcon,
  Instagram,
  YouTube,
  X,
} from '@mui/icons-material';

import { adminPalette, adminPanelSx } from '../lib/adminPalette';

type Platform = 'instagram' | 'youtube' | 'x';

interface CookieStatus {
  configured: boolean;
  source: 'upload' | 'env' | 'none';
  lastModified?: number;
  fileName?: string;
}

interface StatusesResponse {
  statuses: Record<Platform, CookieStatus>;
  error?: string;
}

interface UploadResponse {
  success?: boolean;
  error?: string;
  status?: CookieStatus;
}

interface DeleteResponse {
  success?: boolean;
  error?: string;
  status?: CookieStatus;
}

const PLATFORM_META: Array<{
  id: Platform;
  label: string;
  icon: React.ReactElement;
  extension: string;
  helpText: string;
}> = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: <Instagram sx={{ fontSize: 19 }} />,
    extension: '.json',
    helpText:
      'Format: file JSON (Playwright storage state). Gunakan ekstensi browser "EditThisCookie" untuk mengekspor cookies instagram.com.\n\nContoh isi file:\n{\n  "cookies": [\n    {\n      "name": "sessionid",\n      "value": "12345678...",\n      "domain": ".instagram.com",\n      "path": "/",\n      "expires": -1,\n      "httpOnly": true,\n      "secure": true,\n      "sameSite": "Lax"\n    },\n    {\n      "name": "csrftoken",\n      "value": "AbCdEf...",\n      "domain": ".instagram.com",\n      "path": "/",\n      "expires": -1,\n      "httpOnly": false,\n      "secure": true,\n      "sameSite": "Lax"\n    }\n  ],\n  "origins": []\n}',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: <YouTube sx={{ fontSize: 19 }} />,
    extension: '.txt',
    helpText:
      'Format: file .txt (Netscape cookies). Gunakan ekstensi browser "cookies.txt" (tersedia di Chrome Web Store & Firefox Add-ons). Login ke youtube.com terlebih dahulu sebelum mengekspor.\n\nContoh isi file:\n# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n.youtube.com\tTRUE\t/\tFALSE\t1234567890\tLOGIN_INFO\tAe...\n.youtube.com\tTRUE\t/\tFALSE\t1234567890\tSID\taBCd...\n.youtube.com\tTRUE\t/\tTRUE\t1234567890\tHSID\tA1b2C3...\n.youtube.com\tTRUE\t/\tTRUE\t1234567890\tSSID\tAbC123...\n.youtube.com\tTRUE\t/\tTRUE\t1234567890\tAPISID\tabc123...\n.youtube.com\tTRUE\t/\tTRUE\t1234567890\tSAPISID\tabcd12...',
  },
  {
    id: 'x',
    label: 'X',
    icon: <X sx={{ fontSize: 19 }} />,
    extension: '.txt',
    helpText:
      'Format: file .txt (Netscape cookies). Gunakan ekstensi browser "cookies.txt" (tersedia di Chrome Web Store & Firefox Add-ons). Login ke x.com terlebih dahulu sebelum mengekspor.\n\nContoh isi file:\n# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n.x.com\tTRUE\t/\tFALSE\t1234567890\tauth_token\ta1b2c3...\n.x.com\tTRUE\t/\tFALSE\t1234567890\tct0\tabc123...\n.x.com\tTRUE\t/\tTRUE\t1234567890\tguest_id\tv1%3A123456789',
  },
];

function formatTimestamp(ms?: number): string {
  if (!ms) return '';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export default function CookieSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Platform>('instagram');
  const [statuses, setStatuses] = useState<Record<Platform, CookieStatus>>({
    instagram: { configured: false, source: 'none' },
    youtube: { configured: false, source: 'none' },
    x: { configured: false, source: 'none' },
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStatuses = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/admin/platform-cookies');
      const data: StatusesResponse = await res.json();
      if (res.ok && data.statuses) {
        setStatuses(data.statuses);
      } else {
        setFetchError(data.error || 'Gagal mengambil status cookies.');
      }
    } catch {
      setFetchError('Gagal menghubungi server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStatuses();
    }
  }, [open, fetchStatuses]);

  const handleUpload = useCallback(
    async (platform: Platform, file: File) => {
      setUploading(true);
      setFlash(null);

      try {
        const formData = new FormData();
        formData.append('platform', platform);
        formData.append('file', file);

        const res = await fetch('/api/admin/platform-cookies', {
          method: 'POST',
          body: formData,
        });

        const data: UploadResponse = await res.json();

        if (res.ok && data.success) {
          setFlash({ severity: 'success', message: `Cookies ${PLATFORM_META.find((m) => m.id === platform)?.label} berhasil diperbarui.` });
          fetchStatuses();
        } else {
          setFlash({ severity: 'error', message: data.error || 'Gagal mengunggah cookies.' });
        }
      } catch {
        setFlash({ severity: 'error', message: 'Gagal menghubungi server.' });
      } finally {
        setUploading(false);
      }
    },
    [fetchStatuses],
  );

  const handleDelete = useCallback(async (platform: Platform) => {
    setDeleting(true);
    setFlash(null);

    try {
      const res = await fetch(`/api/admin/platform-cookies?platform=${platform}`, {
        method: 'DELETE',
      });

      const data: DeleteResponse = await res.json();

      if (res.ok && data.success) {
        setFlash({ severity: 'success', message: `Cookies ${PLATFORM_META.find((m) => m.id === platform)?.label} berhasil dihapus.` });
        fetchStatuses();
      } else {
        setFlash({ severity: 'error', message: data.error || 'Gagal menghapus cookies.' });
      }
    } catch {
      setFlash({ severity: 'error', message: 'Gagal menghubungi server.' });
    } finally {
      setDeleting(false);
    }
  }, [fetchStatuses]);

  const currentStatus = statuses[tab];
  const currentMeta = PLATFORM_META.find((m) => m.id === tab);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: adminPalette.textPrimary }}>
            Set Cookies
          </Typography>
        </Stack>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 0, pt: '0 !important' }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value as Platform)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          {PLATFORM_META.map((meta) => (
            <Tab
              key={meta.id}
              value={meta.id}
              icon={meta.icon}
              label={meta.label}
              iconPosition="start"
              sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
            />
          ))}
        </Tabs>

        <Stack spacing={2} sx={{ p: 2.5 }}>
          {flash ? <Alert severity={flash.severity} onClose={() => setFlash(null)}>{flash.message}</Alert> : null}
          {fetchError ? <Alert severity="error">{fetchError}</Alert> : null}

          {loading ? (
            <Stack alignItems="center" py={4}>
              <CircularProgress size={32} />
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Paper
                elevation={0}
                sx={{
                  ...adminPanelSx,
                  p: 2,
                  backgroundColor: currentStatus.configured ? adminPalette.successBg : adminPalette.warningBg,
                  borderColor: currentStatus.configured ? adminPalette.successBorder : adminPalette.warningBorder,
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  {currentStatus.configured ? (
                    <CheckIcon sx={{ color: adminPalette.successText }} />
                  ) : currentStatus.source === 'env' ? (
                    <EnvIcon sx={{ color: adminPalette.warningText }} />
                  ) : (
                    <ErrorIcon sx={{ color: adminPalette.dangerText }} />
                  )}
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: adminPalette.textPrimary }}>
                      {currentStatus.configured
                        ? `Cookies terpasang (dari ${currentStatus.source === 'upload' ? 'unggahan' : 'environment'})`
                        : currentStatus.source === 'env'
                          ? 'Menggunakan cookies dari environment'
                          : 'Belum ada cookies terpasang'}
                    </Typography>
                    {currentStatus.configured && currentStatus.source === 'upload' && currentStatus.lastModified ? (
                      <Typography sx={{ fontSize: '0.75rem', color: adminPalette.textMuted, mt: 0.3 }}>
                        Diperbarui: {formatTimestamp(currentStatus.lastModified)}
                        {currentStatus.fileName ? ` • ${currentStatus.fileName}` : ''}
                      </Typography>
                    ) : null}
                  </Box>
                </Stack>
              </Paper>

              <Paper elevation={0} sx={{ ...adminPanelSx, p: 2 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: adminPalette.textPrimary }}>
                      Unggah file cookies
                    </Typography>
                    <Tooltip
                      title={currentMeta?.helpText || ''}
                      placement="top"
                      slotProps={{ tooltip: { sx: { maxWidth: 420, fontSize: '0.76rem', lineHeight: 1.55, whiteSpace: 'pre-line' } } }}
                    >
                      <HelpIcon sx={{ fontSize: 18, color: adminPalette.textMuted, cursor: 'help' }} />
                    </Tooltip>
                  </Stack>

                  <Stack
                    component="label"
                    alignItems="center"
                    justifyContent="center"
                    spacing={1}
                    sx={{
                      border: `2px dashed ${adminPalette.borderStrong}`,
                      borderRadius: 2,
                      p: 3,
                      cursor: uploading ? 'default' : 'pointer',
                      backgroundColor: adminPalette.surfaceSoft,
                      '&:hover': { borderColor: adminPalette.brand, backgroundColor: adminPalette.brandSoft },
                      opacity: uploading ? 0.6 : 1,
                    }}
                  >
                    {uploading ? (
                      <CircularProgress size={24} />
                    ) : (
                      <>
                        <UploadIcon sx={{ fontSize: 32, color: adminPalette.textMuted }} />
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: adminPalette.textSecondary }}>
                          Klik untuk memilih file, atau drag & drop
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: adminPalette.textMuted }}>
                          Format: {currentMeta?.extension} (max 5MB)
                        </Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: adminPalette.textSubtle }}>
                          Cara mendapatkan file: klik ikon (?) di atas
                        </Typography>
                      </>
                    )}

                    <Box
                      component="input"
                      type="file"
                      accept={currentMeta?.extension}
                      onChange={(event) => {
                        const file = (event.target as HTMLInputElement).files?.[0];
                        if (file) {
                          if (file.size > 5 * 1024 * 1024) {
                            setFlash({ severity: 'error', message: 'Ukuran file maksimal 5MB.' });
                            return;
                          }
                          handleUpload(tab, file);
                          (event.target as HTMLInputElement).value = '';
                        }
                      }}
                      disabled={uploading}
                      sx={{ display: 'none' }}
                    />
                  </Stack>

                  {currentStatus.source === 'upload' ? (
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleDelete(tab)}
                      disabled={deleting}
                      sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, alignSelf: 'flex-start' }}
                    >
                      {deleting ? 'Menghapus...' : 'Hapus cookies unggahan (fallback ke env)'}
                    </Button>
                  ) : null}
                </Stack>
              </Paper>

              <Typography sx={{ fontSize: '0.72rem', color: adminPalette.textSubtle, textAlign: 'center' }}>
                Cookies yang diunggah akan digunakan sebagai prioritas utama. Jika dihapus, sistem akan kembali
                menggunakan cookies dari environment variable.
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2 }}>
        <Button onClick={onClose} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}>
          Tutup
        </Button>
      </DialogActions>
    </Dialog>
  );
}
