'use client';

import { type ReactNode, useState } from 'react';
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
import {
  adminMetricLabelSx,
  adminMetricTileSx,
  adminMetricValueSx,
  adminPalette,
  adminPanelSx,
  adminSectionLabelSx,
} from '../lib/adminPalette';
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
  pageSize: number;
  totalPages: number;
  currentSearch: string;
  currentGroupName: string;
  currentSortBy: 'imported_at' | 'nama' | 'no_telp' | 'status';
  currentSortDir: 'asc' | 'desc';
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={adminMetricTileSx}>
      <Typography sx={adminMetricLabelSx}>
        {label}
      </Typography>
      <Typography sx={adminMetricValueSx}>
        {value}
      </Typography>
    </Box>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography sx={adminSectionLabelSx}>
      {children}
    </Typography>
  );
}

export default function ContactsWorkspace({
  overview,
  groupsTotal,
  contacts,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  currentSearch,
  currentGroupName,
  currentSortBy,
  currentSortDir,
}: ContactsWorkspaceProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <Stack spacing={1.25}>
      <Paper elevation={0} sx={adminPanelSx}>
        <Stack spacing={1.25} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={1.25}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', lg: 'center' }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>
                Contacts
              </Typography>
              <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
                Recipient directory
              </Typography>
              <Typography sx={{ mt: 0.55, fontSize: '0.8rem', color: adminPalette.textMuted }}>
                Cari, filter, dan rapikan penerima dari satu tabel kerja yang cepat dipindai.
              </Typography>
            </Box>

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

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
            <MetricTile label="Total" value={overview.totalContacts} />
            <MetricTile label="Groups" value={groupsTotal} />
            <MetricTile label="Ungrouped" value={overview.ungroupedContacts} />
          </Stack>
        </Stack>
      </Paper>

      <PhoneListSearch
        key={`${currentPage}-${currentSearch}-${currentGroupName}-${currentSortBy}-${currentSortDir}`}
        contacts={contacts}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        currentSearch={currentSearch}
        currentGroupName={currentGroupName}
        currentSortBy={currentSortBy}
        currentSortDir={currentSortDir}
      />

      <Drawer
        anchor="right"
        open={addOpen}
        onClose={() => setAddOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 560 },
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
                  Add Contact
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
          </Stack>

          <Box component="form" action={createContactAction} sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Stack spacing={2.2} sx={{ p: 2.5, flex: 1, overflowY: 'auto' }}>
              <Stack spacing={1.4}>
                <SectionLabel>Contact details</SectionLabel>
                <TextField name="nama" label="Nama kontak" required placeholder="Ibu Rina" fullWidth />
                <TextField
                  name="no_telp"
                  label="Nomor WhatsApp"
                  required
                  placeholder="6281234567890"
                  helperText="Gunakan angka saja agar sinkronisasi lebih stabil."
                  fullWidth
                />
                <TextField name="jenis_kelamin" label="Jenis kelamin" select defaultValue="Tidak diketahui" fullWidth>
                  {GENDER_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField name="jabatan" label="Keterangan" placeholder="Orang tua murid" minRows={3} multiline fullWidth />
              </Stack>

              <Stack spacing={1.4}>
                <SectionLabel>Segmentation</SectionLabel>
                <TextField
                  name="group_names"
                  label="Grup"
                  placeholder="Pisahkan dengan koma"
                  helperText="Opsional. Contoh: Orang Tua Kelas A, Alumni 2026"
                  fullWidth
                />
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ p: 2.5, borderTop: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface }}>
              <Button onClick={() => setAddOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                sx={{
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
                Save
              </Button>
            </Stack>
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
