'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import InsertPhotoRoundedIcon from '@mui/icons-material/InsertPhotoRounded';
import MovieRoundedIcon from '@mui/icons-material/MovieRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import { adminPalette } from '../../lib/adminPalette';
import type { ContentAsset, ContentAssetProject } from '../../lib/types';
import { deleteContentAssetAction } from '../actions';

interface ContentAssetDetailWorkspaceProps {
  project: ContentAssetProject;
  assets: ContentAsset[];
  initialLoadError?: string | null;
}

type FlashState =
  | { severity: 'success' | 'info' | 'warning' | 'error'; message: string }
  | null;

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '-';
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getFileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatSelectedFiles(files: readonly File[]): string {
  if (!files.length) {
    return 'Belum ada file dipilih';
  }

  return `${files.length} file siap upload`;
}

function MetricTile({ label, value }: { label: string; value: number | string }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        px: { xs: 0, sm: 1.4 },
        py: 0.1,
        borderLeft: { sm: `1px solid ${adminPalette.border}` },
        '&:first-of-type': { pl: 0, borderLeft: 'none' },
      }}
    >
      <Typography sx={{ fontSize: '0.63rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: adminPalette.textMuted }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.4, fontSize: { xs: '1rem', sm: '1.12rem' }, fontWeight: 700, lineHeight: 1, color: adminPalette.brandDark }}>
        {value}
      </Typography>
    </Box>
  );
}

function AssetPreview({ asset }: { asset: ContentAsset }) {
  const isVideo = asset.mime_type.startsWith('video/');

  if (!asset.signed_url) {
    return (
      <Box sx={{ aspectRatio: '16 / 10', display: 'grid', placeItems: 'center', backgroundColor: adminPalette.surfaceSoft }}>
        {isVideo ? <MovieRoundedIcon sx={{ color: adminPalette.textSubtle }} /> : <InsertPhotoRoundedIcon sx={{ color: adminPalette.textSubtle }} />}
      </Box>
    );
  }

  return isVideo ? (
    <Box component="video" src={asset.signed_url} muted controls sx={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block', backgroundColor: '#000000' }} />
  ) : (
    <Box component="img" src={asset.signed_url} alt={asset.original_filename} sx={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block', backgroundColor: adminPalette.surfaceSoft }} />
  );
}

export default function ContentAssetDetailWorkspace({ project, assets, initialLoadError }: ContentAssetDetailWorkspaceProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [flash, setFlash] = useState<FlashState>(
    initialLoadError ? { severity: 'warning', message: initialLoadError } : null,
  );
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ContentAsset | null>(null);
  const [isUploading, startUploadTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const imageCount = assets.filter((asset) => asset.mime_type.startsWith('image/')).length;
  const videoCount = assets.filter((asset) => asset.mime_type.startsWith('video/')).length;
  const totalSize = assets.reduce((total, asset) => total + asset.file_size, 0);

  function syncFileInput(files: readonly File[]) {
    if (!fileInputRef.current) {
      return;
    }

    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    fileInputRef.current.files = dataTransfer.files;
  }

  function updateSelectedFiles(files: File[]) {
    setSelectedFiles(files);
    syncFileInput(files);
  }

  function handleFileSelection(files: FileList | null) {
    const incomingFiles = Array.from(files || []);
    if (!incomingFiles.length) {
      syncFileInput(selectedFiles);
      return;
    }

    const selectedFileKeys = new Set(selectedFiles.map(getFileKey));
    const nextFiles = [...selectedFiles];

    incomingFiles.forEach((file) => {
      const fileKey = getFileKey(file);
      if (!selectedFileKeys.has(fileKey)) {
        selectedFileKeys.add(fileKey);
        nextFiles.push(file);
      }
    });

    updateSelectedFiles(nextFiles);
  }

  function removeSelectedFile(file: File) {
    updateSelectedFiles(selectedFiles.filter((candidate) => getFileKey(candidate) !== getFileKey(file)));
  }

  function clearSelectedFiles() {
    updateSelectedFiles([]);
  }

  function handleUpload(formData: FormData) {
    setFlash(null);
    startUploadTransition(async () => {
      const response = await fetch('/api/admin/content-assets/upload', {
        method: 'POST',
        body: formData,
      });
      const result = (await response.json().catch(() => null)) as { success?: boolean; count?: number; error?: string } | null;

      if (result?.success) {
        formRef.current?.reset();
        updateSelectedFiles([]);
        setFlash({ severity: 'success', message: `${result.count ?? 0} asset berhasil diupload.` });
        router.refresh();
      } else {
        setFlash({ severity: 'error', message: result?.error || 'Gagal upload asset.' });
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    const targetId = deleteTarget.id;
    startDeleteTransition(async () => {
      const result = await deleteContentAssetAction(targetId);
      setDeleteTarget(null);
      setFlash(
        result.success
          ? { severity: 'success', message: 'Asset berhasil dihapus.' }
          : { severity: 'error', message: result.error || 'Gagal menghapus asset.' },
      );
      if (result.success) {
        router.refresh();
      }
    });
  }

  return (
    <Stack spacing={1.25}>
      {flash ? <Alert severity={flash.severity} onClose={() => setFlash(null)}>{flash.message}</Alert> : null}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Button component={Link} href="/content-assets" startIcon={<ArrowBackRoundedIcon />} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, textTransform: 'none', fontWeight: 700 }}>
          Back to projects
        </Button>
        <Stack direction="row" spacing={{ xs: 1, sm: 0.5 }} useFlexGap flexWrap="wrap">
          <MetricTile label="Assets" value={assets.length} />
          <MetricTile label="Images" value={imageCount} />
          <MetricTile label="Videos" value={videoCount} />
          <MetricTile label="Size" value={formatBytes(totalSize)} />
        </Stack>
      </Stack>

      <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface, boxShadow: 'none' }}>
        <Box component="form" ref={formRef} action={handleUpload} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Box component="input" type="hidden" name="project_id" value={project.id} />
          <Stack spacing={1.25}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', lg: 'flex-start' }}>
              <Button
                component="label"
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                sx={{ minHeight: 40, borderRadius: 2, textTransform: 'none', fontWeight: 700, borderColor: adminPalette.borderStrong, color: adminPalette.textSecondary }}
                disabled={isUploading}
              >
                Tambah file
                <Box
                  component="input"
                  name="asset_files"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  ref={fileInputRef}
                  onChange={(event) => handleFileSelection(event.target.files)}
                  sx={{ display: 'none' }}
                />
              </Button>
              <TextField name="notes" label="Notes upload" size="small" multiline minRows={1} sx={{ flex: 1 }} disabled={isUploading} />
              <Button type="submit" variant="contained" startIcon={<UploadFileRoundedIcon />} disabled={isUploading || selectedFiles.length === 0} sx={{ minHeight: 40, borderRadius: 2, backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
                {isUploading ? 'Uploading...' : 'Upload Asset'}
              </Button>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Typography sx={{ fontSize: '0.84rem', color: selectedFiles.length ? adminPalette.textSecondary : adminPalette.textMuted, fontWeight: 700 }}>
                {formatSelectedFiles(selectedFiles)}
              </Typography>
              {selectedFiles.length ? (
                <Button size="small" onClick={clearSelectedFiles} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, textTransform: 'none', fontWeight: 700 }}>
                  Clear
                </Button>
              ) : null}
            </Stack>

            {selectedFiles.length ? (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {selectedFiles.map((file) => (
                  <Chip
                    key={getFileKey(file)}
                    label={`${file.name} (${formatBytes(file.size)})`}
                    onDelete={() => removeSelectedFile(file)}
                    deleteIcon={<CloseRoundedIcon />}
                    sx={{ maxWidth: { xs: '100%', sm: 360 }, borderColor: adminPalette.border, fontWeight: 700 }}
                    variant="outlined"
                  />
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, overflow: 'hidden', backgroundColor: adminPalette.surface }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>Uploaded Assets</Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>Preview asset yang sudah tersimpan untuk project ini.</Typography>
        </Box>

        {assets.length === 0 ? (
          <Box sx={{ py: 6, px: 2, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Belum ada asset di project ini.</Typography>
            <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>Gunakan tombol tambah file untuk memilih beberapa file, lalu upload.</Typography>
          </Box>
        ) : (
          <Box sx={{ p: { xs: 1.5, md: 2 }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
            {assets.map((asset) => (
              <Paper key={asset.id} elevation={0} sx={{ overflow: 'hidden', borderRadius: 1.5, border: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface }}>
                <AssetPreview asset={asset} />
                <Stack spacing={0.8} sx={{ p: 1.2 }}>
                  <Stack direction="row" spacing={0.75} justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.original_filename}</Typography>
                      <Typography sx={{ mt: 0.3, fontSize: '0.76rem', color: adminPalette.textMuted }}>{formatDateTime(asset.created_at)}</Typography>
                    </Box>
                    <Tooltip title="Delete asset">
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(asset)}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                    <Chip size="small" label={asset.mime_type.startsWith('video/') ? 'Video' : 'Image'} sx={{ height: 22, fontWeight: 700, color: adminPalette.brandDark, backgroundColor: adminPalette.brandSoft }} />
                    <Chip size="small" label={formatBytes(asset.file_size)} variant="outlined" sx={{ height: 22, fontWeight: 700, borderColor: adminPalette.border }} />
                  </Stack>
                  {asset.notes ? <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>{asset.notes}</Typography> : null}
                </Stack>
              </Paper>
            ))}
          </Box>
        )}
      </Paper>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Delete asset?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: adminPalette.textSecondary }}>
            {`File "${deleteTarget?.original_filename || ''}" akan dihapus dari database dan Supabase Storage.`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={isDeleting} sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
