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
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import { adminPalette } from '../lib/adminPalette';
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

export default function ContentTagsWorkspace({ tags, initialLoadError }: ContentTagsWorkspaceProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
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

      <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface }}>
        <Stack spacing={1.3} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
            <Chip size="small" label={`${tags.length} tags`} sx={{ fontWeight: 700, color: adminPalette.brandDark, backgroundColor: adminPalette.brandSoft }} />
            <Chip size="small" label={`${unusedCount} unused`} variant="outlined" sx={{ fontWeight: 700, borderColor: adminPalette.borderStrong, color: adminPalette.textSecondary }} />
          </Stack>
          <TextField
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tag"
            sx={{ maxWidth: { md: 420 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: adminPalette.textMuted }} /></InputAdornment> }}
          />
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, overflow: 'hidden', backgroundColor: adminPalette.surface }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>Tags</Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>{filteredTags.length} tags shown.</Typography>
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
              ) : filteredTags.map((tag) => (
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
