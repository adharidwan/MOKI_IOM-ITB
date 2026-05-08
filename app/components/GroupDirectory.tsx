'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';

import { createGroupMemberAction, createGroupWithFirstMemberAction } from '../group/actions';
import type { PaginatedContactGroupsResponse, PaginatedGroupMembersResponse } from '../lib/group-directory-server';
import { adminPalette, adminTableSortLabelSx } from '../lib/adminPalette';

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

const PRIMARY_BUTTON_SX = {
  minHeight: 34,
  borderRadius: 2,
  px: 1.6,
  backgroundColor: adminPalette.brand,
  textTransform: 'none',
  fontWeight: 700,
  boxShadow: 'none',
  '&:hover': {
    backgroundColor: adminPalette.brandDark,
    boxShadow: 'none',
  },
} as const;

const ACTIVE_ROW_SX = {
  backgroundColor: adminPalette.brandSoft,
  boxShadow: `inset 3px 0 0 ${adminPalette.brand}`,
} as const;

const GROUP_SORT_DEFAULTS: Record<GroupSortKey, SortDirection> = {
  name: 'asc',
  memberCount: 'desc',
};

const MEMBER_SORT_DEFAULTS: Record<GroupMemberSortKey, SortDirection> = {
  nama: 'asc',
  no_telp: 'asc',
  jenis_kelamin: 'asc',
};

interface GroupDirectoryProps {
  groups: PaginatedContactGroupsResponse;
  selectedGroupName: string;
  members: PaginatedGroupMembersResponse;
  currentSearch: string;
  currentMemberSearch: string;
  currentSortBy: GroupSortKey;
  currentSortDir: SortDirection;
  currentMemberSortBy: GroupMemberSortKey;
  currentMemberSortDir: SortDirection;
}

type GroupSortKey = 'name' | 'memberCount';
type GroupMemberSortKey = 'nama' | 'no_telp' | 'jenis_kelamin';
type SortDirection = 'asc' | 'desc';

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        px: { xs: 0, sm: 1.4 },
        py: 0.1,
        borderLeft: { sm: `1px solid ${adminPalette.border}` },
        '&:first-of-type': {
          pl: 0,
          borderLeft: 'none',
        },
      }}
    >
      <Typography
        sx={{
          fontSize: '0.63rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: adminPalette.textMuted,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.4,
          fontSize: { xs: '1rem', sm: '1.12rem' },
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: adminPalette.brandDark,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function buildGroupPreview(previewNames: string[], memberCount: number) {
  if (!previewNames.length) {
    return 'Belum ada anggota.';
  }

  const extraCount = Math.max(0, memberCount - previewNames.length);
  return `${previewNames.join(', ')}${extraCount > 0 ? ` dan ${extraCount} lainnya` : ''}`;
}

function GroupDialogHeader({
  eyebrow,
  title,
  description,
  onClose,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <Stack spacing={1.25} sx={{ px: 2.5, py: 2.25, borderBottom: `1px solid ${adminPalette.border}` }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: adminPalette.brand,
            }}
          >
            {eyebrow}
          </Typography>
          <Typography sx={{ mt: 0.7, fontSize: '1.35rem', fontWeight: 700, color: adminPalette.textPrimary }}>{title}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: adminPalette.textMuted, '&:hover': { backgroundColor: adminPalette.brandSoft } }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Typography sx={{ fontSize: '0.92rem', lineHeight: 1.65, color: adminPalette.textSecondary }}>{description}</Typography>
    </Stack>
  );
}

export default function GroupDirectory({
  groups,
  selectedGroupName,
  members,
  currentSearch,
  currentMemberSearch,
  currentSortBy,
  currentSortDir,
  currentMemberSortBy,
  currentMemberSortDir,
}: GroupDirectoryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch);
  const [memberSearch, setMemberSearch] = useState(currentMemberSearch);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createMemberOpen, setCreateMemberOpen] = useState(false);

  useEffect(() => {
    setSearch(currentSearch);
  }, [currentSearch]);

  useEffect(() => {
    setMemberSearch(currentMemberSearch);
  }, [currentMemberSearch]);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (search === currentSearch) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) {
        params.set('search', search.trim());
      } else {
        params.delete('search');
      }
      params.set('page', '1');
      params.delete('group');
      params.delete('memberPage');
      params.delete('memberSearch');
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }, 300);

    return () => clearTimeout(delay);
  }, [currentSearch, pathname, router, search, searchParams]);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (memberSearch === currentMemberSearch || !selectedGroupName) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (memberSearch.trim()) {
        params.set('memberSearch', memberSearch.trim());
      } else {
        params.delete('memberSearch');
      }
      params.set('memberPage', '1');
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }, 300);

    return () => clearTimeout(delay);
  }, [currentMemberSearch, memberSearch, pathname, router, searchParams, selectedGroupName]);

  const updateQuery = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(patch).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  const clearGroupFilters = () => {
    setSearch('');
    updateQuery({
      search: null,
      page: '1',
      group: null,
      memberPage: null,
      memberSearch: null,
    });
  };

  const clearMemberFilters = () => {
    setMemberSearch('');
    updateQuery({ memberSearch: null, memberPage: '1' });
  };

  const selectGroup = (groupName: string) => {
    updateQuery({
      group: groupName,
      memberPage: '1',
      memberSearch: null,
    });
  };

  const handleGroupSortChange = (sortBy: GroupSortKey) => {
    const nextSortDir =
      currentSortBy === sortBy
        ? currentSortDir === 'asc'
          ? 'desc'
          : 'asc'
        : GROUP_SORT_DEFAULTS[sortBy];

    updateQuery({
      sortBy,
      sortDir: nextSortDir,
      page: '1',
      group: null,
      memberPage: null,
      memberSearch: null,
    });
  };

  const handleMemberSortChange = (sortBy: GroupMemberSortKey) => {
    const nextSortDir =
      currentMemberSortBy === sortBy
        ? currentMemberSortDir === 'asc'
          ? 'desc'
          : 'asc'
        : MEMBER_SORT_DEFAULTS[sortBy];

    updateQuery({
      memberSortBy: sortBy,
      memberSortDir: nextSortDir,
      memberPage: '1',
    });
  };

  return (
    <Stack spacing={1.25}>
      <Paper
        elevation={0}
        sx={{
          borderRadius: 2.5,
          border: `1px solid ${adminPalette.border}`,
          backgroundColor: adminPalette.surface,
          boxShadow: 'none',
        }}
      >
        <Stack spacing={1.25} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={1.25}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', lg: 'center' }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>
                Groups
              </Typography>
              <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
                Kelola grup penerima
              </Typography>
              <Typography sx={{ mt: 0.55, fontSize: '0.8rem', color: adminPalette.textMuted }}>
                Pantau grup dan anggota agar segmentasi selalu siap dipakai untuk blast.
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', lg: 'auto' } }}>
              <Button component={Link} href="/contacts" variant="outlined" sx={QUIET_BUTTON_SX}>
                Buka direktori kontak
              </Button>
              <Button component={Link} href="/blastmessage" variant="contained" sx={PRIMARY_BUTTON_SX}>
                Buka blast
              </Button>
            </Stack>
          </Stack>

          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={1.25}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', lg: 'center' }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
              <MetricTile label="Total grup" value={groups.total} />
              <MetricTile label="Grup aktif" value={selectedGroupName || '-'} />
              <MetricTile label="Anggota grup aktif" value={selectedGroupName ? members.total : 0} />
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {currentSearch ? <Chip label="Pencarian grup aktif" size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} /> : null}
              {currentMemberSearch ? <Chip label="Pencarian anggota aktif" size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} /> : null}
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.92fr) minmax(0, 1.08fr)' },
          gap: 1.25,
          alignItems: 'start',
        }}
      >
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
          <Stack spacing={1} sx={{ px: { xs: 1.25, md: 1.5 }, py: 1.2, borderBottom: `1px solid ${adminPalette.border}` }}>
            <Stack spacing={1}>
              <Stack spacing={0.35}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>Daftar Group</Typography>
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <TextField
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari nama grup"
                  size="small"
                  sx={{ minWidth: { md: 280 }, maxWidth: { md: 360 }, '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon sx={{ fontSize: 17, color: adminPalette.textSubtle }} />
                      </InputAdornment>
                    ),
                  }}
                  inputProps={{ 'aria-label': 'Cari nama grup' }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Button variant="outlined" onClick={clearGroupFilters} sx={QUIET_BUTTON_SX}>
                    Reset
                  </Button>
                  <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setCreateGroupOpen(true)} sx={PRIMARY_BUTTON_SX}>
                    Add Group
                  </Button>
                </Stack>
              </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
              <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>
                {selectedGroupName ? `Grup yang sedang ditinjau: ${selectedGroupName}` : 'Belum ada grup yang dipilih.'}
              </Typography>
              <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>
                Halaman {groups.page} dari {groups.totalPages}
              </Typography>
            </Stack>
          </Stack>

          {groups.items.length === 0 ? (
            <Box sx={{ px: 2, py: 2.5 }}>
              <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                Tidak ada grup yang sesuai dengan pencarian saat ini.
              </Alert>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table
                  size="small"
                  sx={{
                    minWidth: 560,
                    '& .MuiTableCell-root': {
                      borderBottom: `1px solid ${adminPalette.border}`,
                    },
                  }}
                >
                  <TableHead>
                    <TableRow sx={{ backgroundColor: adminPalette.brandDark }}>
                      <TableCell sx={{ py: 0.8, fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)' }}>
                        <TableSortLabel
                          active={currentSortBy === 'name'}
                          direction={currentSortBy === 'name' ? currentSortDir : GROUP_SORT_DEFAULTS.name}
                          onClick={() => handleGroupSortChange('name')}
                          sx={adminTableSortLabelSx}
                        >
                          Nama grup
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ py: 0.8, fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)' }}>
                        <TableSortLabel
                          active={currentSortBy === 'memberCount'}
                          direction={currentSortBy === 'memberCount' ? currentSortDir : GROUP_SORT_DEFAULTS.memberCount}
                          onClick={() => handleGroupSortChange('memberCount')}
                          sx={adminTableSortLabelSx}
                        >
                          Jumlah anggota
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ py: 0.8, fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)' }}>
                        Preview
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groups.items.map((group) => {
                      const active = selectedGroupName === group.name;

                      return (
                        <TableRow
                          key={group.name}
                          hover
                          sx={{
                            cursor: 'pointer',
                            ...(active ? ACTIVE_ROW_SX : {}),
                            '&:hover': {
                              backgroundColor: adminPalette.brandSoft,
                            },
                          }}
                          onClick={() => selectGroup(group.name)}
                        >
                          <TableCell sx={{ py: 0.85 }}>
                            <Stack spacing={0.35}>
                              <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: adminPalette.textPrimary }}>{group.name}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ py: 0.85, whiteSpace: 'nowrap' }}>
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: adminPalette.brandDark }}>{group.memberCount}</Typography>
                          </TableCell>
                          <TableCell sx={{ py: 0.85, minWidth: 260 }}>
                            <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary, lineHeight: 1.5 }}>
                              {buildGroupPreview(group.previewNames, group.memberCount)}
                            </Typography>
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
                  Menampilkan {groups.items.length} grup pada halaman ini.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={() =>
                      updateQuery({
                        page: String(Math.max(1, groups.page - 1)),
                        group: null,
                        memberPage: null,
                        memberSearch: null,
                      })
                    }
                    disabled={groups.page <= 1}
                    sx={QUIET_BUTTON_SX}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() =>
                      updateQuery({
                        page: String(Math.min(groups.totalPages, groups.page + 1)),
                        group: null,
                        memberPage: null,
                        memberSearch: null,
                      })
                    }
                    disabled={groups.page >= groups.totalPages}
                    sx={QUIET_BUTTON_SX}
                  >
                    Berikutnya
                  </Button>
                </Stack>
              </Stack>
            </>
          )}
        </Paper>

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
          <Stack spacing={1} sx={{ px: { xs: 1.25, md: 1.5 }, py: 1.2, borderBottom: `1px solid ${adminPalette.border}` }}>
            <Stack spacing={1}>
              <Stack spacing={0.35}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>Anggota Group</Typography>
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <TextField
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Cari nama atau nomor WhatsApp"
                  size="small"
                  disabled={!selectedGroupName}
                  sx={{ minWidth: { md: 280 }, maxWidth: { md: 360 }, '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon sx={{ fontSize: 17, color: adminPalette.textSubtle }} />
                      </InputAdornment>
                    ),
                  }}
                  inputProps={{ 'aria-label': 'Cari anggota grup' }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Button variant="outlined" onClick={clearMemberFilters} disabled={!selectedGroupName} sx={QUIET_BUTTON_SX}>
                    Reset
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    onClick={() => setCreateMemberOpen(true)}
                    disabled={!selectedGroupName}
                    sx={PRIMARY_BUTTON_SX}
                  >
                    Add Member
                  </Button>
                </Stack>
              </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
              <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>
                {selectedGroupName ? `${members.total} anggota tercatat pada grup ini.` : 'Belum ada grup yang dipilih.'}
              </Typography>
              {selectedGroupName ? (
                <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>
                  Halaman {members.page} dari {members.totalPages}
                </Typography>
              ) : null}
            </Stack>
          </Stack>

          {!selectedGroupName ? (
            <Box sx={{ px: 2, py: 2.5 }}>
              <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                Pilih satu grup dari tabel di sebelah kiri untuk melihat daftar anggotanya.
              </Alert>
            </Box>
          ) : members.items.length === 0 ? (
            <Box sx={{ px: 2, py: 2.5 }}>
              <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                Belum ada anggota yang sesuai dengan pencarian ini.
              </Alert>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table
                  size="small"
                  sx={{
                    minWidth: 520,
                    '& .MuiTableCell-root': {
                      borderBottom: `1px solid ${adminPalette.border}`,
                    },
                  }}
                >
                  <TableHead>
                    <TableRow sx={{ backgroundColor: adminPalette.brandDark }}>
                      <TableCell sx={{ py: 0.8, fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)' }}>
                        <TableSortLabel
                          active={currentMemberSortBy === 'nama'}
                          direction={currentMemberSortBy === 'nama' ? currentMemberSortDir : MEMBER_SORT_DEFAULTS.nama}
                          onClick={() => handleMemberSortChange('nama')}
                          sx={adminTableSortLabelSx}
                        >
                          Nama
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ py: 0.8, fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)' }}>
                        <TableSortLabel
                          active={currentMemberSortBy === 'no_telp'}
                          direction={currentMemberSortBy === 'no_telp' ? currentMemberSortDir : MEMBER_SORT_DEFAULTS.no_telp}
                          onClick={() => handleMemberSortChange('no_telp')}
                          sx={adminTableSortLabelSx}
                        >
                          Nomor WhatsApp
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ py: 0.8, fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)' }}>
                        <TableSortLabel
                          active={currentMemberSortBy === 'jenis_kelamin'}
                          direction={currentMemberSortBy === 'jenis_kelamin' ? currentMemberSortDir : MEMBER_SORT_DEFAULTS.jenis_kelamin}
                          onClick={() => handleMemberSortChange('jenis_kelamin')}
                          sx={adminTableSortLabelSx}
                        >
                          Jenis kelamin
                        </TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {members.items.map((member) => (
                      <TableRow
                        key={member.id}
                        hover
                        sx={{
                          '&:hover': {
                            backgroundColor: adminPalette.brandSoft,
                          },
                        }}
                      >
                        <TableCell sx={{ py: 0.85 }}>
                          <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: adminPalette.textPrimary }}>{member.nama}</Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.85 }}>
                          <Typography
                            sx={{
                              fontSize: '0.84rem',
                              fontWeight: 600,
                              fontFamily: 'var(--font-geist-mono), monospace',
                              fontVariantNumeric: 'tabular-nums',
                              color: adminPalette.textPrimary,
                            }}
                          >
                            {member.no_telp}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.85 }}>
                          <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>{member.jenis_kelamin}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
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
                  Menampilkan {members.items.length} anggota pada halaman ini.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={() => updateQuery({ memberPage: String(Math.max(1, members.page - 1)) })}
                    disabled={members.page <= 1}
                    sx={QUIET_BUTTON_SX}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => updateQuery({ memberPage: String(Math.min(members.totalPages, members.page + 1)) })}
                    disabled={members.page >= members.totalPages}
                    sx={QUIET_BUTTON_SX}
                  >
                    Berikutnya
                  </Button>
                </Stack>
              </Stack>
            </>
          )}
        </Paper>
      </Box>

      <Dialog
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            backgroundColor: adminPalette.surface,
            border: `1px solid ${adminPalette.border}`,
          },
        }}
      >
        <GroupDialogHeader
          eyebrow="Grup baru"
          title="Buat grup dan simpan anggota pertama"
          description="Di halaman ini, grup baru akan terbentuk saat anggota pertama disimpan ke dalamnya."
          onClose={() => setCreateGroupOpen(false)}
        />
        <DialogContent sx={{ p: 0 }}>
          <Box component="form" action={createGroupWithFirstMemberAction} sx={{ display: 'grid', gap: 1.5, px: 2.5, py: 2.5 }}>
            <TextField name="group_name" label="Nama grup" required placeholder="Contoh: Orang Tua Kelas 6A" size="small" fullWidth />
            <TextField name="nama" label="Nama anggota pertama" required placeholder="Contoh: Ibu Rina" size="small" fullWidth />
            <TextField name="no_telp" label="Nomor WhatsApp" required placeholder="6281234567890" size="small" fullWidth />
            <TextField name="jenis_kelamin" label="Jenis kelamin" select defaultValue="Tidak diketahui" size="small" fullWidth>
              {GENDER_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <DialogActions sx={{ px: 0, pb: 0, pt: 1 }}>
              <Button onClick={() => setCreateGroupOpen(false)} sx={{ textTransform: 'none', fontWeight: 700, color: adminPalette.textSecondary }}>
                Batal
              </Button>
              <Button type="submit" variant="contained" sx={PRIMARY_BUTTON_SX}>
                Simpan grup
              </Button>
            </DialogActions>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createMemberOpen}
        onClose={() => setCreateMemberOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            backgroundColor: adminPalette.surface,
            border: `1px solid ${adminPalette.border}`,
          },
        }}
      >
        <GroupDialogHeader
          eyebrow="Anggota baru"
          title={selectedGroupName ? `Tambah anggota ke ${selectedGroupName}` : 'Tambah anggota'}
          description="Simpan anggota baru langsung ke grup yang sedang aktif agar segmentasi tetap rapi."
          onClose={() => setCreateMemberOpen(false)}
        />
        <DialogContent sx={{ p: 0 }}>
          <Box component="form" action={createGroupMemberAction} sx={{ display: 'grid', gap: 1.5, px: 2.5, py: 2.5 }}>
            <input type="hidden" name="group_name" value={selectedGroupName} />
            <TextField label="Grup aktif" value={selectedGroupName} size="small" fullWidth disabled />
            <TextField name="nama" label="Nama anggota" required placeholder="Contoh: Bapak Andi" size="small" fullWidth />
            <TextField name="no_telp" label="Nomor WhatsApp" required placeholder="6281234567890" size="small" fullWidth />
            <TextField name="jenis_kelamin" label="Jenis kelamin" select defaultValue="Tidak diketahui" size="small" fullWidth>
              {GENDER_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <DialogActions sx={{ px: 0, pb: 0, pt: 1 }}>
              <Button onClick={() => setCreateMemberOpen(false)} sx={{ textTransform: 'none', fontWeight: 700, color: adminPalette.textSecondary }}>
                Batal
              </Button>
              <Button type="submit" variant="contained" sx={PRIMARY_BUTTON_SX}>
                Simpan anggota
              </Button>
            </DialogActions>
          </Box>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
