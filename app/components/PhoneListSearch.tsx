'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import type { CsvContact } from '../lib/types';
import {
  deletePhoneListContactAction,
  deletePhoneListContactsBulkAction,
  updatePhoneListContactAction,
} from '../phonelist/actions';

interface PhoneListTableProps {
  contacts: CsvContact[];
}

interface ColumnFilters {
  no_telp: string;
  nama: string;
  jenis_kelamin: string;
  jabatan: string;
}

export default function PhoneListTable({ contacts }: PhoneListTableProps) {
  const [filters, setFilters] = useState<ColumnFilters>({
    no_telp: '',
    nama: '',
    jenis_kelamin: '',
    jabatan: '',
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const noTelpMatch = contact.no_telp.toLowerCase().includes(filters.no_telp.toLowerCase());
      const namaMatch = contact.nama.toLowerCase().includes(filters.nama.toLowerCase());
      const jenisKelaminMatch = contact.jenis_kelamin
        .toLowerCase()
        .includes(filters.jenis_kelamin.toLowerCase());
      const jabatanMatch = (contact.jabatan || '').toLowerCase().includes(filters.jabatan.toLowerCase());

      return noTelpMatch && namaMatch && jenisKelaminMatch && jabatanMatch;
    });
  }, [contacts, filters]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const allFilteredSelected = filteredContacts.length > 0
    && filteredContacts.every((contact) => selectedSet.has(contact.id));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredContacts.map((contact) => contact.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.has(id)));
      return;
    }

    setSelectedIds((prev) => {
      const merged = new Set(prev);
      filteredContacts.forEach((contact) => merged.add(contact.id));
      return Array.from(merged);
    });
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }

      return [...prev, id];
    });
  };

  return (
    <>
      <Paper sx={{ mb: 2, backgroundColor: 'transparent', boxShadow: 'none' }}>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold', color: '#4e8d9c' }}>
          Search per kolom
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' },
            gap: 1,
          }}
        >
          <TextField
            label="Cari No Telp"
            size="small"
            value={filters.no_telp}
            onChange={(event) => setFilters((prev) => ({ ...prev, no_telp: event.target.value }))}
          />
          <TextField
            label="Cari Nama"
            size="small"
            value={filters.nama}
            onChange={(event) => setFilters((prev) => ({ ...prev, nama: event.target.value }))}
          />
          <TextField
            label="Cari Jenis kelamin"
            size="small"
            value={filters.jenis_kelamin}
            onChange={(event) => setFilters((prev) => ({ ...prev, jenis_kelamin: event.target.value }))}
          />
          <TextField
            label="Cari Jabatan"
            size="small"
            value={filters.jabatan}
            onChange={(event) => setFilters((prev) => ({ ...prev, jabatan: event.target.value }))}
          />
        </Box>
      </Paper>

      <Box
        component="form"
        action={deletePhoneListContactsBulkAction}
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
      >
        <Typography variant="body2" color="textSecondary">
          {selectedIds.length} data dipilih dari {filteredContacts.length} hasil filter.
        </Typography>
        <input type="hidden" name="ids" value={JSON.stringify(selectedIds)} />
        <Button
          type="submit"
          variant="contained"
          color="error"
          disabled={selectedIds.length === 0}
        >
          Hapus Massal ({selectedIds.length})
        </Button>
      </Box>

      {filteredContacts.length === 0 ? (
        <Typography variant="body2" color="textSecondary">Tidak ada data yang cocok dengan filter.</Typography>
      ) : (
        <TableContainer sx={{ border: '1px solid #ccc', borderRadius: 1, backgroundColor: 'transparent' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={allFilteredSelected}
                    indeterminate={selectedIds.length > 0 && !allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    inputProps={{ 'aria-label': 'select all filtered' }}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>No Telp</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Nama</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Jenis kelamin</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Jabatan</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Aksi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContacts.map((contact) => (
                <TableRow key={contact.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedSet.has(contact.id)}
                      onChange={() => toggleSelectOne(contact.id)}
                      inputProps={{ 'aria-label': `select ${contact.no_telp}` }}
                    />
                  </TableCell>
                  <TableCell colSpan={5} sx={{ py: 1.5 }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', lg: '1fr auto' },
                        gap: 1,
                        alignItems: 'center',
                      }}
                    >
                      <Box
                        component="form"
                        action={updatePhoneListContactAction}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', lg: '1.3fr 1.2fr 1fr 1fr auto' },
                          gap: 1,
                          alignItems: 'center',
                        }}
                      >
                        <input type="hidden" name="id" value={contact.id} />
                        <TextField name="no_telp" defaultValue={contact.no_telp} required size="small" />
                        <TextField name="nama" defaultValue={contact.nama} required size="small" />
                        <TextField
                          name="jenis_kelamin"
                          defaultValue={contact.jenis_kelamin}
                          required
                          size="small"
                        />
                        <TextField name="jabatan" defaultValue={contact.jabatan || ''} size="small" />

                        <Button type="submit" variant="outlined" color="primary" sx={{ minWidth: 90 }}>
                          Update
                        </Button>
                      </Box>

                      <Box component="form" action={deletePhoneListContactAction} sx={{ justifySelf: { lg: 'end' } }}>
                        <input type="hidden" name="id" value={contact.id} />
                        <Button type="submit" variant="outlined" color="error" sx={{ minWidth: 90 }}>
                          Hapus
                        </Button>
                      </Box>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
