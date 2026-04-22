'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type { PaginatedContactGroupsResponse, PaginatedGroupMembersResponse } from '../lib/group-directory-server';
import { adminPalette } from '../lib/adminPalette';

const QUIET_BUTTON_SX = {
  textTransform: 'none',
  fontWeight: 700,
  borderRadius: 2,
  borderColor: adminPalette.borderStrong,
  color: adminPalette.textSecondary,
  backgroundColor: adminPalette.surface,
  boxShadow: 'none',
  '&:hover': {
    borderColor: adminPalette.brandSoftStrong,
    backgroundColor: adminPalette.brandSoft,
    boxShadow: 'none',
  },
} as const;

interface GroupDirectoryProps {
  groups: PaginatedContactGroupsResponse;
  selectedGroupName: string;
  members: PaginatedGroupMembersResponse;
  currentSearch: string;
  currentMemberSearch: string;
}

export default function GroupDirectory({
  groups,
  selectedGroupName,
  members,
  currentSearch,
  currentMemberSearch,
}: GroupDirectoryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch);
  const [memberSearch, setMemberSearch] = useState(currentMemberSearch);

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
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
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
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
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
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', xl: '0.9fr 1.4fr' },
        gap: 3,
        alignItems: 'start',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, md: 3 },
          borderRadius: 3,
          border: `1px solid ${adminPalette.border}`,
          backgroundColor: adminPalette.surface,
          boxShadow: 'none',
        }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: adminPalette.textPrimary }}>
              Daftar grup
            </Typography>
            <Typography sx={{ fontSize: '0.92rem', lineHeight: 1.6, color: adminPalette.textMuted }}>
              Cari grup untuk meninjau komposisi penerima sebelum digunakan di blast.
            </Typography>
          </Box>

          <TextField
            label="Cari grup"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Contoh: VIP"
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
          />

          <Stack spacing={1} sx={{ maxHeight: { xs: 320, xl: 620 }, overflowY: 'auto', pr: 0.5 }}>
            {groups.items.length ? (
              groups.items.map((group) => {
                const active = selectedGroupName === group.name;

                return (
                  <Paper
                    key={group.name}
                    elevation={0}
                    onClick={() =>
                      updateQuery({
                        group: group.name,
                        memberPage: '1',
                        memberSearch: null,
                      })
                    }
                    sx={{
                      p: 1.75,
                      borderRadius: 3,
                      border: active ? `1px solid ${adminPalette.brand}` : `1px solid ${adminPalette.border}`,
                      backgroundColor: active ? adminPalette.brandSoft : adminPalette.surface,
                      cursor: 'pointer',
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                        <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                          {group.name}
                        </Typography>
                        <Chip
                          label={`${group.memberCount} kontak`}
                          size="small"
                          sx={{ backgroundColor: adminPalette.brandSoftStrong, color: adminPalette.brandDark, fontWeight: 700 }}
                        />
                      </Stack>
                      <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted, lineHeight: 1.5 }}>
                        {group.previewNames.join(', ')}
                        {group.memberCount > group.previewNames.length ? ` dan ${group.memberCount - group.previewNames.length} lainnya` : ''}
                      </Typography>
                    </Stack>
                  </Paper>
                );
              })
            ) : (
              <Paper
                elevation={0}
                sx={{ p: 2, borderRadius: 3, border: `1px dashed ${adminPalette.borderStrong}`, backgroundColor: adminPalette.surfaceSoft }}
              >
                <Typography sx={{ fontSize: '0.92rem', color: adminPalette.textMuted }}>
                  Tidak ada grup yang cocok dengan pencarian.
                </Typography>
              </Paper>
            )}
          </Stack>

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
              Halaman {groups.page} dari {groups.totalPages}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                onClick={() => updateQuery({ page: String(Math.max(1, groups.page - 1)) })}
                disabled={groups.page <= 1}
                sx={QUIET_BUTTON_SX}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outlined"
                onClick={() => updateQuery({ page: String(Math.min(groups.totalPages, groups.page + 1)) })}
                disabled={groups.page >= groups.totalPages}
                sx={QUIET_BUTTON_SX}
              >
                Berikutnya
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, md: 3 },
          borderRadius: 3,
          border: `1px solid ${adminPalette.border}`,
          backgroundColor: adminPalette.surface,
          boxShadow: 'none',
        }}
      >
        {selectedGroupName ? (
          <Stack spacing={2.5}>
            <Stack spacing={1.25}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
                <Box>
                  <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                    {selectedGroupName}
                  </Typography>
                  <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.6, color: adminPalette.textMuted }}>
                    Tinjau anggota grup ini sebelum digunakan pada blast atau pembaruan data kontak.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={`${members.total} kontak`} sx={{ backgroundColor: adminPalette.brandSoftStrong, color: adminPalette.brandDark, fontWeight: 700 }} />
                  <Link href="/blastmessage" style={{ textDecoration: 'none' }}>
                    <Button
                      variant="contained"
                      sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        borderRadius: 2.5,
                        boxShadow: 'none',
                        backgroundColor: adminPalette.brand,
                        '&:hover': { backgroundColor: adminPalette.brandDark, boxShadow: 'none' },
                      }}
                    >
                      Gunakan untuk blast
                    </Button>
                  </Link>
                </Stack>
              </Stack>

              <TextField
                label="Cari anggota grup"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Contoh: Budi atau 62812"
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
              />
            </Stack>

            <Divider sx={{ borderColor: adminPalette.border }} />

            <Stack spacing={1.25}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: adminPalette.textMuted, textTransform: 'uppercase' }}>
                Anggota grup
              </Typography>

              <Stack spacing={1} sx={{ maxHeight: { xs: 360, xl: 560 }, overflowY: 'auto', pr: 0.5 }}>
                {members.items.length ? (
                  members.items.map((member) => (
                    <Paper
                      key={member.id}
                      elevation={0}
                      sx={{ p: 1.75, borderRadius: 3, border: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface }}
                    >
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                        <Box>
                          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: adminPalette.textPrimary }}>{member.nama}</Typography>
                          <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
                            {member.no_telp}
                            {member.jabatan ? ` • ${member.jabatan}` : ''}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                          <Chip
                            label={member.jenis_kelamin}
                            size="small"
                            variant="outlined"
                            sx={{ borderColor: adminPalette.borderStrong, color: adminPalette.textSecondary, backgroundColor: adminPalette.surfaceSoft }}
                          />
                          <Link href="/contacts" style={{ textDecoration: 'none' }}>
                            <Button size="small" variant="text" sx={{ textTransform: 'none', fontWeight: 700, color: adminPalette.brandDark }}>
                              Kelola kontak
                            </Button>
                          </Link>
                        </Stack>
                      </Stack>
                    </Paper>
                  ))
                ) : (
                  <Typography sx={{ fontSize: '0.92rem', color: adminPalette.textMuted }}>
                    Tidak ada anggota yang cocok dengan pencarian ini.
                  </Typography>
                )}
              </Stack>
            </Stack>

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
                Halaman {members.page} dari {members.totalPages}
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
          </Stack>
        ) : (
          <Paper
            elevation={0}
            sx={{ p: 2.5, borderRadius: 3, border: `1px dashed ${adminPalette.borderStrong}`, backgroundColor: adminPalette.surfaceSoft }}
          >
            <Typography sx={{ fontSize: '0.92rem', color: adminPalette.textMuted }}>
              Pilih salah satu grup di panel kiri untuk melihat susunan anggotanya.
            </Typography>
          </Paper>
        )}
      </Paper>
    </Box>
  );
}
