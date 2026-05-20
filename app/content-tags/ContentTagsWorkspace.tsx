'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
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
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import {
  adminMetricLabelSx,
  adminMetricTileSx,
  adminMetricValueSx,
  adminPalette,
  adminPanelSx,
} from '../lib/adminPalette';
import type { ManagedContentTag } from '../lib/content-tags';
import { deleteUnusedContentTagAction } from './actions';

interface ContentTagsWorkspaceProps {
  tags: ManagedContentTag[];
  initialLoadError?: string | null;
}

type FlashState =
  | { severity: 'success' | 'info' | 'warning' | 'error'; message: string }
  | null;

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

function UsageChip({ label, value }: { label: string; value: number }) {
  return (
    <Chip
      size="small"
      label={`${label}: ${value}`}
      variant={value ? 'filled' : 'outlined'}
      sx={{
        height: 22,
        fontWeight: 700,
        color: value ? adminPalette.brandDark : adminPalette.textMuted,
        backgroundColor: value ? adminPalette.brandSoft : 'transparent',
        borderColor: adminPalette.border,
      }}
    />
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={adminMetricTileSx}>
      <Typography sx={adminMetricLabelSx}>
        {label}
      </Typography>
      <Typography sx={adminMetricValueSx}>
        {value}
      </Typography>
    </Box>
  );
}

export default function ContentTagsWorkspace({ tags, initialLoadError }: ContentTagsWorkspaceProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [flash, setFlash] = useState<FlashState>(
    initialLoadError ? { severity: 'warning', message: initialLoadError } : null,
  );
  const [deleteTarget, setDeleteTarget] = useState<ManagedContentTag | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const filteredTags = useMemo(() => {
    const normalizedSearch = search.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalizedSearch) {
      return tags;
    }

    return tags.filter((tag) => tag.name.toLowerCase().includes(normalizedSearch));
  }, [search, tags]);

  const unusedCount = tags.filter((tag) => tag.total_usage_count === 0).length;
  const usedCount = tags.length - unusedCount;
  const libraryUsageCount = tags.filter((tag) => tag.library_usage_count > 0).length;
  const assetUsageCount = tags.filter((tag) => tag.asset_project_usage_count > 0 || tag.asset_usage_count > 0).length;
  const safePage = Math.min(page, Math.max(Math.ceil(filteredTags.length / rowsPerPage) - 1, 0));
  const paginatedTags = filteredTags.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    startDeleteTransition(async () => {
      const result = await deleteUnusedContentTagAction(target.id);

      if (!result.success) {
        setFlash({ severity: 'error', message: result.error || 'Gagal menghapus tag.' });
        return;
      }

      setDeleteTarget(null);
      setFlash({ severity: 'success', message: `Tag "${target.name}" berhasil dihapus.` });
      router.refresh();
    });
  }

  return (
    <Stack spacing={1.25}>
      {flash ? <Alert severity={flash.severity} onClose={() => setFlash(null)}>{flash.message}</Alert> : null}

      <Paper elevation={0} sx={adminPanelSx}>
        <Stack spacing={1.5} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>
              Content Tags
            </Typography>
            <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
              Content Tags
            </Typography>
            <Typography sx={{ mt: 0.55, fontSize: '0.8rem', color: adminPalette.textMuted }}>
              Kelola daftar tag yang dipakai di Content Library dan Content Assets.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
            <MetricTile label="Total tags" value={tags.length} />
            <MetricTile label="Used tags" value={usedCount} />
            <MetricTile label="Unused" value={unusedCount} />
            <MetricTile label="Library" value={libraryUsageCount} />
            <MetricTile label="Assets" value={assetUsageCount} />
          </Stack>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={adminPanelSx}>
        <Stack spacing={1.3} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <TextField
            size="small"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search tag"
            sx={{ maxWidth: { md: 420 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: adminPalette.textMuted }} /></InputAdornment> }}
          />
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ ...adminPanelSx, overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>Tags</Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>{filteredTags.length} tags total, page {safePage + 1} of {Math.max(Math.ceil(filteredTags.length / rowsPerPage), 1)}</Typography>
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 860 }}>
            <TableHead sx={{ backgroundColor: adminPalette.brand }}>
              <TableRow>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Tag</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Usage</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Created</TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Tidak ada tag yang cocok.</Typography>
                    <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>Coba ubah pencarian tag.</Typography>
                  </TableCell>
                </TableRow>
              ) : paginatedTags.map((tag) => (
                <TableRow key={tag.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{tag.name}</Typography>
                    <Typography sx={{ mt: 0.3, fontSize: '0.72rem', color: adminPalette.textMuted, fontFamily: 'var(--font-geist-mono), monospace' }}>{tag.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                      <UsageChip label="Library" value={tag.library_usage_count} />
                      <UsageChip label="Project" value={tag.asset_project_usage_count} />
                      <UsageChip label="Asset" value={tag.asset_usage_count} />
                      <Chip size="small" label={`Total: ${tag.total_usage_count}`} sx={{ height: 22, fontWeight: 800, color: tag.total_usage_count ? adminPalette.brandDark : adminPalette.successText, backgroundColor: tag.total_usage_count ? adminPalette.brandSoft : adminPalette.successBg }} />
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: adminPalette.textSecondary, fontWeight: 700 }}>{formatDateTime(tag.created_at)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title={tag.total_usage_count > 0 ? 'Tag masih dipakai dan belum bisa dihapus.' : 'Delete unused tag'}>
                      <span>
                        <IconButton size="small" color="error" disabled={tag.total_usage_count > 0} onClick={() => setDeleteTarget(tag)}>
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filteredTags.length}
          page={safePage}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number(event.target.value));
            setPage(0);
          }}
        />
      </Paper>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Delete tag?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: adminPalette.textSecondary }}>
            {`Tag "${deleteTarget?.name || ''}" akan dihapus permanen. Tag hanya bisa dihapus jika usage = 0.`}
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
