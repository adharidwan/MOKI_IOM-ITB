"use client"

import Link from 'next/link';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';

export default function HomePage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(180deg, #f8f4e8 0%, #fdfcf8 35%, #eef6f5 100%)',
        py: 4,
      }}
    >
      <Container maxWidth="md">
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 5 },
            borderRadius: 4,
            border: '1px solid rgba(31, 111, 95, 0.14)',
            backgroundColor: 'rgba(255,255,255,0.92)',
          }}
        >
          <Stack spacing={3}>
            <Typography sx={{ fontSize: { xs: '2rem', md: '3rem' }, fontWeight: 800, color: '#163020' }}>
              Pilih menu yang ingin digunakan
            </Typography>
            <Typography sx={{ fontSize: '1.1rem', lineHeight: 1.8, color: '#50665d' }}>
              Anda bisa mulai dari mengatur kontak, atau langsung masuk ke halaman kirim blast message.
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 2,
              }}
            >
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  border: '1px solid rgba(31, 111, 95, 0.14)',
                  backgroundColor: '#fffdf8',
                }}
              >
                <Stack spacing={1.5}>
                  <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: '#163020' }}>
                    Kontak & Grup
                  </Typography>
                  <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: '#50665d' }}>
                    Tambah nomor, upload CSV, lalu rapikan penerima ke dalam grup.
                  </Typography>
                  <Button
                    component={Link}
                    href="/contacts"
                    variant="contained"
                    sx={{
                      alignSelf: 'flex-start',
                      minHeight: 56,
                      borderRadius: 999,
                      px: 3.5,
                      backgroundColor: '#1f6f5f',
                      textTransform: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Buka kontak
                  </Button>
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  border: '1px solid rgba(31, 111, 95, 0.14)',
                  backgroundColor: '#f7faf8',
                }}
              >
                <Stack spacing={1.5}>
                  <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: '#163020' }}>
                    Blast Message
                  </Typography>
                  <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: '#50665d' }}>
                    Pilih penerima, tulis pesan, cek preview, lalu kirim.
                  </Typography>
                  <Button
                    component={Link}
                    href="/blastmessage"
                    variant="outlined"
                    sx={{
                      alignSelf: 'flex-start',
                      minHeight: 56,
                      borderRadius: 999,
                      px: 3.5,
                      borderColor: '#1f6f5f',
                      color: '#1f6f5f',
                      textTransform: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Buka blast message
                  </Button>
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  border: '1px solid rgba(217, 167, 84, 0.2)',
                  backgroundColor: '#fffaf0',
                }}
              >
                <Stack spacing={1.5}>
                  <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: '#163020' }}>
                    Content Recording
                  </Typography>
                  <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: '#50665d' }}>
                    Simpan referensi konten YouTube, X, dan Instagram dengan auto-fill dari link hasil scrape.
                  </Typography>
                  <Button
                    component={Link}
                    href="/content-record"
                    variant="outlined"
                    sx={{
                      alignSelf: 'flex-start',
                      minHeight: 56,
                      borderRadius: 999,
                      px: 3.5,
                      borderColor: '#d9a754',
                      color: '#9a6506',
                      textTransform: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Buka content recording
                  </Button>
                </Stack>
              </Paper>
            </Box>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
