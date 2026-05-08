'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import InsertPhotoRoundedIcon from '@mui/icons-material/InsertPhotoRounded';
import MovieRoundedIcon from '@mui/icons-material/MovieRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import type { ContentAsset, ContentAssetProject } from '../lib/types';
import { createContentAssetProjectAction } from './actions';

interface ContentAssetsWorkspaceProps {
  projects: ContentAssetProject[];
  initialLoadError?: string | null;
}

type FlashState =
  | { severity: 'success' | 'info' | 'warning' | 'error'; message: string }
  | null;

function formatDateTime(value: string | null): string {
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

function ProjectPreview({ asset }: { asset: ContentAsset | null }) {
  if (!asset?.signed_url) {
    return (
      <Box sx={{ width: 86, height: 62, borderRadius: 1.5, display: 'grid', placeItems: 'center', backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
        <FolderRoundedIcon sx={{ color: adminPalette.textSubtle }} />
      </Box>
    );
  }

  const isVideo = asset.mime_type.startsWith('video/');

  return (
    <Box sx={{ width: 86, height: 62, borderRadius: 1.5, overflow: 'hidden', backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
      {isVideo ? (
        <Box component="video" src={asset.signed_url} muted sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <Box component="img" src={asset.signed_url} alt={asset.original_filename} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
    </Box>
  );
}

export default function ContentAssetsWorkspace({ projects, initialLoadError }: ContentAssetsWorkspaceProps) {
  const router = useRouter();
  const [flash, setFlash] = useState<FlashState>(
    initialLoadError ? { severity: 'warning', message: initialLoadError } : null,
  );
  const [isCreating, startCreateTransition] = useTransition();

  const totalAssets = projects.reduce((total, project) => total + project.asset_count, 0);
  const totalImages = projects.reduce((total, project) => total + project.image_count, 0);
  const totalVideos = projects.reduce((total, project) => total + project.video_count, 0);

  function handleCreateProject(formData: FormData) {
    setFlash(null);
    startCreateTransition(async () => {
      const result = await createContentAssetProjectAction(formData);
      if (result.success && result.projectId) {
        router.push(`/content-assets/${result.projectId}`);
      } else {
        setFlash({ severity: 'error', message: result.error || 'Gagal membuat project asset.' });
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
              <MetricTile label="Projects" value={projects.length} />
              <MetricTile label="Assets" value={totalAssets} />
              <MetricTile label="Images" value={totalImages} />
              <MetricTile label="Videos" value={totalVideos} />
            </Stack>
          </Stack>

          <Box component="form" action={handleCreateProject}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', lg: 'flex-start' }}>
              <TextField name="project_name" label="Nama project" required size="small" sx={{ minWidth: { lg: 280 } }} disabled={isCreating} />
              <TextField name="notes" label="Notes project" size="small" multiline minRows={1} sx={{ flex: 1 }} disabled={isCreating} />
              <Button type="submit" variant="contained" disabled={isCreating} sx={{ minHeight: 40, borderRadius: 2, backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
                {isCreating ? 'Creating...' : 'Init Project'}
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, overflow: 'hidden', backgroundColor: adminPalette.surface }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>Asset Projects</Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>Klik project untuk membuka detail dan upload kumpulan asset.</Typography>
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead sx={{ backgroundColor: adminPalette.brand }}>
              <TableRow>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Preview</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Project</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Assets</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Created By</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Latest Asset</TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Belum ada asset project.</Typography>
                    <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>Init project pertama, lalu upload file di halaman detail project.</Typography>
                  </TableCell>
                </TableRow>
              ) : projects.map((project) => (
                <TableRow
                  key={project.id}
                  hover
                  sx={{ textDecoration: 'none' }}
                >
                  <TableCell><ProjectPreview asset={project.preview_asset} /></TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{project.project_name}</Typography>
                    {project.notes ? <Typography sx={{ mt: 0.4, maxWidth: 360, fontSize: '0.8rem', color: adminPalette.textSecondary }}>{project.notes}</Typography> : null}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                      <Chip size="small" label={`${project.asset_count} file`} sx={{ height: 22, fontWeight: 700, color: adminPalette.brandDark, backgroundColor: adminPalette.brandSoft }} />
                      <Chip size="small" icon={<InsertPhotoRoundedIcon />} label={project.image_count} variant="outlined" sx={{ height: 22, fontWeight: 700, borderColor: adminPalette.border }} />
                      <Chip size="small" icon={<MovieRoundedIcon />} label={project.video_count} variant="outlined" sx={{ height: 22, fontWeight: 700, borderColor: adminPalette.border }} />
                      <Chip size="small" label={formatBytes(project.total_file_size)} variant="outlined" sx={{ height: 22, fontWeight: 700, borderColor: adminPalette.border }} />
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{project.created_by}</Typography>
                    {project.created_by_email ? <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>{project.created_by_email}</Typography> : null}
                  </TableCell>
                  <TableCell sx={{ color: adminPalette.textSecondary, fontWeight: 700 }}>{formatDateTime(project.latest_asset_at)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                      <Button
                        component="a"
                        href={project.asset_count ? `/api/admin/content-assets/projects/${project.id}/download` : undefined}
                        size="small"
                        startIcon={<ArchiveRoundedIcon />}
                        disabled={project.asset_count === 0}
                        sx={{ textTransform: 'none', fontWeight: 700 }}
                      >
                        ZIP
                      </Button>
                      <Button component={Link} href={`/content-assets/${project.id}`} size="small" endIcon={<ArrowForwardRoundedIcon />} sx={{ textTransform: 'none', fontWeight: 700 }}>
                        Detail
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}
