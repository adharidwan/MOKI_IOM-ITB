'use client';

import { useCallback, useState } from 'react';
import Papa from 'papaparse';
import { useDropzone } from 'react-dropzone';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';

import { importCsvContactsAction } from '../csv/actions';

interface CSVRow {
  no_telp: string;
  nama: string;
  jenis_kelamin: string;
}

interface RawCSVRow {
  nomor?: string;
  no_telp?: string;
  'no telp'?: string;
  phone?: string;
  nama?: string;
}

interface ParsedData {
  data: CSVRow[];
  errors: string[];
  fileName: string;
}

function normalizePhoneNumber(rawValue: string): string | null {
  const digitsOnly = String(rawValue || '').replace(/\D/g, '');
  return digitsOnly.length >= 8 && digitsOnly.length <= 15 ? digitsOnly : null;
}

function readPhoneNumber(row: RawCSVRow): string {
  return String(row.nomor || row.no_telp || row['no telp'] || row.phone || '').trim();
}

export default function CSVDropZone() {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];

    if (!file) {
      setStatus({ type: 'error', message: 'Silakan pilih file CSV terlebih dahulu.' });
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setStatus({ type: 'error', message: 'File harus berformat .csv.' });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: 'info', message: 'Membaca file CSV...' });
    setParsedData(null);

    Papa.parse<RawCSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        const errors: string[] = [];
        const rows: CSVRow[] = [];

        results.data.forEach((row, index) => {
          const lineNumber = index + 2;
          const phoneNumber = normalizePhoneNumber(readPhoneNumber(row));

          if (!phoneNumber) {
            errors.push(`Baris ${lineNumber}: nomor belum valid.`);
            return;
          }

          const name = String(row.nama || '').trim() || `Kontak ${phoneNumber}`;

          rows.push({
            no_telp: phoneNumber,
            nama: name,
            jenis_kelamin: 'Tidak diketahui',
          });
        });

        setParsedData({
          data: rows,
          errors,
          fileName: file.name,
        });

        if (rows.length > 0) {
          setStatus({
            type: 'success',
            message: `${rows.length} kontak siap disimpan. Cek ringkasan di bawah sebelum lanjut.`,
          });
        } else {
          setStatus({
            type: 'error',
            message: 'Belum ada kontak yang bisa diproses. Periksa isi file CSV Anda.',
          });
        }

        setIsProcessing(false);
      },
      error: (error) => {
        setStatus({ type: 'error', message: `File tidak bisa dibaca: ${error.message}` });
        setIsProcessing(false);
      },
    });
  }, []);

  const onDropRejected = useCallback(() => {
    setStatus({ type: 'error', message: 'Hanya file .csv yang bisa digunakan.' });
  }, []);

  const { getInputProps, getRootProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    multiple: false,
    maxFiles: 1,
    noClick: true,
    noKeyboard: true,
  });

  const handleReset = () => {
    setParsedData(null);
    setStatus(null);
    setInputKey((previous) => previous + 1);
  };

  const handleImport = async () => {
    if (!parsedData?.data.length) {
      setStatus({ type: 'error', message: 'Belum ada kontak yang siap disimpan.' });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: 'info', message: 'Menyimpan kontak ke sistem...' });

    const result = await importCsvContactsAction(parsedData.data, parsedData.fileName);

    if (!result.success) {
      setStatus({ type: 'error', message: result.error || 'Import kontak gagal.' });
      setIsProcessing(false);
      return;
    }

    setStatus({
      type: 'success',
      message: `${result.inserted} kontak berhasil disimpan dan siap dipakai untuk blast message.`,
    });
    setIsProcessing(false);
  };

  return (
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
        <Stack spacing={1}>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#163020' }}>
            Tambah kontak dari file CSV
          </Typography>
          <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: '#50665d' }}>
            Upload file CSV dengan kolom: <strong>nomor</strong>, <strong>nama</strong> (opsional).
            Jika nama kosong, sistem akan tetap menyimpan nomor teleponnya.
          </Typography>
        </Stack>

        <Paper
          {...getRootProps()}
          elevation={0}
          onClick={open}
          sx={{
            borderRadius: 3,
            border: isDragActive ? '2px solid #1f6f5f' : '2px dashed rgba(31, 111, 95, 0.3)',
            backgroundColor: isDragActive ? '#f2fbf8' : '#f9fcfb',
            p: { xs: 3, md: 4 },
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <input key={inputKey} {...getInputProps({ accept: '.csv,text/csv' })} />
          {isDragActive ? (
            <CloudUploadRoundedIcon sx={{ fontSize: 58, color: '#1f6f5f' }} />
          ) : (
            <DescriptionRoundedIcon sx={{ fontSize: 58, color: '#1f6f5f' }} />
          )}
          <Typography sx={{ mt: 1.5, fontSize: '1.2rem', fontWeight: 800, color: '#163020' }}>
            {isDragActive ? 'Lepaskan file di sini' : 'Klik atau tarik file CSV ke area ini'}
          </Typography>
          <Typography sx={{ mt: 1, fontSize: '1rem', color: '#567066' }}>
            Contoh isi file: `nomor,nama`
          </Typography>
        </Paper>

        {isProcessing ? <LinearProgress sx={{ borderRadius: 999 }} /> : null}

        {status ? (
          <Alert severity={status.type} sx={{ borderRadius: 3, '& .MuiAlert-message': { fontSize: '1rem' } }}>
            {status.message}
          </Alert>
        ) : null}

        {parsedData ? (
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: '1px solid rgba(31, 111, 95, 0.12)',
              backgroundColor: '#fcfdfb',
            }}
          >
            <Stack spacing={2}>
              <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#163020' }}>
                Ringkasan file: {parsedData.fileName}
              </Typography>
              <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
                {parsedData.data.length} kontak siap dipakai.
              </Typography>

              {parsedData.errors.length > 0 ? (
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                  {parsedData.errors.slice(0, 4).join(' ')}
                  {parsedData.errors.length > 4 ? ' Masih ada baris lain yang perlu diperiksa.' : ''}
                </Alert>
              ) : null}

              <Stack spacing={1}>
                {parsedData.data.slice(0, 5).map((row, index) => (
                  <Box
                    key={`${row.no_telp}-${index}`}
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderRadius: 2,
                      backgroundColor: '#f4f8f6',
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' },
                      gap: 1,
                    }}
                  >
                    <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#163020' }}>
                      {row.no_telp}
                    </Typography>
                    <Typography sx={{ fontSize: '1rem', color: '#4d635b' }}>{row.nama}</Typography>
                  </Box>
                ))}
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  variant="contained"
                  onClick={handleImport}
                  disabled={isProcessing || parsedData.data.length === 0}
                  sx={{
                    minHeight: 56,
                    borderRadius: 3,
                    backgroundColor: '#1f6f5f',
                    px: 3,
                    textTransform: 'none',
                    fontWeight: 700,
                  }}
                >
                  Simpan kontak dari CSV
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleReset}
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
                  Pilih file lain
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ) : null}
      </Stack>
    </Paper>
  );
}
