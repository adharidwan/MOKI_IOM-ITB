'use client';

import { useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  Drawer,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import CSVDropZone from '../components/CSVDropZone';
import PhoneListSearch from '../components/PhoneListSearch';
import { adminPalette } from '../lib/adminPalette';
import type { CsvContact } from '../lib/types';
import { createContactAction } from './actions';

const GENDER_OPTIONS = ['Laki-laki', 'Perempuan', 'Tidak diketahui'];

interface ContactsWorkspaceProps {
  overview: {
    totalContacts: number;
    ungroupedContacts: number;
  };
  groupsTotal: number;
  contacts: CsvContact[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  currentSearch: string;
  currentGroupName: string;
}

function MetricTile({ label, value }: { label: string; value: number }) {
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

export default function ContactsWorkspace({
  overview,
  groupsTotal,
  contacts,
  totalCount,
  currentPage,
  totalPages,
  currentSearch,
  currentGroupName,
}: ContactsWorkspaceProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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
        <Stack spacing={1.1} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.2, md: 1.35 } }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={1.25}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', lg: 'center' }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
              <MetricTile label="Total" value={overview.totalContacts} />
              <MetricTile label="Groups" value={groupsTotal} />
              <MetricTile label="Ungrouped" value={overview.ungroupedContacts} />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', lg: 'auto' } }}>
              <Button
                variant="outlined"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => setImportOpen(true)}
                sx={{
                  minHeight: 36,
                  borderRadius: 2,
                  borderColor: adminPalette.borderStrong,
                  color: adminPalette.textSecondary,
                  textTransform: 'none',
                  fontWeight: 700,
                  px: 1.6,
                  backgroundColor: adminPalette.surface,
                  '&:hover': {
                    borderColor: adminPalette.brandSoftStrong,
                    backgroundColor: adminPalette.brandSoft,
                  },
                }}
              >
                Import CSV
              </Button>
              <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                onClick={() => setAddOpen(true)}
                sx={{
                  minHeight: 36,
                  borderRadius: 2,
                  px: 1.7,
                  backgroundColor: adminPalette.brand,
                  textTransform: 'none',
                  fontWeight: 700,
                  boxShadow: 'none',
                  '&:hover': {
                    backgroundColor: adminPalette.brandDark,
                    boxShadow: 'none',
                  },
                }}
              >
                Add Contact
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      <PhoneListSearch
        key={`${currentPage}-${currentSearch}-${currentGroupName}`}
        contacts={contacts}
        totalCount={totalCount}
        currentPage={currentPage}
        totalPages={totalPages}
        currentSearch={currentSearch}
        currentGroupName={currentGroupName}
      />

      <Drawer
        anchor="right"
        open={addOpen}
        onClose={() => setAddOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 440 },
            backgroundColor: adminPalette.canvas,
            borderLeft: `1px solid ${adminPalette.border}`,
          },
        }}
      >
        <Stack sx={{ minHeight: '100%' }}>
          <Stack spacing={1.5} sx={{ px: 2.5, py: 2.25, borderBottom: `1px solid ${adminPalette.border}` }}>
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
                  Quick entry
                </Typography>
                <Typography sx={{ mt: 0.7, fontSize: '1.45rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                  Add contact
                </Typography>
              </Box>
              <IconButton
                onClick={() => setAddOpen(false)}
                size="small"
                sx={{ color: adminPalette.textMuted, '&:hover': { backgroundColor: adminPalette.brandSoft } }}
              >
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Typography sx={{ fontSize: '0.92rem', lineHeight: 1.65, color: adminPalette.textSecondary }}>
              Simpan kontak baru tanpa meninggalkan tabel. Gunakan grup untuk menjaga segmentasi tetap rapi.
            </Typography>
          </Stack>

          <Box component="form" action={createContactAction} sx={{ display: 'grid', gap: 1.5, px: 2.5, py: 2.5 }}>
            <TextField
              name="no_telp"
              label="Nomor WhatsApp"
              required
              placeholder="6281234567890"
              size="small"
              helperText="Gunakan angka saja agar sinkronisasi lebih stabil."
            />
            <TextField name="nama" label="Nama kontak" required placeholder="Ibu Rina" size="small" />
            <TextField name="jenis_kelamin" label="Jenis kelamin" select defaultValue="Tidak diketahui" size="small">
              {GENDER_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField name="jabatan" label="Keterangan" placeholder="Orang tua murid" size="small" />
            <TextField
              name="group_names"
              label="Grup"
              placeholder="Pisahkan dengan koma"
              size="small"
              helperText="Opsional. Contoh: Orang Tua Kelas A, Alumni 2026"
            />
            <Button
              type="submit"
              variant="contained"
              sx={{
                mt: 1,
                minHeight: 46,
                borderRadius: 2.5,
                backgroundColor: adminPalette.brand,
                textTransform: 'none',
                fontWeight: 700,
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: adminPalette.brandDark,
                  boxShadow: 'none',
                },
              }}
            >
              Simpan kontak
            </Button>
          </Box>
        </Stack>
      </Drawer>

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            backgroundColor: adminPalette.surface,
            border: `1px solid ${adminPalette.border}`,
          },
        }}
      >
        <DialogContent sx={{ p: 0 }}>
          <Stack spacing={0}>
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
                    Batch import
                  </Typography>
                  <Typography sx={{ mt: 0.7, fontSize: '1.45rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                    Import contacts from CSV
                  </Typography>
                </Box>
                <IconButton
                  onClick={() => setImportOpen(false)}
                  size="small"
                  sx={{ color: adminPalette.textMuted, '&:hover': { backgroundColor: adminPalette.brandSoft } }}
                >
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
              <Typography sx={{ fontSize: '0.92rem', lineHeight: 1.65, color: adminPalette.textSecondary }}>
                Validasi file dilakukan sebelum penyimpanan agar impor massal tetap aman untuk direktori aktif.
              </Typography>
            </Stack>
            <Box sx={{ p: { xs: 2, md: 2.5 } }}>
              <CSVDropZone />
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
