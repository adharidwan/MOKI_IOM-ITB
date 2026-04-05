'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type { CsvContact } from '../lib/types';
import {
  assignContactGroupAction,
  deleteContactAction,
  deleteContactsBulkAction,
  updateContactAction,
} from '../contacts/actions';

interface PhoneListTableProps {
  contacts: CsvContact[];
}

interface ContactFilters {
  keyword: string;
  groupName: string;
}

const GENDER_OPTIONS = ['Laki-laki', 'Perempuan', 'Tidak diketahui'];

export default function PhoneListTable({ contacts }: PhoneListTableProps) {
  const [filters, setFilters] = useState<ContactFilters>({
    keyword: '',
    groupName: '',
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const keyword = filters.keyword.toLowerCase();
      const groupName = filters.groupName.toLowerCase();
      const matchesKeyword =
        contact.no_telp.toLowerCase().includes(keyword) ||
        contact.nama.toLowerCase().includes(keyword) ||
        (contact.jabatan || '').toLowerCase().includes(keyword);
      const matchesGroup = contact.group_names.join(' ').toLowerCase().includes(groupName);

      return matchesKeyword && matchesGroup;
    });
  }, [contacts, filters]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSelection = (id: string) => {
    setSelectedIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((item) => item !== id);
      }

      return [...previous, id];
    });
  };

  const clearFilters = () => {
    setFilters({ keyword: '', groupName: '' });
  };

  return (
    <Stack spacing={3}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, md: 3 },
          borderRadius: 3,
          border: '1px solid rgba(31, 111, 95, 0.14)',
          backgroundColor: '#ffffff',
        }}
      >
        <Stack spacing={2}>
          <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: '#163020' }}>
            Cari dan rapikan kontak
          </Typography>
          <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: '#4c6258' }}>
            Gunakan pencarian singkat. Setelah itu, pilih kontak yang ingin ditambahkan ke grup atau dihapus.
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr auto' },
              gap: 2,
              alignItems: 'center',
            }}
          >
            <TextField
              label="Cari nama, nomor, atau jabatan"
              value={filters.keyword}
              onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
              placeholder="Contoh: Budi atau 62812"
              fullWidth
            />
            <TextField
              label="Filter grup"
              value={filters.groupName}
              onChange={(event) => setFilters((prev) => ({ ...prev, groupName: event.target.value }))}
              placeholder="Contoh: Orang Tua TK A"
              fullWidth
            />
            <Button
              variant="outlined"
              size="large"
              onClick={clearFilters}
              sx={{
                minHeight: 56,
                borderRadius: 3,
                px: 3,
                borderColor: '#1f6f5f',
                color: '#1f6f5f',
                textTransform: 'none',
                fontWeight: 700,
              }}
            >
              Reset pencarian
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, md: 3 },
          borderRadius: 3,
          border: '1px solid rgba(31, 111, 95, 0.14)',
          backgroundColor: '#f8fcfb',
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', lg: 'center' }}
        >
          <Stack spacing={0.5}>
            <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: '#163020' }}>
              {filteredContacts.length} kontak ditemukan
            </Typography>
            <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
              {selectedIds.length} kontak sedang dipilih.
            </Typography>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', lg: 'auto' } }}>
            <Box
              component="form"
              action={assignContactGroupAction}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr auto' },
                gap: 1.5,
                width: { xs: '100%', lg: 420 },
              }}
            >
              <input type="hidden" name="ids" value={JSON.stringify(selectedIds)} />
              <TextField
                name="group_names"
                label="Tambahkan ke grup"
                placeholder="Contoh: Orang Tua Kelas A"
                disabled={selectedIds.length === 0}
                fullWidth
              />
              <Button
                type="submit"
                variant="contained"
                disabled={selectedIds.length === 0}
                sx={{
                  minHeight: 56,
                  borderRadius: 3,
                  backgroundColor: '#1f6f5f',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Simpan grup
              </Button>
            </Box>

            <Box component="form" action={deleteContactsBulkAction}>
              <input type="hidden" name="ids" value={JSON.stringify(selectedIds)} />
              <Button
                type="submit"
                variant="outlined"
                color="error"
                disabled={selectedIds.length === 0}
                sx={{
                  minHeight: 56,
                  borderRadius: 3,
                  px: 3,
                  textTransform: 'none',
                  fontWeight: 700,
                  width: { xs: '100%', md: 'auto' },
                }}
              >
                Hapus {selectedIds.length || ''} kontak
              </Button>
            </Box>
          </Stack>
        </Stack>
      </Paper>

      {filteredContacts.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          Tidak ada kontak yang cocok. Coba ubah kata pencarian atau filter grup.
        </Alert>
      ) : (
        <Stack spacing={2}>
          {filteredContacts.map((contact, index) => (
            <Paper
              key={contact.id}
              elevation={0}
              sx={{
                p: { xs: 2.5, md: 3 },
                borderRadius: 3,
                border: selectedSet.has(contact.id)
                  ? '2px solid #1f6f5f'
                  : '1px solid rgba(31, 111, 95, 0.14)',
                backgroundColor: selectedSet.has(contact.id) ? '#f2fbf8' : '#ffffff',
              }}
            >
              <Stack spacing={2.5}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Checkbox
                      checked={selectedSet.has(contact.id)}
                      onChange={() => toggleSelection(contact.id)}
                      inputProps={{ 'aria-label': `pilih kontak ${contact.no_telp}` }}
                    />
                    <Stack spacing={0.5}>
                      <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: '#163020' }}>
                        Kontak {index + 1}
                      </Typography>
                      <Typography sx={{ fontSize: '0.98rem', color: '#51645d' }}>
                        Centang jika ingin masukkan ke grup atau hapus bersama.
                      </Typography>
                    </Stack>
                  </Stack>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {contact.group_names.length > 0 ? (
                      contact.group_names.map((groupName) => (
                        <Chip
                          key={`${contact.id}-${groupName}`}
                          label={groupName}
                          sx={{
                            backgroundColor: '#e6f4ef',
                            color: '#1f4d3a',
                            fontWeight: 700,
                          }}
                        />
                      ))
                    ) : (
                      <Chip
                        label="Belum ada grup"
                        sx={{ backgroundColor: '#f3f1e8', color: '#655f50', fontWeight: 700 }}
                      />
                    )}
                  </Stack>
                </Stack>

                <Stack spacing={2}>
                  <Box
                    component="form"
                    action={updateContactAction}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1.2fr 1fr 0.8fr 1fr' },
                      gap: 2,
                    }}
                  >
                    <input type="hidden" name="id" value={contact.id} />
                    <TextField
                      name="no_telp"
                      label="Nomor WhatsApp"
                      defaultValue={contact.no_telp}
                      required
                      fullWidth
                    />
                    <TextField name="nama" label="Nama kontak" defaultValue={contact.nama} required fullWidth />
                    <TextField
                      name="jenis_kelamin"
                      label="Jenis kelamin"
                      defaultValue={contact.jenis_kelamin}
                      select
                      fullWidth
                    >
                      {GENDER_OPTIONS.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      name="jabatan"
                      label="Keterangan tambahan"
                      defaultValue={contact.jabatan || ''}
                      placeholder="Contoh: Orang tua murid"
                      fullWidth
                    />
                    <TextField
                      name="group_names"
                      label="Grup"
                      defaultValue={contact.group_names.join(', ')}
                      placeholder="Pisahkan dengan koma"
                      fullWidth
                      sx={{ gridColumn: { xs: '1 / -1', xl: '1 / span 3' } }}
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      sx={{
                        minHeight: 56,
                        borderRadius: 3,
                        backgroundColor: '#1f6f5f',
                        textTransform: 'none',
                        fontWeight: 700,
                        gridColumn: { xs: '1 / -1', xl: '4 / 5' },
                      }}
                    >
                      Simpan perubahan
                    </Button>
                  </Box>

                  <Box component="form" action={deleteContactAction} sx={{ alignSelf: 'flex-start' }}>
                    <input type="hidden" name="id" value={contact.id} />
                    <Button
                      type="submit"
                      variant="outlined"
                      color="error"
                      sx={{
                        minHeight: 52,
                        borderRadius: 999,
                        px: 3,
                        textTransform: 'none',
                        fontWeight: 700,
                      }}
                    >
                      Hapus kontak ini
                    </Button>
                  </Box>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
