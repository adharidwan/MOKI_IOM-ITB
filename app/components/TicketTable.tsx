'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Chip,
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
  pageSize: number;
}

type TicketSortKey = 'id' | 'subject' | 'status' | 'updated_at';
type SortDirection = 'asc' | 'desc';

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

export default function TicketTable({ initialData, totalCount, pageSize }: TicketTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const currentSearch = searchParams.get('search') || '';
  const currentSort = normalizeSortKey(searchParams.get('sort'));
  const currentSortDir = normalizeSortDirection(searchParams.get('sortDir'), SORT_DEFAULTS[currentSort]);
  const currentPage = Number(searchParams.get('page') || '1') || 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
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

  const updatePagination = (page: number, nextPageSize = pageSize) => {
    const params = new URLSearchParams(currentQuery);
    params.set('page', String(page));
    params.set('pageSize', String(nextPageSize));
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
      <Stack spacing={1} sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>Daftar tiket</Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>
            {totalCount} tiket total, halaman {currentPage} dari {totalPages}
          </Typography>
        </Box>

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

          {currentSearch ? (
            <Chip label="Filter pencarian aktif" size="small" sx={{ alignSelf: { xs: 'flex-start', xl: 'center' }, backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} />
          ) : null}
        </Stack>
      </Stack>

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
                {initialData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 6, textAlign: 'center' }}>
                      <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Tidak ada tiket yang cocok.</Typography>
                      <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>Coba ubah kata kunci pencarian atau hapus filter aktif.</Typography>
                    </TableCell>
                  </TableRow>
                ) : initialData.map((row) => {
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

      <TablePagination
        component="div"
        count={totalCount}
        page={Math.max(0, currentPage - 1)}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[10, 20, 50, 100]}
        onPageChange={(_, nextPage) => updatePagination(nextPage + 1)}
        onRowsPerPageChange={(event) => updatePagination(1, Number(event.target.value))}
      />
    </Paper>
  );
}
