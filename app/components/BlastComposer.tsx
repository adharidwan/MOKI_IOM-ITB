'use client';

import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import PersonAddAltRoundedIcon from '@mui/icons-material/PersonAddAltRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';

import type { CsvContact } from '../lib/types';

type RecipientSource = 'group' | 'csv' | 'manual';

interface BlastComposerProps {
  contacts: CsvContact[];
  availableGroups: string[];
}

interface RecipientInput {
  no_telp: string;
  nama?: string;
}

interface ParsedCsvRow {
  nomor?: string;
  no_telp?: string;
  'no telp'?: string;
  phone?: string;
  nama?: string;
}

const STEP_TITLES = [
  'Pilih penerima',
  'Review penerima',
  'Tulis pesan',
  'Preview & kirim',
];
const MAX_MESSAGE_LENGTH = 4096;

function normalizePhoneNumber(rawValue: string): string | null {
  const digitsOnly = String(rawValue || '').replace(/\D/g, '');
  return digitsOnly.length >= 8 && digitsOnly.length <= 15 ? digitsOnly : null;
}

function uniqueRecipients(recipients: RecipientInput[]): RecipientInput[] {
  const deduped = new Map<string, RecipientInput>();

  recipients.forEach((recipient) => {
    const normalizedPhone = normalizePhoneNumber(recipient.no_telp);

    if (!normalizedPhone) {
      return;
    }

    deduped.set(normalizedPhone, {
      no_telp: normalizedPhone,
      nama: String(recipient.nama || '').trim() || undefined,
    });
  });

  return Array.from(deduped.values());
}

function sourceLabel(source: RecipientSource | null): string {
  if (source === 'group') return 'Grup kontak';
  if (source === 'csv') return 'File CSV';
  if (source === 'manual') return 'Input manual';
  return '-';
}

export default function BlastComposer({ contacts, availableGroups }: BlastComposerProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSource, setSelectedSource] = useState<RecipientSource | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualRecipients, setManualRecipients] = useState<RecipientInput[]>([]);
  const [csvRecipients, setCsvRecipients] = useState<RecipientInput[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<
    { type: 'success' | 'error' | 'info' | 'warning'; message: string } | null
  >(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const groupsWithCounts = useMemo(() => {
    return availableGroups.map((groupName) => ({
      name: groupName,
      count: contacts.filter((contact) => contact.group_names.includes(groupName)).length,
    }));
  }, [availableGroups, contacts]);

  const recipients = useMemo(() => {
    if (selectedSource === 'group') {
      return uniqueRecipients(
        contacts
          .filter((contact) => contact.group_names.some((groupName) => selectedGroups.includes(groupName)))
          .map((contact) => ({
            no_telp: contact.no_telp,
            nama: contact.nama,
          })),
      );
    }

    if (selectedSource === 'csv') {
      return uniqueRecipients(csvRecipients);
    }

    if (selectedSource === 'manual') {
      return uniqueRecipients(manualRecipients);
    }

    return [];
  }, [contacts, csvRecipients, manualRecipients, selectedGroups, selectedSource]);

  const canContinueFromStepOne =
    (selectedSource === 'group' && selectedGroups.length > 0 && recipients.length > 0) ||
    (selectedSource === 'csv' && recipients.length > 0) ||
    (selectedSource === 'manual' && recipients.length > 0);
  const canContinueFromStepThree =
    message.trim().length > 0 && message.trim().length <= MAX_MESSAGE_LENGTH;

  const handleSourceChange = (source: RecipientSource) => {
    setSelectedSource(source);
    setStatus(null);
    setCurrentStep(1);
  };

  const toggleGroup = (groupName: string) => {
    setSelectedGroups((previous) => {
      if (previous.includes(groupName)) {
        return previous.filter((item) => item !== groupName);
      }

      return [...previous, groupName];
    });
  };

  const handleAddManualRecipient = () => {
    const normalizedPhone = normalizePhoneNumber(manualPhone);

    if (!normalizedPhone) {
      setStatus({ type: 'error', message: 'Nomor belum valid. Gunakan 8 sampai 15 digit angka.' });
      return;
    }

    setManualRecipients((previous) =>
      uniqueRecipients([
        ...previous,
        {
          no_telp: normalizedPhone,
          nama: manualName.trim() || undefined,
        },
      ]),
    );
    setManualPhone('');
    setManualName('');
    setStatus({ type: 'success', message: 'Nomor berhasil ditambahkan ke daftar penerima.' });
  };

  const handleRemoveManualRecipient = (phoneNumber: string) => {
    setManualRecipients((previous) => previous.filter((recipient) => recipient.no_telp !== phoneNumber));
  };

  const handleCsvFile = (file: File) => {
    setStatus({ type: 'info', message: 'Membaca file CSV...' });
    setCsvFileName(file.name);

    Papa.parse<ParsedCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        const parsedRecipients = uniqueRecipients(
          results.data.map((row) => ({
            no_telp: String(row.nomor || row.no_telp || row['no telp'] || row.phone || '').trim(),
            nama: String(row.nama || '').trim() || undefined,
          })),
        );

        setCsvRecipients(parsedRecipients);

        if (parsedRecipients.length === 0) {
          setStatus({
            type: 'error',
            message: 'File CSV belum berisi nomor yang valid. Gunakan kolom: nomor, nama (opsional).',
          });
          return;
        }

        setStatus({
          type: 'success',
          message: `${parsedRecipients.length} penerima ditemukan dari file CSV.`,
        });
      },
      error: (error) => {
        setStatus({ type: 'error', message: `CSV gagal dibaca: ${error.message}` });
      },
    });
  };

  const handleNextStep = () => {
    if (currentStep === 1 && !canContinueFromStepOne) {
      setStatus({
        type: 'error',
        message: 'Pilih penerima terlebih dahulu sampai jumlah penerima tampil.',
      });
      return;
    }

    if (currentStep === 3 && !canContinueFromStepThree) {
      setStatus({
        type: 'error',
        message: 'Tulis pesan terlebih dahulu sebelum lanjut.',
      });
      return;
    }

    setStatus(null);
    setCurrentStep((previous) => Math.min(previous + 1, 4));
  };

  const handlePreviousStep = () => {
    setStatus(null);
    setCurrentStep((previous) => Math.max(previous - 1, 1));
  };

  const handleSendBlast = async () => {
    if (!selectedSource || recipients.length === 0 || !message.trim()) {
      setConfirmOpen(false);
      setStatus({ type: 'error', message: 'Data blast belum lengkap. Periksa lagi sebelum kirim.' });
      return;
    }

    setSubmitting(true);
    setConfirmOpen(false);
    setStatus({ type: 'info', message: 'Mengirim pesan ke antrian...' });

    const response = await fetch('/api/admin/blast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: selectedSource,
        message,
        recipients: selectedSource === 'group' ? undefined : recipients,
        groupNames: selectedSource === 'group' ? selectedGroups : undefined,
        sourceFile: selectedSource === 'csv' ? csvFileName || 'blast-csv' : undefined,
      }),
    });

    const result = (await response.json()) as {
      error?: string;
      acceptedCount?: number;
      failedCount?: number;
      totalRecipients?: number;
    };

    if (!response.ok) {
      setStatus({ type: 'error', message: result.error || 'Pesan gagal dikirim.' });
      setSubmitting(false);
      return;
    }

    if ((result.failedCount || 0) > 0) {
      setStatus({
        type: 'warning',
        message: `Pesan masuk ke antrian untuk ${result.acceptedCount || 0} penerima. ${
          result.failedCount || 0
        } penerima gagal dan perlu diperiksa.`,
      });
    } else {
      setStatus({
        type: 'success',
        message: `Pesan berhasil dikirim ke ${result.acceptedCount || recipients.length} penerima.`,
      });
    }

    setCurrentStep(4);
    setSubmitting(false);
  };

  const handleReset = () => {
    setCurrentStep(1);
    setSelectedSource(null);
    setSelectedGroups([]);
    setManualPhone('');
    setManualName('');
    setManualRecipients([]);
    setCsvRecipients([]);
    setCsvFileName('');
    setMessage('');
    setSubmitting(false);
    setStatus(null);
    setConfirmOpen(false);
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
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#163020' }}>
            Langkah cepat kirim pesan
          </Typography>
          <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: '#50665d' }}>
            Ikuti urutan ini: pilih penerima, cek daftar, tulis pesan, lalu kirim.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' },
              gap: 1.5,
            }}
          >
            {STEP_TITLES.map((stepTitle, index) => {
              const stepNumber = index + 1;
              const active = currentStep === stepNumber;
              const completed = currentStep > stepNumber;

              return (
                <Paper
                  key={stepTitle}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    border: active
                      ? '2px solid #1f6f5f'
                      : '1px solid rgba(31, 111, 95, 0.14)',
                    backgroundColor: completed ? '#eef8f3' : '#fafcfb',
                  }}
                >
                  <Stack spacing={0.8}>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#1f6f5f' }}>
                      Langkah {stepNumber}
                    </Typography>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#163020' }}>
                      {stepTitle}
                    </Typography>
                  </Stack>
                </Paper>
              );
            })}
          </Box>
        </Stack>
      </Paper>

      {status ? (
        <Alert severity={status.type} sx={{ borderRadius: 3, '& .MuiAlert-message': { fontSize: '1rem' } }}>
          {status.message}
        </Alert>
      ) : null}

      {currentStep === 1 ? (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, md: 3.5 },
            borderRadius: 3,
            border: '1px solid rgba(31, 111, 95, 0.14)',
            backgroundColor: '#ffffff',
          }}
        >
          <Stack spacing={3}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#163020' }}>
              1. Pilih penerima
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: 2,
              }}
            >
              {[
                {
                  value: 'group' as const,
                  title: 'Pilih dari grup',
                  helper: 'Pakai kontak yang sudah dikelompokkan sebelumnya.',
                  icon: <GroupRoundedIcon sx={{ fontSize: 34, color: '#1f6f5f' }} />,
                },
                {
                  value: 'csv' as const,
                  title: 'Upload CSV',
                  helper: 'Upload daftar nomor dari file CSV sederhana.',
                  icon: <UploadFileRoundedIcon sx={{ fontSize: 34, color: '#1f6f5f' }} />,
                },
                {
                  value: 'manual' as const,
                  title: 'Input manual',
                  helper: 'Masukkan nomor satu per satu dengan tombol tambah.',
                  icon: <PersonAddAltRoundedIcon sx={{ fontSize: 34, color: '#1f6f5f' }} />,
                },
              ].map((option) => {
                const active = selectedSource === option.value;

                return (
                  <Paper
                    key={option.value}
                    elevation={0}
                    sx={{
                      p: 2.5,
                      borderRadius: 3,
                      border: active ? '2px solid #1f6f5f' : '1px solid rgba(31, 111, 95, 0.14)',
                      backgroundColor: active ? '#f2fbf8' : '#fffdf8',
                    }}
                  >
                    <Stack spacing={1.5}>
                      {option.icon}
                      <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#163020' }}>
                        {option.title}
                      </Typography>
                      <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: '#50665d' }}>
                        {option.helper}
                      </Typography>
                      <Button
                        variant={active ? 'contained' : 'outlined'}
                        onClick={() => handleSourceChange(option.value)}
                        sx={{
                          alignSelf: 'flex-start',
                          minHeight: 50,
                          borderRadius: 999,
                          px: 3,
                          backgroundColor: active ? '#1f6f5f' : undefined,
                          borderColor: '#1f6f5f',
                          color: active ? '#ffffff' : '#1f6f5f',
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {active ? 'Sedang dipilih' : 'Pilih cara ini'}
                      </Button>
                    </Stack>
                  </Paper>
                );
              })}
            </Box>

            {selectedSource === 'group' ? (
              <Stack spacing={2}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: '#163020' }}>
                  Pilih grup penerima
                </Typography>
                {groupsWithCounts.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    Belum ada grup kontak. Tambahkan grup dulu di halaman Kontak & Grup.
                  </Alert>
                ) : (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                      gap: 1.5,
                    }}
                  >
                    {groupsWithCounts.map((group) => {
                      const active = selectedGroups.includes(group.name);

                      return (
                        <Paper
                          key={group.name}
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: active
                              ? '2px solid #1f6f5f'
                              : '1px solid rgba(31, 111, 95, 0.14)',
                            backgroundColor: active ? '#f2fbf8' : '#fafcfb',
                            cursor: 'pointer',
                          }}
                          onClick={() => toggleGroup(group.name)}
                        >
                          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                            <Stack spacing={0.4}>
                              <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#163020' }}>
                                {group.name}
                              </Typography>
                              <Typography sx={{ fontSize: '0.98rem', color: '#50665d' }}>
                                {group.count} kontak
                              </Typography>
                            </Stack>
                            <Checkbox checked={active} />
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Box>
                )}
              </Stack>
            ) : null}

            {selectedSource === 'csv' ? (
              <Stack spacing={2}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: '#163020' }}>
                  Upload file CSV penerima
                </Typography>
                <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
                  Gunakan kolom: nomor, nama (opsional).
                </Typography>
                <Button
                  component="label"
                  variant="outlined"
                  sx={{
                    alignSelf: 'flex-start',
                    minHeight: 56,
                    borderRadius: 3,
                    px: 3,
                    borderColor: '#1f6f5f',
                    color: '#1f6f5f',
                    textTransform: 'none',
                    fontWeight: 700,
                  }}
                >
                  Pilih file CSV
                  <input
                    hidden
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        handleCsvFile(file);
                      }
                    }}
                  />
                </Button>

                {csvRecipients.length > 0 ? (
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      backgroundColor: '#f7faf8',
                      border: '1px solid rgba(31, 111, 95, 0.12)',
                    }}
                  >
                    <Stack spacing={1}>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#163020' }}>
                        File siap dipakai: {csvFileName}
                      </Typography>
                      <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
                        {csvRecipients.length} nomor berhasil dibaca.
                      </Typography>
                    </Stack>
                  </Paper>
                ) : null}
              </Stack>
            ) : null}

            {selectedSource === 'manual' ? (
              <Stack spacing={2}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: '#163020' }}>
                  Tambah nomor satu per satu
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr auto' },
                    gap: 1.5,
                    alignItems: 'center',
                  }}
                >
                  <TextField
                    label="Nomor WhatsApp"
                    value={manualPhone}
                    onChange={(event) => setManualPhone(event.target.value)}
                    placeholder="Contoh: 6281234567890"
                    fullWidth
                  />
                  <TextField
                    label="Nama penerima (opsional)"
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    placeholder="Contoh: Ibu Rina"
                    fullWidth
                  />
                  <Button
                    variant="contained"
                    onClick={handleAddManualRecipient}
                    sx={{
                      minHeight: 56,
                      borderRadius: 3,
                      backgroundColor: '#1f6f5f',
                      px: 3,
                      textTransform: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Tambah
                  </Button>
                </Box>

                {manualRecipients.length > 0 ? (
                  <Stack spacing={1}>
                    {manualRecipients.map((recipient) => (
                      <Paper
                        key={recipient.no_telp}
                        elevation={0}
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          border: '1px solid rgba(31, 111, 95, 0.12)',
                          backgroundColor: '#f7faf8',
                        }}
                      >
                        <Stack
                          direction={{ xs: 'column', md: 'row' }}
                          spacing={1.5}
                          alignItems={{ xs: 'flex-start', md: 'center' }}
                          justifyContent="space-between"
                        >
                          <Stack spacing={0.4}>
                            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#163020' }}>
                              {recipient.no_telp}
                            </Typography>
                            <Typography sx={{ fontSize: '0.98rem', color: '#50665d' }}>
                              {recipient.nama || 'Tanpa nama'}
                            </Typography>
                          </Stack>
                          <Button
                            variant="outlined"
                            color="error"
                            onClick={() => handleRemoveManualRecipient(recipient.no_telp)}
                            sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 700 }}
                          >
                            Hapus
                          </Button>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            ) : null}

            <Divider />

            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', md: 'center' }}
            >
              <Chip
                label={`${recipients.length} penerima siap`}
                sx={{
                  backgroundColor: recipients.length > 0 ? '#e6f4ef' : '#f3f1e8',
                  color: recipients.length > 0 ? '#1f4d3a' : '#665d4d',
                  fontSize: '1rem',
                  fontWeight: 700,
                  px: 1,
                  py: 2.5,
                }}
              />
              <Button
                variant="contained"
                onClick={handleNextStep}
                disabled={!canContinueFromStepOne}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 4,
                  backgroundColor: '#1f6f5f',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Lanjut review penerima
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      {currentStep === 2 ? (
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
              2. Review penerima
            </Typography>
            <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
              Sumber penerima: <strong>{sourceLabel(selectedSource)}</strong>
            </Typography>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 3,
                backgroundColor: '#f7faf8',
                border: '1px solid rgba(31, 111, 95, 0.12)',
              }}
            >
              <Stack spacing={1}>
                <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#163020' }}>
                  Total penerima
                </Typography>
                <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: '#1f6f5f' }}>
                  {recipients.length}
                </Typography>
              </Stack>
            </Paper>

            <Stack spacing={1}>
              {recipients.slice(0, 8).map((recipient, index) => (
                <Box
                  key={`${recipient.no_telp}-${index}`}
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    backgroundColor: '#fcfdfb',
                    border: '1px solid rgba(31, 111, 95, 0.12)',
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' },
                    gap: 1,
                  }}
                >
                  <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#163020' }}>
                    {recipient.no_telp}
                  </Typography>
                  <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
                    {recipient.nama || 'Tanpa nama'}
                  </Typography>
                </Box>
              ))}
              {recipients.length > 8 ? (
                <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
                  Masih ada {recipients.length - 8} penerima lain.
                </Typography>
              ) : null}
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="outlined"
                onClick={handlePreviousStep}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 4,
                  borderColor: '#1f6f5f',
                  color: '#1f6f5f',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Kembali
              </Button>
              <Button
                variant="contained"
                onClick={handleNextStep}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 4,
                  backgroundColor: '#1f6f5f',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Lanjut tulis pesan
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      {currentStep === 3 ? (
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
              3. Tulis pesan
            </Typography>
            <TextField
              label="Isi pesan"
              multiline
              minRows={7}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={[
                'Contoh pesan:',
                'Halo Bapak/Ibu,',
                'Besok ada pertemuan orang tua pukul 08.00 di aula sekolah.',
                'Mohon hadir 10 menit lebih awal.',
                'Terima kasih.',
              ].join('\n')}
              helperText={`${message.trim().length}/${MAX_MESSAGE_LENGTH} karakter`}
              fullWidth
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="outlined"
                onClick={handlePreviousStep}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 4,
                  borderColor: '#1f6f5f',
                  color: '#1f6f5f',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Kembali
              </Button>
              <Button
                variant="contained"
                onClick={handleNextStep}
                disabled={!canContinueFromStepThree}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 4,
                  backgroundColor: '#1f6f5f',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Lanjut preview pesan
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      {currentStep === 4 ? (
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
              4. Preview & konfirmasi
            </Typography>

            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 3,
                backgroundColor: '#f7faf8',
                border: '1px solid rgba(31, 111, 95, 0.12)',
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <CampaignRoundedIcon sx={{ color: '#1f6f5f' }} />
                  <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: '#163020' }}>
                    Siap dikirim ke {recipients.length} penerima
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>
                  Sumber penerima: {sourceLabel(selectedSource)}
                </Typography>
                <Divider />
                <Typography sx={{ fontSize: '1rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', color: '#163020' }}>
                  {message.trim()}
                </Typography>
              </Stack>
            </Paper>

            {status?.type === 'success' ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  backgroundColor: '#eef8f3',
                  border: '1px solid rgba(31, 111, 95, 0.14)',
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CheckCircleRoundedIcon sx={{ color: '#1f6f5f', fontSize: 32 }} />
                  <Stack spacing={0.4}>
                    <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#163020' }}>
                      Pesan sudah masuk ke antrian
                    </Typography>
                    <Typography sx={{ fontSize: '1rem', color: '#50665d' }}>{status.message}</Typography>
                  </Stack>
                </Stack>
              </Paper>
            ) : null}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="outlined"
                onClick={handlePreviousStep}
                disabled={submitting}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 4,
                  borderColor: '#1f6f5f',
                  color: '#1f6f5f',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Kembali
              </Button>
              <Button
                variant="contained"
                onClick={() => setConfirmOpen(true)}
                disabled={submitting || recipients.length === 0 || !message.trim()}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 4,
                  backgroundColor: '#1f6f5f',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                {submitting ? 'Mengirim pesan...' : 'Kirim pesan sekarang'}
              </Button>
              <Button
                variant="text"
                onClick={handleReset}
                disabled={submitting}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 2,
                  color: '#5b6b65',
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Mulai lagi
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: '#163020' }}>Konfirmasi pengiriman</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: '#50665d' }}>
            Pesan akan dikirim ke {recipients.length} penerima. Pastikan isi pesan dan daftar penerima sudah benar.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setConfirmOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Cek lagi
          </Button>
          <Button
            variant="contained"
            onClick={handleSendBlast}
            sx={{
              borderRadius: 999,
              backgroundColor: '#1f6f5f',
              px: 3,
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            Ya, kirim sekarang
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
