'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
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
  Typography,
} from '@mui/material';

import { adminPalette, adminTableHeaderCellSx } from '../lib/adminPalette';

type BlastSource = 'manual' | 'csv' | 'group' | 'contact';
type ScheduleType = 'once' | 'recurring';
type RecurrenceType = 'daily' | 'weekly' | 'monthly';
type ScheduleStatus = 'active' | 'paused' | 'completed' | 'cancelled';

interface ScheduledBlastRun {
  status: 'running' | 'queued' | 'partial' | 'failed' | 'skipped';
  total_recipients: number;
  accepted_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
}

export interface ScheduledBlastSummary {
  id: string;
  name: string;
  message: string;
  source: BlastSource;
  groupNames: string[];
  sourceFile: string | null;
  scheduleType: ScheduleType;
  recurrenceType: RecurrenceType | null;
  timezone: string;
  runAt: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  status: ScheduleStatus;
  saveToGroup: boolean;
  saveGroupName: string | null;
  recipientCount: number;
  lastRun: ScheduledBlastRun | null;
  createdAt: string;
  updatedAt: string;
}

interface ScheduledBlastPanelProps {
  initialData: ScheduledBlastListResponse;
}

interface ScheduledBlastListResponse {
  items: ScheduledBlastSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const QUIET_BUTTON_SX = {
  minHeight: 34,
  borderRadius: 2,
  borderColor: adminPalette.borderStrong,
  color: adminPalette.textSecondary,
  backgroundColor: adminPalette.surface,
  textTransform: 'none',
  fontWeight: 700,
  boxShadow: 'none',
  '&:hover': {
    borderColor: adminPalette.brandSoftStrong,
    backgroundColor: adminPalette.brandSoft,
    boxShadow: 'none',
  },
} as const;

const PRIMARY_BUTTON_SX = {
  minHeight: 34,
  borderRadius: 2,
  px: 1.8,
  backgroundColor: adminPalette.brand,
  textTransform: 'none',
  fontWeight: 700,
  boxShadow: 'none',
  '&:hover': {
    backgroundColor: adminPalette.brandDark,
    boxShadow: 'none',
  },
} as const;

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function sourceLabel(source: BlastSource): string {
  if (source === 'contact') return 'Kontak';
  if (source === 'group') return 'Grup';
  if (source === 'csv') return 'CSV';
  return 'Manual';
}

function recurrenceLabel(type: RecurrenceType | null): string {
  if (type === 'daily') return 'Harian';
  if (type === 'weekly') return 'Mingguan';
  if (type === 'monthly') return 'Bulanan';
  return 'Sekali';
}

function toDatetimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

export default function ScheduledBlastPanel({ initialData }: ScheduledBlastPanelProps) {
  const [items, setItems] = useState(initialData.items);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScheduleStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<BlastSource | 'all'>('all');
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<ScheduleType | 'all'>('all');
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ScheduledBlastSummary | null>(null);
  const [editName, setEditName] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editScheduleType, setEditScheduleType] = useState<ScheduleType>('once');
  const [editRunAt, setEditRunAt] = useState('');
  const [editRecurrenceType, setEditRecurrenceType] = useState<RecurrenceType>('daily');

  const fetchItems = async (input: {
    page: number;
    pageSize: number;
    search: string;
    statusFilter: ScheduleStatus | 'all';
    sourceFilter: BlastSource | 'all';
    scheduleTypeFilter: ScheduleType | 'all';
  }) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    });
    if (input.search.trim()) params.set('search', input.search.trim());
    if (input.statusFilter !== 'all') params.set('status', input.statusFilter);
    if (input.sourceFilter !== 'all') params.set('source', input.sourceFilter);
    if (input.scheduleTypeFilter !== 'all') params.set('scheduleType', input.scheduleTypeFilter);

    const response = await fetch(`/api/admin/scheduled-blasts?${params.toString()}`, { cache: 'no-store' });
    const payload = (await response.json()) as Partial<ScheduledBlastListResponse> & { error?: string };
    setLoading(false);

    if (!response.ok) {
      setStatus({ type: 'error', message: payload.error || 'Gagal memuat scheduled blast.' });
      return;
    }

    setItems(payload.items || []);
    setTotal(payload.total || 0);
  };

  const loadItems = (overrides: Partial<Parameters<typeof fetchItems>[0]> = {}) => fetchItems({
    page,
    pageSize,
    search,
    statusFilter,
    sourceFilter,
    scheduleTypeFilter,
    ...overrides,
  });

  useEffect(() => {
    const handler = () => {
      void fetchItems({
        page: 1,
        pageSize: initialData.pageSize,
        search: '',
        statusFilter: 'all',
        sourceFilter: 'all',
        scheduleTypeFilter: 'all',
      });
    };

    window.addEventListener('scheduled-blasts-refresh', handler);
    return () => window.removeEventListener('scheduled-blasts-refresh', handler);
  }, [initialData.pageSize]);

  const openEdit = (item: ScheduledBlastSummary) => {
    setEditing(item);
    setEditName(item.name);
    setEditMessage(item.message);
    setEditScheduleType(item.scheduleType);
    setEditRunAt(toDatetimeLocal(item.runAt || item.nextRunAt));
    setEditRecurrenceType(item.recurrenceType || 'daily');
  };

  const patchItem = async (id: string, body: Record<string, unknown>, successMessage: string) => {
    const response = await fetch(`/api/admin/scheduled-blasts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setStatus({ type: 'error', message: payload.error || 'Gagal memperbarui scheduled blast.' });
      return;
    }

    setStatus({ type: 'success', message: successMessage });
    await loadItems();
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    await patchItem(
      editing.id,
      {
        name: editName,
        message: editMessage,
        scheduleType: editScheduleType,
        recurrenceType: editScheduleType === 'recurring' ? editRecurrenceType : null,
        runAt: editRunAt ? new Date(editRunAt).toISOString() : null,
      },
      'Scheduled blast berhasil diperbarui.',
    );
    setEditing(null);
  };

  const handleRunNow = async (id: string) => {
    const response = await fetch(`/api/admin/scheduled-blasts/${id}/run-now`, { method: 'POST' });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setStatus({ type: 'error', message: payload.error || 'Scheduled blast gagal dijalankan.' });
      return;
    }

    setStatus({ type: 'success', message: 'Scheduled blast masuk ke antrian.' });
    await loadItems();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Hapus scheduled blast ini?')) return;
    const response = await fetch(`/api/admin/scheduled-blasts/${id}`, { method: 'DELETE' });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setStatus({ type: 'error', message: payload.error || 'Gagal menghapus scheduled blast.' });
      return;
    }

    setStatus({ type: 'success', message: 'Scheduled blast berhasil dihapus.' });
    await loadItems();
  };

  return (
    <Paper elevation={0} sx={{ mt: 1.25, overflow: 'hidden', borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface, boxShadow: 'none' }}>
      <Stack spacing={1} sx={{ px: { xs: 1.25, md: 1.5 }, py: 1.2, borderBottom: `1px solid ${adminPalette.border}` }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>Scheduled blast</Typography>
            <Typography sx={{ mt: 0.35, fontSize: '0.84rem', color: adminPalette.textMuted }}>
              Pantau schedule aktif, jalankan manual, ubah timing, pause, atau hapus schedule.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={() => void loadItems()} disabled={loading} sx={QUIET_BUTTON_SX}>
            {loading ? 'Memuat...' : 'Refresh'}
          </Button>
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            value={search}
            onChange={(event) => {
              const nextSearch = event.target.value;
              setSearch(nextSearch);
              setPage(1);
              void loadItems({ page: 1, search: nextSearch });
            }}
            placeholder="Cari nama atau pesan"
            size="small"
            sx={{ minWidth: { md: 260 }, '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
          />
          <TextField
            select
            label="Status"
            value={statusFilter}
            onChange={(event) => {
              const nextStatus = event.target.value as ScheduleStatus | 'all';
              setStatusFilter(nextStatus);
              setPage(1);
              void loadItems({ page: 1, statusFilter: nextStatus });
            }}
            size="small"
            sx={{ minWidth: { md: 150 } }}
          >
            <MenuItem value="all">Semua status</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="paused">Paused</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </TextField>
          <TextField
            select
            label="Sumber"
            value={sourceFilter}
            onChange={(event) => {
              const nextSource = event.target.value as BlastSource | 'all';
              setSourceFilter(nextSource);
              setPage(1);
              void loadItems({ page: 1, sourceFilter: nextSource });
            }}
            size="small"
            sx={{ minWidth: { md: 150 } }}
          >
            <MenuItem value="all">Semua sumber</MenuItem>
            <MenuItem value="manual">Manual</MenuItem>
            <MenuItem value="csv">CSV</MenuItem>
            <MenuItem value="contact">Kontak</MenuItem>
            <MenuItem value="group">Grup</MenuItem>
          </TextField>
          <TextField
            select
            label="Tipe"
            value={scheduleTypeFilter}
            onChange={(event) => {
              const nextScheduleType = event.target.value as ScheduleType | 'all';
              setScheduleTypeFilter(nextScheduleType);
              setPage(1);
              void loadItems({ page: 1, scheduleTypeFilter: nextScheduleType });
            }}
            size="small"
            sx={{ minWidth: { md: 150 } }}
          >
            <MenuItem value="all">Semua tipe</MenuItem>
            <MenuItem value="once">Sekali</MenuItem>
            <MenuItem value="recurring">Periodik</MenuItem>
          </TextField>
        </Stack>
        {status ? <Alert severity={status.type} sx={{ borderRadius: 2.5 }}>{status.message}</Alert> : null}
      </Stack>

      {items.length ? (
        <TableContainer>
          <Table size="small" sx={{ minWidth: 980, '& .MuiTableCell-root': { borderBottom: `1px solid ${adminPalette.border}` } }}>
            <TableHead sx={{ backgroundColor: adminPalette.brand }}>
              <TableRow>
                {['Nama', 'Sumber', 'Schedule', 'Next run', 'Last run', 'Status', 'Aksi'].map((label) => (
                  <TableCell key={label} sx={adminTableHeaderCellSx}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} hover sx={{ '&:hover': { backgroundColor: adminPalette.brandSoft } }}>
                  <TableCell sx={{ py: 0.9, minWidth: 220 }}>
                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: adminPalette.textPrimary }}>{item.name}</Typography>
                    <Typography sx={{ mt: 0.3, fontSize: '0.76rem', color: adminPalette.textMuted }} noWrap>{item.message}</Typography>
                  </TableCell>
                  <TableCell sx={{ py: 0.9 }}>
                    <Chip label={sourceLabel(item.source)} size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} />
                    <Typography sx={{ mt: 0.5, fontSize: '0.76rem', color: adminPalette.textMuted }}>
                      {item.source === 'group' ? `${item.groupNames.length} grup dinamis` : `${item.recipientCount} penerima`}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ py: 0.9 }}>
                    <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textPrimary }}>{recurrenceLabel(item.recurrenceType)}</Typography>
                  </TableCell>
                  <TableCell sx={{ py: 0.9 }}>
                    <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>{formatDate(item.nextRunAt)}</Typography>
                  </TableCell>
                  <TableCell sx={{ py: 0.9 }}>
                    <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>{formatDate(item.lastRunAt)}</Typography>
                    {item.lastRun?.error_message ? <Typography sx={{ fontSize: '0.74rem', color: adminPalette.dangerText }}>{item.lastRun.error_message}</Typography> : null}
                  </TableCell>
                  <TableCell sx={{ py: 0.9 }}>
                    <Chip label={item.status} size="small" variant={item.status === 'active' ? 'filled' : 'outlined'} sx={{ fontWeight: 700 }} />
                  </TableCell>
                  <TableCell sx={{ py: 0.9, minWidth: 330 }}>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      <Button variant="outlined" onClick={() => openEdit(item)} sx={QUIET_BUTTON_SX}>Update</Button>
                      <Button variant="outlined" onClick={() => patchItem(item.id, { status: item.status === 'active' ? 'paused' : 'active' }, item.status === 'active' ? 'Schedule dipause.' : 'Schedule diaktifkan.')} disabled={item.status === 'completed'} sx={QUIET_BUTTON_SX}>
                        {item.status === 'active' ? 'Pause' : 'Resume'}
                      </Button>
                      <Button variant="outlined" onClick={() => handleRunNow(item.id)} sx={QUIET_BUTTON_SX}>Run now</Button>
                      <Button variant="text" color="error" onClick={() => handleDelete(item.id)} sx={{ textTransform: 'none', fontWeight: 700 }}>Delete</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Alert severity="info" sx={{ m: 1.5, borderRadius: 2.5 }}>
          Belum ada scheduled blast. Susun pesan di atas lalu klik Jadwalkan.
        </Alert>
      )}

      <TablePagination
        component="div"
        count={total}
        page={Math.max(0, page - 1)}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[5, 10, 20, 50, 100]}
        onPageChange={(_, nextPage) => {
          const nextPageNumber = nextPage + 1;
          setPage(nextPageNumber);
          void loadItems({ page: nextPageNumber });
        }}
        onRowsPerPageChange={(event) => {
          const nextPageSize = Number(event.target.value);
          setPageSize(nextPageSize);
          setPage(1);
          void loadItems({ page: 1, pageSize: nextPageSize });
        }}
      />

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Update scheduled blast</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField label="Nama schedule" value={editName} onChange={(event) => setEditName(event.target.value)} size="small" fullWidth />
            <TextField label="Pesan" value={editMessage} onChange={(event) => setEditMessage(event.target.value)} size="small" fullWidth multiline minRows={4} />
            <TextField select label="Tipe schedule" value={editScheduleType} onChange={(event) => setEditScheduleType(event.target.value as ScheduleType)} size="small" fullWidth>
              <MenuItem value="once">Sekali kirim</MenuItem>
              <MenuItem value="recurring">Periodik</MenuItem>
            </TextField>
            <TextField label={editScheduleType === 'once' ? 'Waktu kirim' : 'Mulai kirim'} type="datetime-local" value={editRunAt} onChange={(event) => setEditRunAt(event.target.value)} size="small" fullWidth InputLabelProps={{ shrink: true }} />
            {editScheduleType === 'recurring' ? (
              <TextField select label="Pengulangan" value={editRecurrenceType} onChange={(event) => setEditRecurrenceType(event.target.value as RecurrenceType)} size="small" fullWidth>
                <MenuItem value="daily">Setiap hari</MenuItem>
                <MenuItem value="weekly">Setiap minggu</MenuItem>
                <MenuItem value="monthly">Setiap bulan</MenuItem>
              </TextField>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setEditing(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Batal</Button>
          <Button variant="contained" onClick={handleSaveEdit} sx={PRIMARY_BUTTON_SX}>Simpan</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
