'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
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
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { adminPalette, adminTableHeaderCellSx, adminTableSortLabelSx } from '../lib/adminPalette';
import type { TicketStatus, TicketWithReplies } from '../lib/types';

interface TicketTableProps {
  initialData: TicketWithReplies[];
  totalCount: number;
}

const PAGE_SIZE = 10;
type TicketSortKey = 'id' | 'subject' | 'status' | 'updated_at';
type SortDirection = 'asc' | 'desc';

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

const SORT_DEFAULTS: Record<TicketSortKey, SortDirection> = {
  id: 'asc',
  subject: 'asc',
  status: 'asc',
  updated_at: 'desc',
};

function normalizeSortKey(value: string | null): TicketSortKey {
  return value === 'id' || value === 'subject' || value === 'status' ? value : 'updated_at';
}

function normalizeSortDirection(value: string | null, fallback: SortDirection): SortDirection {
  return value === 'asc' || value === 'desc' ? value : fallback;
}

const ticketDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});

function formatTicketDate(value: string | null) {
  if (!value) {
    return '-';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return ticketDateFormatter.format(parsedDate);
}

function getStatusTone(status: TicketStatus) {
  if (status === 'Open') {
    return {
      backgroundColor: adminPalette.warningBg,
      borderColor: adminPalette.warningBorder,
      color: adminPalette.warningText,
    };
  }

  if (status === 'In Progress') {
    return {
      backgroundColor: adminPalette.brandSoft,
      borderColor: adminPalette.brandSoftStrong,
      color: adminPalette.brandDark,
    };
  }

  if (status === 'Resolved') {
    return {
      backgroundColor: adminPalette.successBg,
      borderColor: adminPalette.successBorder,
      color: adminPalette.successText,
    };
  }

  return {
    backgroundColor: adminPalette.surfaceSoft,
    borderColor: adminPalette.border,
    color: adminPalette.textSecondary,
  };
}

export default function TicketTable({ initialData, totalCount }: TicketTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const currentSearch = searchParams.get('search') || '';
  const currentSort = normalizeSortKey(searchParams.get('sort'));
  const currentSortDir = normalizeSortDirection(searchParams.get('sortDir'), SORT_DEFAULTS[currentSort]);
  const currentPage = Number(searchParams.get('page') || '1') || 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const [searchTerm, setSearchTerm] = useState(currentSearch);

  useEffect(() => {
    setSearchTerm(currentSearch);
  }, [currentSearch]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm === currentSearch) {
        return;
      }

      const params = new URLSearchParams(currentQuery);

      if (searchTerm.trim()) {
        params.set('search', searchTerm.trim());
      } else {
        params.delete('search');
      }

      params.set('page', '1');
      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

      router.replace(nextUrl, { scroll: false });
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [currentQuery, currentSearch, pathname, router, searchTerm]);

  const summaryLabel = useMemo(() => {
    if (!initialData.length) {
      return 'Tidak ada tiket yang cocok dengan filter saat ini.';
    }

    return `Menampilkan ${initialData.length} tiket dari total ${totalCount}.`;
  }, [initialData.length, totalCount]);

  const goToPage = (page: number) => {
    const params = new URLSearchParams(currentQuery);
    params.set('page', String(page));
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  const handleSortChange = (sortBy: TicketSortKey) => {
    const params = new URLSearchParams(currentQuery);
    const nextSortDir =
      currentSort === sortBy
        ? currentSortDir === 'asc'
          ? 'desc'
          : 'asc'
        : SORT_DEFAULTS[sortBy];

    params.set('sort', sortBy);
    params.set('sortDir', nextSortDir);
    params.set('page', '1');

    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  return (
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
        <Stack direction={{ xs: 'column', xl: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', xl: 'center' }}>
          <TextField
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cari subjek tiket"
            size="small"
            sx={{ minWidth: { md: 320 }, '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 17, color: adminPalette.textSubtle }} />
                </InputAdornment>
              ),
            }}
            inputProps={{ 'aria-label': 'Cari tiket' }}
          />

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`${totalCount} total tiket`} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
            <Chip label={`Halaman ${currentPage}/${totalPages}`} size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} />
          </Stack>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textMuted }}>{summaryLabel}</Typography>
          {currentSearch ? <Typography sx={{ fontSize: '0.8rem', color: adminPalette.brand, fontWeight: 700 }}>Filter pencarian aktif</Typography> : null}
        </Stack>
      </Stack>

      {initialData.length === 0 ? (
        <Box sx={{ px: 2, py: 2.5 }}>
          <Alert severity="info" sx={{ borderRadius: 2.5 }}>
            Tidak ada tiket yang cocok. Coba ubah kata kunci pencarian atau hapus filter yang aktif.
          </Alert>
        </Box>
      ) : (
        <>
          <TableContainer>
            <Table
              size="small"
              sx={{
                minWidth: 860,
                '& .MuiTableCell-root': {
                  borderBottom: `1px solid ${adminPalette.border}`,
                },
              }}
            >
              <TableHead sx={{ backgroundColor: adminPalette.brand }}>
                <TableRow>
                  <TableCell sx={adminTableHeaderCellSx}>
                    <TableSortLabel
                      active={currentSort === 'id'}
                      direction={currentSort === 'id' ? currentSortDir : SORT_DEFAULTS.id}
                      onClick={() => handleSortChange('id')}
                      sx={adminTableSortLabelSx}
                    >
                      ID
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={adminTableHeaderCellSx}>
                    <TableSortLabel
                      active={currentSort === 'subject'}
                      direction={currentSort === 'subject' ? currentSortDir : SORT_DEFAULTS.subject}
                      onClick={() => handleSortChange('subject')}
                      sx={adminTableSortLabelSx}
                    >
                      Subjek
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={adminTableHeaderCellSx}>
                    <TableSortLabel
                      active={currentSort === 'status'}
                      direction={currentSort === 'status' ? currentSortDir : SORT_DEFAULTS.status}
                      onClick={() => handleSortChange('status')}
                      sx={adminTableSortLabelSx}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={adminTableHeaderCellSx}>
                    Kanal
                  </TableCell>
                  <TableCell sx={adminTableHeaderCellSx}>
                    <TableSortLabel
                      active={currentSort === 'updated_at'}
                      direction={currentSort === 'updated_at' ? currentSortDir : SORT_DEFAULTS.updated_at}
                      onClick={() => handleSortChange('updated_at')}
                      sx={adminTableSortLabelSx}
                    >
                      Update terakhir
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={adminTableHeaderCellSx}>
                    Balasan
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {initialData.map((row) => {
                  const statusTone = getStatusTone(row.status);

                  return (
                    <TableRow
                      key={row.id}
                      hover
                      onClick={() => router.push(`/ticket/${row.id}`)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: adminPalette.brandSoft,
                        },
                      }}
                    >
                      <TableCell sx={{ py: 0.8 }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: adminPalette.textPrimary }}>{row.id}</Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.8, minWidth: 280 }}>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: adminPalette.textPrimary }}>{row.subject}</Typography>
                        <Typography sx={{ mt: 0.15, fontSize: '0.74rem', color: adminPalette.textMuted }}>
                          {row.phone_number || row.user_email || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.8 }}>
                        <Chip
                          label={row.status}
                          size="small"
                          sx={{
                            height: 22,
                            borderRadius: 1.75,
                            backgroundColor: statusTone.backgroundColor,
                            color: statusTone.color,
                            border: `1px solid ${statusTone.borderColor}`,
                            fontSize: '0.71rem',
                            fontWeight: 700,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.8 }}>
                        <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>{row.channel || '-'}</Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.8, whiteSpace: 'nowrap' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>
                          {formatTicketDate(row.updated_at || row.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.8 }}>
                        <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>{row.replies.length}</Typography>
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
              Klik satu baris untuk membuka detail percakapan tiket.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => goToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} sx={QUIET_BUTTON_SX}>
                Sebelumnya
              </Button>
              <Button variant="outlined" onClick={() => goToPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} sx={QUIET_BUTTON_SX}>
                Berikutnya
              </Button>
            </Stack>
          </Stack>
        </>
      )}
    </Paper>
  );
}
