'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
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
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import { adminPalette } from '../lib/adminPalette';
import type { ContentAsset } from '../lib/types';
import { deleteContentAssetAction, updateContentAssetAction } from './actions';

interface ContentAssetsWorkspaceProps {
  assets: ContentAsset[];
  initialLoadError?: string | null;
}

type FlashState =
  | { severity: 'success' | 'info' | 'warning' | 'error'; message: string }
  | null;

function formatDateTime(value: string): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

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

function formatSelectedFiles(files: FileList | null): string {
  if (!files?.length) {
    return '';
  }

  if (files.length === 1) {
    return files[0].name;
  }

  return `${files.length} files selected`;
}

function MetricTile({ label, value }: { label: string; value: number }) {
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
      <Box sx={{ width: 96, height: 72, borderRadius: 1.5, display: 'grid', placeItems: 'center', backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
        {isVideo ? <MovieRoundedIcon sx={{ color: adminPalette.textSubtle }} /> : <InsertPhotoRoundedIcon sx={{ color: adminPalette.textSubtle }} />}
      </Box>
    );
  }

  return (
    <Box sx={{ width: 96, height: 72, borderRadius: 1.5, overflow: 'hidden', backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
      {isVideo ? (
        <Box component="video" src={asset.signed_url} muted controls sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <Box component="img" src={asset.signed_url} alt={asset.original_filename} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
    </Box>
  );
}

export default function ContentAssetsWorkspace({ assets, initialLoadError }: ContentAssetsWorkspaceProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [flash, setFlash] = useState<FlashState>(
    initialLoadError ? { severity: 'warning', message: initialLoadError } : null,
  );
  const [selectedFileLabel, setSelectedFileLabel] = useState('');
  const [editTarget, setEditTarget] = useState<ContentAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentAsset | null>(null);
  const [isUploading, startUploadTransition] = useTransition();
  const [isSavingEdit, startEditTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const imageCount = assets.filter((asset) => asset.mime_type.startsWith('image/')).length;
  const videoCount = assets.filter((asset) => asset.mime_type.startsWith('video/')).length;

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
        setSelectedFileLabel('');
        setFlash({ severity: 'success', message: `${result.count ?? 0} asset berhasil diupload.` });
        router.refresh();
      } else {
        setFlash({ severity: 'error', message: result?.error || 'Gagal upload asset.' });
      }
    });
  }

  function handleEdit(formData: FormData) {
    setFlash(null);
    startEditTransition(async () => {
      const result = await updateContentAssetAction(formData);
      if (result.success) {
        setEditTarget(null);
        setFlash({ severity: 'success', message: 'Asset berhasil diubah.' });
        router.refresh();
      } else {
        setFlash({ severity: 'error', message: result.error || 'Gagal mengubah asset.' });
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

      <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface, boxShadow: 'none' }}>
        <Stack spacing={1.5} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
              <MetricTile label="Total Assets" value={assets.length} />
              <MetricTile label="Images" value={imageCount} />
              <MetricTile label="Videos" value={videoCount} />
            </Stack>
          </Stack>

          <Box component="form" ref={formRef} action={handleUpload}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', lg: 'flex-start' }}>
              <TextField name="project_name" label="Nama project" required size="small" sx={{ minWidth: { lg: 240 } }} disabled={isUploading} />
              <Button
                component="label"
                variant="outlined"
                startIcon={<UploadFileRoundedIcon />}
                sx={{ minHeight: 40, borderRadius: 2, textTransform: 'none', fontWeight: 700, borderColor: adminPalette.borderStrong, color: adminPalette.textSecondary }}
                disabled={isUploading}
              >
                {selectedFileLabel || 'Pilih image/video'}
                <Box
                  component="input"
                  name="asset_files"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(event) => setSelectedFileLabel(formatSelectedFiles(event.target.files))}
                  sx={{ display: 'none' }}
                />
              </Button>
              <TextField name="notes" label="Notes" size="small" multiline minRows={1} sx={{ flex: 1 }} disabled={isUploading} />
              <Button type="submit" variant="contained" disabled={isUploading} sx={{ minHeight: 40, borderRadius: 2, backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
                {isUploading ? 'Uploading...' : 'Upload Asset'}
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, overflow: 'hidden', backgroundColor: adminPalette.surface }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>Asset Drafts</Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>File image/video tersimpan di Supabase Storage bucket content-assets.</Typography>
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1040 }}>
            <TableHead sx={{ backgroundColor: adminPalette.brand }}>
              <TableRow>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Preview</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Timestamp</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Uploader</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Project</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Filename</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Notes</TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Belum ada asset draft.</Typography>
                    <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>Upload image atau video pertama untuk project konten.</Typography>
                  </TableCell>
                </TableRow>
              ) : assets.map((asset) => (
                <TableRow key={asset.id} hover>
                  <TableCell><AssetPreview asset={asset} /></TableCell>
                  <TableCell sx={{ color: adminPalette.textSecondary, fontWeight: 700 }}>{formatDateTime(asset.created_at)}</TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{asset.uploader}</Typography>
                    {asset.uploader_email ? <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>{asset.uploader_email}</Typography> : null}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{asset.project_name}</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography sx={{ fontWeight: 700, color: adminPalette.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.original_filename}</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                      <Chip size="small" label={asset.mime_type.startsWith('video/') ? 'Video' : 'Image'} sx={{ height: 22, fontWeight: 700, color: adminPalette.brandDark, backgroundColor: adminPalette.brandSoft }} />
                      <Chip size="small" label={formatBytes(asset.file_size)} variant="outlined" sx={{ height: 22, fontWeight: 700, borderColor: adminPalette.border }} />
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 300, color: adminPalette.textSecondary }}>{asset.notes || '-'}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                      <Button size="small" startIcon={<EditRoundedIcon />} onClick={() => setEditTarget(asset)} sx={{ textTransform: 'none', fontWeight: 700 }}>
                        Edit
                      </Button>
                      <Button color="error" size="small" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => setDeleteTarget(asset)} sx={{ textTransform: 'none', fontWeight: 700 }}>
                        Delete
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog key={editTarget?.id || 'edit-asset'} open={Boolean(editTarget)} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <Box component="form" action={handleEdit}>
          <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Edit asset</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <Box component="input" type="hidden" name="id" value={editTarget?.id || ''} />
              <TextField
                name="project_name"
                label="Nama project"
                required
                fullWidth
                defaultValue={editTarget?.project_name || ''}
                disabled={isSavingEdit}
              />
              <TextField
                name="notes"
                label="Notes"
                multiline
                minRows={4}
                fullWidth
                defaultValue={editTarget?.notes || ''}
                disabled={isSavingEdit}
              />
              <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textMuted }}>
                File object storage tidak diganti dari dialog ini. Metadata yang bisa diedit adalah project dan notes.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, pt: 1 }}>
            <Button onClick={() => setEditTarget(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={isSavingEdit} sx={{ backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
              {isSavingEdit ? 'Saving...' : 'Save'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

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
