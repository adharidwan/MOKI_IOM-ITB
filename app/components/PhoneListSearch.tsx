'use client';

import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
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
import type { CsvContact } from '../lib/types';
import {
  assignContactGroupAction,
  deleteContactAction,
  deleteContactsBulkAction,
  updateContactAction,
} from '../contacts/actions';

interface PhoneListTableProps {
  contacts: CsvContact[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  currentSearch: string;
  currentGroupName: string;
}

interface ContactFilters {
  keyword: string;
  groupName: string;
}

type DeleteState =
  | { mode: 'single'; contact: CsvContact }
  | { mode: 'bulk' }
  | null;

const GENDER_OPTIONS = ['Laki-laki', 'Perempuan', 'Tidak diketahui'];

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

const QUIET_TAG_SX = {
  height: 22,
  borderRadius: 1.75,
  backgroundColor: adminPalette.brandSoft,
  color: adminPalette.brandDark,
  border: `1px solid ${adminPalette.brandSoftStrong}`,
  fontSize: '0.71rem',
  fontWeight: 600,
} as const;

function formatCompactDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

function getContactStatus(contact: CsvContact) {
  if (contact.group_names.length > 0) {
    return {
      label: 'Ready',
      backgroundColor: adminPalette.successBg,
      color: adminPalette.successText,
    };
  }

  return {
    label: 'Needs group',
    backgroundColor: adminPalette.warningBg,
    color: adminPalette.warningText,
  };
}

export default function PhoneListTable({
  contacts,
  totalCount,
  currentPage,
  totalPages,
  currentSearch,
  currentGroupName,
}: PhoneListTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ContactFilters>({
    keyword: currentSearch,
    groupName: currentGroupName,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingContact, setEditingContact] = useState<CsvContact | null>(null);
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuContact, setRowMenuContact] = useState<CsvContact | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState>(null);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (filters.keyword === currentSearch && filters.groupName === currentGroupName) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (filters.keyword.trim()) {
        params.set('search', filters.keyword.trim());
      } else {
        params.delete('search');
      }

      if (filters.groupName.trim()) {
        params.set('groupName', filters.groupName.trim());
      } else {
        params.delete('groupName');
      }

      params.set('page', '1');
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }, 300);

    return () => clearTimeout(delay);
  }, [currentGroupName, currentSearch, filters.groupName, filters.keyword, pathname, router, searchParams]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = contacts.length > 0 && contacts.every((contact) => selectedSet.has(contact.id));

  const toggleSelection = (id: string) => {
    setSelectedIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((item) => item !== id);
      }

      return [...previous, id];
    });
  };

  const toggleSelectionForPage = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(contacts.map((contact) => contact.id));
  };

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(nextPage));
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  };

  const clearFilters = () => {
    setFilters({ keyword: '', groupName: '' });
  };

  const handleOpenBulkMenu = (event: MouseEvent<HTMLElement>) => {
    setBulkMenuAnchor(event.currentTarget);
  };

  const handleOpenRowMenu = (event: MouseEvent<HTMLElement>, contact: CsvContact) => {
    setRowMenuAnchor(event.currentTarget);
    setRowMenuContact(contact);
  };

  const handleCloseMenus = () => {
    setBulkMenuAnchor(null);
    setRowMenuAnchor(null);
    setRowMenuContact(null);
  };

  return (
    <Stack spacing={2}>
      <Paper
        elevation={0}
        sx={{
          overflow: 'hidden',
          borderRadius: 2.5,
          border: `1px solid ${adminPalette.border}`,
          backgroundColor: adminPalette.surface,
          boxShadow: 'none',
        }}
      >
        <Stack
          spacing={1}
          sx={{ px: { xs: 1.25, md: 1.5 }, py: 1.2, borderBottom: `1px solid ${adminPalette.border}` }}
        >
          <Stack direction={{ xs: 'column', xl: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', xl: 'center' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flex: 1 }}>
              <TextField
                value={filters.keyword}
                onChange={(event) => setFilters((previous) => ({ ...previous, keyword: event.target.value }))}
                placeholder="Cari nama, nomor, atau keterangan"
                size="small"
                sx={{ minWidth: { md: 320 }, '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ fontSize: 17, color: adminPalette.textSubtle }} />
                    </InputAdornment>
                  ),
                }}
                inputProps={{ 'aria-label': 'Cari kontak' }}
              />
              <TextField
                value={filters.groupName}
                onChange={(event) => setFilters((previous) => ({ ...previous, groupName: event.target.value }))}
                placeholder="Filter grup"
                size="small"
                sx={{ minWidth: { md: 200 }, '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
                inputProps={{ 'aria-label': 'Filter grup' }}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="outlined"
                onClick={clearFilters}
                sx={QUIET_BUTTON_SX}
              >
                Clear
              </Button>
              <Button
                variant="outlined"
                endIcon={<MoreHorizRoundedIcon />}
                onClick={handleOpenBulkMenu}
                disabled={selectedIds.length === 0}
                sx={{ ...QUIET_BUTTON_SX, color: adminPalette.brandDark }}
              >
                Action
              </Button>
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
            <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
              <Typography
                sx={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: adminPalette.textMuted,
                }}
              >
                {totalCount} kontak
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>{selectedIds.length} dipilih</Typography>
              {(currentSearch || currentGroupName) && (
                <Typography sx={{ fontSize: '0.8rem', color: adminPalette.brand, fontWeight: 700 }}>Filter aktif</Typography>
              )}
            </Stack>

            <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>
              Halaman {currentPage} dari {totalPages}
            </Typography>
          </Stack>
        </Stack>

        {contacts.length === 0 ? (
          <Box sx={{ px: 2, py: 2.5 }}>
            <Alert severity="info" sx={{ borderRadius: 2.5 }}>
              Tidak ada kontak yang cocok.
            </Alert>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table
                size="small"
                sx={{
                  '& .MuiTableCell-root': {
                    borderBottom: `1px solid ${adminPalette.border}`,
                  },
                }}
              >
                <TableHead>
                  <TableRow sx={{ backgroundColor: adminPalette.brandDark }}>
                    <TableCell sx={{ width: 46, py: 0.8 }}>
                      <Checkbox
                        checked={allVisibleSelected}
                        indeterminate={selectedIds.length > 0 && !allVisibleSelected}
                        onChange={toggleSelectionForPage}
                        inputProps={{ 'aria-label': 'Pilih semua kontak di halaman ini' }}
                        size="small"
                        sx={{
                          color: 'rgba(255,255,255,0.72)',
                          '&.Mui-checked, &.MuiCheckbox-indeterminate': {
                            color: '#ffffff',
                          },
                        }}
                      />
                    </TableCell>
                    {['Name', 'WhatsApp', 'Group', 'Status', 'Imported', ''].map((label) => (
                      <TableCell
                        key={label || 'actions'}
                        align={label ? 'left' : 'right'}
                        sx={{
                          py: 0.8,
                          fontSize: '0.64rem',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: 'rgba(255,255,255,0.88)',
                        }}
                      >
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contacts.map((contact) => {
                    const status = getContactStatus(contact);

                    return (
                      <TableRow
                        key={contact.id}
                        hover
                        sx={{
                          '&:hover': {
                            backgroundColor: adminPalette.brandSoft,
                          },
                        }}
                      >
                        <TableCell sx={{ py: 0.7 }}>
                          <Checkbox
                            checked={selectedSet.has(contact.id)}
                            onChange={() => toggleSelection(contact.id)}
                            inputProps={{ 'aria-label': `Pilih kontak ${contact.nama}` }}
                            size="small"
                            sx={{
                              color: adminPalette.textSubtle,
                              '&.Mui-checked': {
                                color: adminPalette.brand,
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 0.8 }}>
                          <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: adminPalette.textPrimary }}>{contact.nama}</Typography>
                          <Typography sx={{ mt: 0.15, fontSize: '0.74rem', color: adminPalette.textSubtle }}>
                            {contact.jabatan || contact.jenis_kelamin}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.8 }}>
                          <Typography
                            sx={{
                              fontSize: '0.84rem',
                              fontWeight: 600,
                              fontFamily: 'var(--font-geist-mono), monospace',
                              fontVariantNumeric: 'tabular-nums',
                              color: adminPalette.textPrimary,
                            }}
                          >
                            {contact.no_telp}
                          </Typography>
                          <Typography sx={{ mt: 0.15, fontSize: '0.71rem', color: adminPalette.textSubtle }}>
                            {contact.source_file ? `CSV • ${contact.source_file}` : 'Manual'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.8, minWidth: 220 }}>
                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            {contact.group_names.length ? (
                              contact.group_names.slice(0, 2).map((groupName) => (
                                <Chip
                                  key={`${contact.id}-${groupName}`}
                                  label={groupName}
                                  size="small"
                                  sx={QUIET_TAG_SX}
                                />
                              ))
                            ) : (
                              <Chip
                                label="Unassigned"
                                size="small"
                                sx={{
                                  ...QUIET_TAG_SX,
                                  backgroundColor: adminPalette.surfaceSoft,
                                  color: adminPalette.textMuted,
                                  border: `1px solid ${adminPalette.border}`,
                                }}
                              />
                            )}
                            {contact.group_names.length > 2 ? (
                              <Chip
                                label={`+${contact.group_names.length - 2}`}
                                size="small"
                                variant="outlined"
                                sx={{
                                  height: 22,
                                  borderRadius: 1.75,
                                  borderColor: adminPalette.borderStrong,
                                  color: adminPalette.textMuted,
                                  fontSize: '0.71rem',
                                  fontWeight: 700,
                                }}
                              />
                            ) : null}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ py: 0.8 }}>
                          <Chip
                            label={status.label}
                            size="small"
                            sx={{
                              height: 22,
                              borderRadius: 1.75,
                              backgroundColor: status.backgroundColor,
                              color: status.color,
                              fontSize: '0.71rem',
                              fontWeight: 700,
                            }}
                          />
                        </TableCell>
                        <TableCell
                          sx={{
                            py: 0.8,
                            whiteSpace: 'nowrap',
                            color: adminPalette.textMuted,
                            fontSize: '0.78rem',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatCompactDate(contact.imported_at)}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 0.8 }}>
                          <IconButton
                            onClick={(event) => handleOpenRowMenu(event, contact)}
                            size="small"
                            sx={{ color: adminPalette.textMuted }}
                          >
                            <MoreHorizRoundedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Stack
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              spacing={1.25}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              sx={{ px: { xs: 1.25, md: 1.5 }, py: 1.2 }}
            >
              <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>
                Menampilkan {contacts.length} kontak.
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  onClick={() => goToPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  sx={QUIET_BUTTON_SX}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  sx={QUIET_BUTTON_SX}
                >
                  Berikutnya
                </Button>
              </Stack>
            </Stack>
          </>
        )}
      </Paper>

      <Menu
        anchorEl={bulkMenuAnchor}
        open={Boolean(bulkMenuAnchor)}
        onClose={handleCloseMenus}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            handleCloseMenus();
            setBulkAssignOpen(true);
          }}
        >
          <DriveFileMoveOutlinedIcon sx={{ mr: 1, fontSize: 18, color: adminPalette.textMuted }} />
          Tambahkan ke grup
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleCloseMenus();
            setDeleteState({ mode: 'bulk' });
          }}
          sx={{ color: adminPalette.dangerText }}
        >
          <DeleteOutlineRoundedIcon sx={{ mr: 1, fontSize: 18 }} />
          Hapus kontak terpilih
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={rowMenuAnchor}
        open={Boolean(rowMenuAnchor)}
        onClose={handleCloseMenus}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            if (rowMenuContact) {
              setEditingContact(rowMenuContact);
            }
            handleCloseMenus();
          }}
        >
          <EditOutlinedIcon sx={{ mr: 1, fontSize: 18, color: adminPalette.textMuted }} />
          Edit contact
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (rowMenuContact) {
              setDeleteState({ mode: 'single', contact: rowMenuContact });
            }
            handleCloseMenus();
          }}
          sx={{ color: adminPalette.dangerText }}
        >
          <DeleteOutlineRoundedIcon sx={{ mr: 1, fontSize: 18 }} />
          Delete contact
        </MenuItem>
      </Menu>

      <Dialog open={bulkAssignOpen} onClose={() => setBulkAssignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: adminPalette.textPrimary }}>Tambahkan ke grup</DialogTitle>
        <DialogContent>
          <Box component="form" action={assignContactGroupAction} sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
            <input type="hidden" name="ids" value={JSON.stringify(selectedIds)} />
            <Typography sx={{ fontSize: '0.88rem', lineHeight: 1.6, color: adminPalette.textMuted }}>
              {selectedIds.length} kontak akan ditambahkan ke grup yang Anda isi di bawah.
            </Typography>
            <TextField
              name="group_names"
              label="Nama grup"
              placeholder="Contoh: Orang Tua Kelas A"
              size="small"
              helperText="Gunakan koma jika ingin menambahkan lebih dari satu grup."
              fullWidth
            />
            <DialogActions sx={{ px: 0, pb: 0 }}>
              <Button onClick={() => setBulkAssignOpen(false)} sx={{ textTransform: 'none', fontWeight: 700, color: adminPalette.textSecondary }}>
                Tutup
              </Button>
              <Button
                type="submit"
                variant="contained"
                sx={{ textTransform: 'none', fontWeight: 700, backgroundColor: adminPalette.brand, '&:hover': { backgroundColor: adminPalette.brandDark } }}
              >
                Simpan
              </Button>
            </DialogActions>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteState)} onClose={() => setDeleteState(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: adminPalette.textPrimary }}>
          {deleteState?.mode === 'bulk' ? 'Hapus kontak terpilih' : 'Hapus kontak'}
        </DialogTitle>
        <DialogContent>
          {deleteState?.mode === 'bulk' ? (
            <Box component="form" action={deleteContactsBulkAction} sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
              <input type="hidden" name="ids" value={JSON.stringify(selectedIds)} />
              <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.6, color: adminPalette.textSecondary }}>
                {selectedIds.length} kontak akan dihapus dari direktori. Tindakan ini tidak bisa dibatalkan.
              </Typography>
              <DialogActions sx={{ px: 0, pb: 0 }}>
                <Button onClick={() => setDeleteState(null)} sx={{ textTransform: 'none', fontWeight: 700, color: adminPalette.textSecondary }}>
                  Batal
                </Button>
                <Button type="submit" color="error" variant="contained" sx={{ textTransform: 'none', fontWeight: 700 }}>
                  Hapus
                </Button>
              </DialogActions>
            </Box>
          ) : deleteState?.mode === 'single' ? (
            <Box component="form" action={deleteContactAction} sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
              <input type="hidden" name="id" value={deleteState.contact.id} />
              <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.6, color: adminPalette.textSecondary }}>
                {deleteState.contact.nama} akan dihapus dari direktori. Tindakan ini tidak bisa dibatalkan.
              </Typography>
              <DialogActions sx={{ px: 0, pb: 0 }}>
                <Button onClick={() => setDeleteState(null)} sx={{ textTransform: 'none', fontWeight: 700, color: adminPalette.textSecondary }}>
                  Batal
                </Button>
                <Button type="submit" color="error" variant="contained" sx={{ textTransform: 'none', fontWeight: 700 }}>
                  Hapus
                </Button>
              </DialogActions>
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingContact)} onClose={() => setEditingContact(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: adminPalette.textPrimary }}>Edit contact</DialogTitle>
        <DialogContent>
          {editingContact ? (
            <Box component="form" action={updateContactAction} sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
              <input type="hidden" name="id" value={editingContact.id} />
              <TextField name="no_telp" label="Nomor WhatsApp" defaultValue={editingContact.no_telp} required size="small" fullWidth />
              <TextField name="nama" label="Nama kontak" defaultValue={editingContact.nama} required size="small" fullWidth />
              <TextField name="jenis_kelamin" label="Jenis kelamin" defaultValue={editingContact.jenis_kelamin} select size="small" fullWidth>
                {GENDER_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
              <TextField name="jabatan" label="Keterangan" defaultValue={editingContact.jabatan || ''} size="small" fullWidth />
              <TextField
                name="group_names"
                label="Grup"
                defaultValue={editingContact.group_names.join(', ')}
                placeholder="Pisahkan dengan koma"
                size="small"
                fullWidth
              />
              <DialogActions sx={{ px: 0, pb: 0 }}>
                <Button onClick={() => setEditingContact(null)} sx={{ textTransform: 'none', fontWeight: 700, color: adminPalette.textSecondary }}>
                  Tutup
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  sx={{ textTransform: 'none', fontWeight: 700, backgroundColor: adminPalette.brand, '&:hover': { backgroundColor: adminPalette.brandDark } }}
                >
                  Simpan perubahan
                </Button>
              </DialogActions>
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
