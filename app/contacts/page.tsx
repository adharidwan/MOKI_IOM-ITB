import Link from 'next/link';
import { Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';

import AdminFeatureShell from '../components/AdminFeatureShell';
import CSVDropZone from '../components/CSVDropZone';
import PhoneListSearch from '../components/PhoneListSearch';
import PhoneListToast from '../components/PhoneListToast';
import { getCsvContacts } from '../lib/api';
import { createContactAction } from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GENDER_OPTIONS = ['Laki-laki', 'Perempuan', 'Tidak diketahui'];

export default async function ContactsPage() {
  const contacts = await getCsvContacts();
  const availableGroups = Array.from(
    new Set(contacts.flatMap((contact) => contact.group_names)),
  ).sort((left, right) => left.localeCompare(right));

  return (
    <AdminFeatureShell
      currentPath="/contacts"
      badge="Halaman kontak"
      title="Tambahkan dan kelola daftar kontak untuk dikirim pesan"
      description="Simpan nomor WhatsApp dengan cara yang paling mudah: tambah satu per satu, upload CSV, lalu rapikan ke dalam grup."
      actions={
        <Link href="/blastmessage" style={{ textDecoration: 'none' }}>
          <Button
            variant="contained"
            size="large"
            sx={{
              minHeight: 56,
              borderRadius: 999,
              px: 3.5,
              backgroundColor: '#1f6f5f',
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            Lanjut ke blast message
          </Button>
        </Link>
      }
    >
      <PhoneListToast />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: '1.05fr 1.2fr' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Stack spacing={3}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2.5, md: 3.5 },
              borderRadius: 3,
              border: '1px solid rgba(31, 111, 95, 0.14)',
              backgroundColor: '#ffffff',
            }}
          >
            <Stack spacing={2.5}>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#163020' }}>
                Tambah kontak satu per satu
              </Typography>
              <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: '#50665d' }}>
                Gunakan formulir singkat ini jika ingin memasukkan kontak secara manual.
              </Typography>

              <Box
                component="form"
                action={createContactAction}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: 2,
                }}
              >
                <TextField
                  name="no_telp"
                  label="Nomor WhatsApp"
                  required
                  placeholder="Contoh: 6281234567890"
                  helperText="Masukkan angka saja agar lebih mudah dibaca sistem."
                />
                <TextField
                  name="nama"
                  label="Nama kontak"
                  required
                  placeholder="Contoh: Ibu Rina"
                />
                <TextField name="jenis_kelamin" label="Jenis kelamin" select defaultValue="Tidak diketahui">
                  {GENDER_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  name="jabatan"
                  label="Keterangan tambahan"
                  placeholder="Contoh: Orang tua murid"
                />
                <TextField
                  name="group_names"
                  label="Grup (opsional)"
                  placeholder="Contoh: Orang Tua Kelas A"
                  helperText="Jika lebih dari satu, pisahkan dengan koma."
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
                    fontSize: '1rem',
                  }}
                >
                  Simpan kontak
                </Button>
              </Box>
            </Stack>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: { xs: 2.5, md: 3.5 },
              borderRadius: 3,
              border: '1px solid rgba(31, 111, 95, 0.14)',
              backgroundColor: '#fffdf8',
            }}
          >
            <Stack spacing={1.5}>
              <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: '#163020' }}>
                Ringkasan cepat
              </Typography>
              <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
                Total kontak: <strong>{contacts.length}</strong>
              </Typography>
              <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
                Total grup: <strong>{availableGroups.length}</strong>
              </Typography>
            </Stack>
          </Paper>
        </Stack>

        <CSVDropZone />
      </Box>

      <PhoneListSearch contacts={contacts} />
    </AdminFeatureShell>
  );
}
