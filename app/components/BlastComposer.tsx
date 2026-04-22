'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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

import { BLAST_VARIABLES, renderBlastMessageTemplate } from '../lib/blast-variables';
import { adminPalette } from '../lib/adminPalette';
import type { CsvContact } from '../lib/types';

const TRACKER_REGISTER_EVENT = 'outbound-tracker-register';

type RecipientSource = 'contact' | 'group' | 'csv' | 'manual';

interface BlastComposerProps {
  initialContacts: {
    items: CsvContact[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  initialGroups: {
    items: Array<{
      name: string;
      memberCount: number;
      previewNames: string[];
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

interface RecipientInput {
  no_telp: string;
  nama?: string;
  group_names?: string[];
}

interface ParsedCsvRow {
  nomor?: string;
  no_telp?: string;
  'no telp'?: string;
  phone?: string;
  nama?: string;
}

interface ContactDirectoryResponse {
  items: CsvContact[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface GroupDirectoryResponse {
  items: Array<{
    name: string;
    memberCount: number;
    previewNames: string[];
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface GroupRecipientsPreviewResponse {
  totalRecipients: number;
  previewRecipients: RecipientInput[];
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
      group_names: Array.from(
        new Set(
          (recipient.group_names || [])
            .map((groupName) => String(groupName || '').trim())
            .filter((groupName) => groupName.length > 0),
        ),
      ),
    });
  });

  return Array.from(deduped.values());
}

function sourceLabel(source: RecipientSource | null): string {
  if (source === 'contact') return 'Daftar kontak';
  if (source === 'group') return 'Grup kontak';
  if (source === 'csv') return 'File CSV';
  if (source === 'manual') return 'Input Satu per Satu';
  return '-';
}

export default function BlastComposer({ initialContacts, initialGroups }: BlastComposerProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSource, setSelectedSource] = useState<RecipientSource | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [contactPage, setContactPage] = useState(initialContacts.page || 1);
  const [groupPage, setGroupPage] = useState(initialGroups.page || 1);
  const [contactDirectory, setContactDirectory] = useState<ContactDirectoryResponse>(initialContacts);
  const [groupDirectory, setGroupDirectory] = useState<GroupDirectoryResponse>(initialGroups);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupPreview, setGroupPreview] = useState<GroupRecipientsPreviewResponse>({
    totalRecipients: 0,
    previewRecipients: [],
  });
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');
  const [selectedContactRecipients, setSelectedContactRecipients] = useState<RecipientInput[]>([]);
  const [manualRecipients, setManualRecipients] = useState<RecipientInput[]>([]);
  const [csvRecipients, setCsvRecipients] = useState<RecipientInput[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveToGroup, setSaveToGroup] = useState(false);
  const [saveGroupName, setSaveGroupName] = useState('');
  const [status, setStatus] = useState<
    { type: 'success' | 'error' | 'info' | 'warning'; message: string } | null
  >(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const recipients = useMemo(() => {
    if (selectedSource === 'contact') {
      return uniqueRecipients(selectedContactRecipients);
    }

    if (selectedSource === 'group') {
      return uniqueRecipients(groupPreview.previewRecipients);
    }

    if (selectedSource === 'csv') {
      return uniqueRecipients(csvRecipients);
    }

    if (selectedSource === 'manual') {
      return uniqueRecipients(manualRecipients);
    }

    return [];
  }, [csvRecipients, groupPreview.previewRecipients, manualRecipients, selectedContactRecipients, selectedSource]);

  const recipientCount = selectedSource === 'group' ? groupPreview.totalRecipients : recipients.length;

  const canContinueFromStepOne =
    (selectedSource === 'contact' && recipients.length > 0) ||
    (selectedSource === 'group' && selectedGroups.length > 0 && groupPreview.totalRecipients > 0) ||
    (selectedSource === 'csv' && recipients.length > 0) ||
    (selectedSource === 'manual' && recipients.length > 0);
  const canContinueFromStepThree =
    message.trim().length > 0 && message.trim().length <= MAX_MESSAGE_LENGTH;
  const shouldShowSaveToGroupOption = selectedSource === 'manual' || selectedSource === 'csv';
  const requiresGroupName = shouldShowSaveToGroupOption && saveToGroup;
  const previewRecipients = recipients.slice(0, 3);
  const previewMessages = previewRecipients.map((recipient) => ({
    recipient,
    content: renderBlastMessageTemplate(message.trim(), recipient),
  }));

  useEffect(() => {
    if (selectedSource !== 'contact') {
      return;
    }

    let cancelled = false;

    const loadContacts = async () => {
      setLoadingContacts(true);

      try {
        const params = new URLSearchParams({
          page: String(contactPage),
          pageSize: String(initialContacts.pageSize || 20),
        });

        if (contactSearch.trim()) {
          params.set('search', contactSearch.trim());
        }

        const response = await fetch(`/api/admin/contact-directory?${params.toString()}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Gagal memuat daftar kontak (${response.status}).`);
        }

        const payload = (await response.json()) as ContactDirectoryResponse;
        if (!cancelled) {
          setContactDirectory(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            type: 'error',
            message: error instanceof Error ? error.message : 'Gagal memuat daftar kontak.',
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingContacts(false);
        }
      }
    };

    void loadContacts();

    return () => {
      cancelled = true;
    };
  }, [contactPage, contactSearch, initialContacts.pageSize, selectedSource]);

  useEffect(() => {
    if (selectedSource !== 'group') {
      return;
    }

    let cancelled = false;

    const loadGroups = async () => {
      setLoadingGroups(true);

      try {
        const params = new URLSearchParams({
          page: String(groupPage),
          pageSize: String(initialGroups.pageSize || 20),
        });

        if (groupSearch.trim()) {
          params.set('search', groupSearch.trim());
        }

        const response = await fetch(`/api/admin/contact-groups?${params.toString()}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Gagal memuat daftar grup (${response.status}).`);
        }

        const payload = (await response.json()) as GroupDirectoryResponse;
        if (!cancelled) {
          setGroupDirectory(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            type: 'error',
            message: error instanceof Error ? error.message : 'Gagal memuat daftar grup.',
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingGroups(false);
        }
      }
    };

    void loadGroups();

    return () => {
      cancelled = true;
    };
  }, [groupPage, groupSearch, initialGroups.pageSize, selectedSource]);

  useEffect(() => {
    if (!selectedGroups.length) {
      setGroupPreview({ totalRecipients: 0, previewRecipients: [] });
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      try {
        const response = await fetch('/api/admin/contact-groups/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupNames: selectedGroups }),
        });

        if (!response.ok) {
          throw new Error(`Gagal memuat preview grup (${response.status}).`);
        }

        const payload = (await response.json()) as GroupRecipientsPreviewResponse;
        if (!cancelled) {
          setGroupPreview(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            type: 'error',
            message: error instanceof Error ? error.message : 'Gagal memuat preview penerima grup.',
          });
        }
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [selectedGroups]);

  const handleSourceChange = (source: RecipientSource) => {
    setSelectedSource(source);
    setSaveToGroup(false);
    setSaveGroupName('');
    setStatus(null);
    setCurrentStep(1);
  };

  const toggleContactRecipient = (contact: CsvContact) => {
    setSelectedContactRecipients((previous) => {
      if (previous.some((recipient) => recipient.no_telp === contact.no_telp)) {
        return previous.filter((recipient) => recipient.no_telp !== contact.no_telp);
      }

      return uniqueRecipients([
        ...previous,
        {
          no_telp: contact.no_telp,
          nama: contact.nama,
          group_names: contact.group_names,
        },
      ]);
    });
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

  const handleInsertVariable = (token: string) => {
    setMessage((previous) => `${previous}${previous.endsWith(' ') || previous.length === 0 ? '' : ' '}${token}`);
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
    if (!selectedSource || recipientCount === 0 || !message.trim()) {
      setConfirmOpen(false);
      setStatus({ type: 'error', message: 'Data blast belum lengkap. Periksa lagi sebelum kirim.' });
      return;
    }

    if (requiresGroupName && !saveGroupName.trim()) {
      setStatus({ type: 'error', message: 'Isi nama group terlebih dahulu sebelum kirim blast.' });
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
        saveToGroup: requiresGroupName,
        groupName: requiresGroupName ? saveGroupName.trim() : undefined,
        sourceFile: selectedSource === 'csv' ? csvFileName || 'blast-csv' : undefined,
      }),
    });

    const result = (await response.json()) as {
      error?: string;
      batchId?: string;
      acceptedCount?: number;
      failedCount?: number;
      totalRecipients?: number;
      trackedMessageIds?: string[];
    };

    if (!response.ok) {
      setStatus({ type: 'error', message: result.error || 'Pesan gagal dikirim.' });
      setSubmitting(false);
      return;
    }

    if ((result.failedCount || 0) > 0) {
      setStatus({
        type: 'warning',
        message: `Blast queued untuk ${result.acceptedCount || 0} penerima. ${result.failedCount || 0} penerima gagal dan perlu diperiksa.${
          requiresGroupName ? ` Kontak valid juga disimpan ke group ${saveGroupName.trim()}.` : ''
        }`,
      });
    } else {
      setStatus({
        type: 'success',
        message: `Blast queued untuk ${result.acceptedCount || recipientCount} penerima.${
          requiresGroupName ? ` Kontak valid disimpan ke group ${saveGroupName.trim()}.` : ''
        }`,
      });
    }

    if (result.trackedMessageIds?.length && result.batchId) {
      const batchLabel =
        selectedSource === 'group'
          ? 'Blast grup'
          : selectedSource === 'csv'
            ? 'Blast CSV'
            : 'Blast manual';

      window.dispatchEvent(
        new CustomEvent(TRACKER_REGISTER_EVENT, {
          detail: {
            batch: {
              id: result.batchId,
              label: batchLabel,
              source_type: 'blast',
              created_at: new Date().toISOString(),
              tracked_ids: result.trackedMessageIds,
              total_count: result.totalRecipients || result.trackedMessageIds.length,
              resolved_at: null,
            },
          },
        }),
      );
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
    setSaveToGroup(false);
    setSaveGroupName('');
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
          border: `1px solid ${adminPalette.border}`,
          backgroundColor: adminPalette.surface,
        }}
      >
        <Stack spacing={2}>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: adminPalette.textPrimary }}>
            Langkah cepat kirim pesan
          </Typography>
          <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: adminPalette.textSecondary }}>
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
                    border: active ? `2px solid ${adminPalette.brand}` : `1px solid ${adminPalette.border}`,
                    backgroundColor: completed ? adminPalette.brandSoft : adminPalette.surfaceSoft,
                  }}
                >
                  <Stack spacing={0.8}>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: adminPalette.brand }}>
                      Langkah {stepNumber}
                    </Typography>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>
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
            border: `1px solid ${adminPalette.border}`,
            backgroundColor: adminPalette.surface,
          }}
        >
          <Stack spacing={3}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: adminPalette.textPrimary }}>
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
                  value: 'contact' as const,
                  title: 'Pilih dari kontak',
                  helper: 'Cari dan pilih nomor dari daftar kontak tersimpan.',
                  icon: <PersonAddAltRoundedIcon sx={{ fontSize: 34, color: adminPalette.brand }} />,
                },
                {
                  value: 'group' as const,
                  title: 'Pilih dari grup',
                  helper: 'Pakai kontak yang sudah dikelompokkan sebelumnya.',
                  icon: <GroupRoundedIcon sx={{ fontSize: 34, color: adminPalette.brand }} />,
                },
                {
                  value: 'csv' as const,
                  title: 'Upload CSV',
                  helper: 'Upload daftar nomor dari file CSV sederhana.',
                  icon: <UploadFileRoundedIcon sx={{ fontSize: 34, color: adminPalette.brand }} />,
                },
                {
                  value: 'manual' as const,
                  title: 'Input Satu per Satu',
                  helper: 'Masukkan nomor satu per satu dengan tombol tambah.',
                  icon: <PersonAddAltRoundedIcon sx={{ fontSize: 34, color: adminPalette.brand }} />,
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
                      border: active ? `1px solid ${adminPalette.brand}` : `1px solid ${adminPalette.border}`,
                      backgroundColor: active ? adminPalette.brandSoft : adminPalette.surface,
                    }}
                  >
                    <Stack spacing={1.5}>
                      {option.icon}
                      <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                        {option.title}
                      </Typography>
                      <Typography sx={{ fontSize: '0.94rem', lineHeight: 1.7, color: adminPalette.textMuted }}>
                        {option.helper}
                      </Typography>
                      <Button
                        variant={active ? 'contained' : 'outlined'}
                        onClick={() => handleSourceChange(option.value)}
                        sx={{
                          alignSelf: 'flex-start',
                          minHeight: 50,
                          borderRadius: 2.5,
                          px: 3,
                          backgroundColor: active ? adminPalette.brand : undefined,
                          borderColor: adminPalette.borderStrong,
                          color: active ? '#ffffff' : adminPalette.textSecondary,
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

            {selectedSource === 'contact' ? (
              <Stack spacing={2}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                  Pilih dari daftar kontak
                </Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                  <TextField
                    label="Cari kontak"
                    value={contactSearch}
                    onChange={(event) => {
                      setContactSearch(event.target.value);
                      setContactPage(1);
                    }}
                    placeholder="Contoh: Budi atau 62812"
                    size="small"
                    fullWidth
                  />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={`${selectedContactRecipients.length} kontak dipilih`} size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brand, fontWeight: 700 }} />
                    <Chip label={`${contactDirectory.total} total hasil`} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
                  </Stack>
                </Stack>

                <Stack spacing={1.25}>
                  {contactDirectory.items.map((contact) => {
                    const active = selectedContactRecipients.some((recipient) => recipient.no_telp === contact.no_telp);

                    return (
                      <Paper
                        key={contact.id}
                        elevation={0}
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          border: active ? `1px solid ${adminPalette.brand}` : `1px solid ${adminPalette.border}`,
                          backgroundColor: active ? adminPalette.brandSoft : adminPalette.surface,
                        }}
                      >
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                          <Stack spacing={0.45}>
                            <Typography sx={{ fontSize: '0.98rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                              {contact.nama}
                            </Typography>
                            <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
                              {contact.no_telp}
                              {contact.jabatan ? ` • ${contact.jabatan}` : ''}
                            </Typography>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                              {contact.group_names.slice(0, 3).map((groupName) => (
                                <Chip key={`${contact.id}-${groupName}`} label={groupName} size="small" variant="outlined" />
                              ))}
                              {contact.group_names.length > 3 ? <Chip label={`+${contact.group_names.length - 3} grup`} size="small" variant="outlined" /> : null}
                            </Stack>
                          </Stack>
                          <Button
                            variant={active ? 'contained' : 'outlined'}
                            onClick={() => toggleContactRecipient(contact)}
                            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2.5 }}
                          >
                            {active ? 'Dipilih' : 'Pilih kontak'}
                          </Button>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ fontSize: '0.86rem', color: adminPalette.textMuted }}>
                    Halaman {contactDirectory.page} dari {contactDirectory.totalPages}
                    {loadingContacts ? ' • memuat...' : ''}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      onClick={() => setContactPage((previous) => Math.max(1, previous - 1))}
                      disabled={contactDirectory.page <= 1 || loadingContacts}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Sebelumnya
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => setContactPage((previous) => Math.min(contactDirectory.totalPages, previous + 1))}
                      disabled={contactDirectory.page >= contactDirectory.totalPages || loadingContacts}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Berikutnya
                    </Button>
                  </Stack>
                </Stack>
              </Stack>
            ) : null}

            {selectedSource === 'group' ? (
              <Stack spacing={2}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                  Pilih grup penerima
                </Typography>
                {groupDirectory.items.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    Belum ada grup kontak. Tambahkan grup dulu di halaman Grup.
                  </Alert>
                ) : (
                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                      <TextField
                        label="Cari grup atau anggota"
                        value={groupSearch}
                        onChange={(event) => setGroupSearch(event.target.value)}
                        placeholder="Contoh: VIP atau Ibu Rina"
                        size="small"
                        fullWidth
                      />
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={`${selectedGroups.length} grup dipilih`} size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brand, fontWeight: 700 }} />
                        <Chip label={`${groupPreview.totalRecipients} kontak unik`} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
                      </Stack>
                    </Stack>

                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, 1fr)' },
                        gap: 1.5,
                      }}
                    >
                    {groupDirectory.items.map((group) => {
                      const active = selectedGroups.includes(group.name);

                      return (
                        <Paper
                          key={group.name}
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: active ? `1px solid ${adminPalette.brand}` : `1px solid ${adminPalette.border}`,
                            backgroundColor: active ? adminPalette.brandSoft : adminPalette.surface,
                            cursor: 'pointer',
                          }}
                          onClick={() => toggleGroup(group.name)}
                        >
                          <Stack spacing={1.25}>
                            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                              <Stack spacing={0.4}>
                                <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                                  {group.name}
                                </Typography>
                                <Typography sx={{ fontSize: '0.88rem', color: adminPalette.textMuted }}>
                                  {group.memberCount} kontak • {group.previewNames.join(', ')}
                                  {group.memberCount > group.previewNames.length ? ` dan ${group.memberCount - group.previewNames.length} lainnya` : ''}
                                </Typography>
                              </Stack>
                              <Checkbox checked={active} />
                            </Stack>

                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                              {group.previewNames.slice(0, 4).map((memberName) => (
                                <Chip
                                  key={`${group.name}-${memberName}`}
                                  label={memberName}
                                  size="small"
                                  variant="outlined"
                                  sx={{ borderColor: adminPalette.borderStrong }}
                                />
                              ))}
                              {group.memberCount > group.previewNames.length ? (
                                <Chip
                                  label={`+${group.memberCount - group.previewNames.length} lainnya`}
                                  size="small"
                                  sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textMuted, fontWeight: 700 }}
                                />
                              ) : null}
                            </Stack>
                          </Stack>
                        </Paper>
                      );
                    })}
                    </Box>

                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
                      <Typography sx={{ fontSize: '0.9rem', color: adminPalette.textMuted }}>
                        Total penerima akan dihitung unik meskipun satu kontak berada di beberapa grup terpilih.
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="outlined"
                          onClick={() => setGroupPage((previous) => Math.max(1, previous - 1))}
                          disabled={groupDirectory.page <= 1 || loadingGroups}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          Sebelumnya
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => setGroupPage((previous) => Math.min(groupDirectory.totalPages, previous + 1))}
                          disabled={groupDirectory.page >= groupDirectory.totalPages || loadingGroups}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          Berikutnya
                        </Button>
                      </Stack>
                      <Link href="/group" style={{ textDecoration: 'none' }}>
                        <Button variant="text" sx={{ textTransform: 'none', fontWeight: 700 }}>
                          Buka direktori grup
                        </Button>
                      </Link>
                    </Stack>
                  </Stack>
                )}
              </Stack>
            ) : null}

            {selectedSource === 'csv' ? (
              <Stack spacing={2}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                  Upload file CSV penerima
                </Typography>
                <Typography sx={{ fontSize: '1rem', color: adminPalette.textSecondary }}>
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
                    borderColor: adminPalette.brand,
                    color: adminPalette.brand,
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
                      backgroundColor: adminPalette.surfaceSoft,
                      border: `1px solid ${adminPalette.border}`,
                    }}
                  >
                    <Stack spacing={1}>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                        File siap dipakai: {csvFileName}
                      </Typography>
                      <Typography sx={{ fontSize: '1rem', color: adminPalette.textSecondary }}>
                        {csvRecipients.length} nomor berhasil dibaca.
                      </Typography>
                    </Stack>
                  </Paper>
                ) : null}
              </Stack>
            ) : null}

            {selectedSource === 'manual' ? (
              <Stack spacing={2}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
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
                      backgroundColor: adminPalette.brand,
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
                          border: `1px solid ${adminPalette.border}`,
                          backgroundColor: adminPalette.surfaceSoft,
                        }}
                      >
                        <Stack
                          direction={{ xs: 'column', md: 'row' }}
                          spacing={1.5}
                          alignItems={{ xs: 'flex-start', md: 'center' }}
                          justifyContent="space-between"
                        >
                          <Stack spacing={0.4}>
                            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                              {recipient.no_telp}
                            </Typography>
                            <Typography sx={{ fontSize: '0.98rem', color: adminPalette.textSecondary }}>
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
                label={`${recipientCount} penerima siap`}
                sx={{
                  backgroundColor: recipientCount > 0 ? adminPalette.brandSoft : adminPalette.warningBg,
                  color: recipientCount > 0 ? adminPalette.brandDark : adminPalette.warningText,
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
                  backgroundColor: adminPalette.brand,
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
            border: `1px solid ${adminPalette.border}`,
            backgroundColor: adminPalette.surface,
          }}
        >
          <Stack spacing={2.5}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: adminPalette.textPrimary }}>
              2. Review penerima
            </Typography>
            <Typography sx={{ fontSize: '1rem', color: adminPalette.textSecondary }}>
              Sumber penerima: <strong>{sourceLabel(selectedSource)}</strong>
            </Typography>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 3,
                backgroundColor: adminPalette.surfaceSoft,
                border: `1px solid ${adminPalette.border}`,
              }}
            >
              <Stack spacing={1}>
                <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                  Total penerima
                </Typography>
                <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: adminPalette.brand }}>
                  {recipientCount}
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
                    backgroundColor: adminPalette.surfaceSoft,
                    border: `1px solid ${adminPalette.border}`,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' },
                    gap: 1,
                  }}
                >
                  <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                    {recipient.no_telp}
                  </Typography>
                  <Typography sx={{ fontSize: '1rem', color: adminPalette.textSecondary }}>
                    {recipient.nama || 'Tanpa nama'}
                  </Typography>
                </Box>
              ))}
              {recipientCount > 8 ? (
                <Typography sx={{ fontSize: '1rem', color: adminPalette.textSecondary }}>
                  Masih ada {recipientCount - 8} penerima lain.
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
                  borderColor: adminPalette.brand,
                  color: adminPalette.brand,
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
                  backgroundColor: adminPalette.brand,
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
            border: `1px solid ${adminPalette.border}`,
            backgroundColor: adminPalette.surface,
          }}
        >
          <Stack spacing={2.5}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: adminPalette.textPrimary }}>
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

            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 3,
                backgroundColor: adminPalette.surfaceSoft,
                border: `1px solid ${adminPalette.border}`,
              }}
            >
              <Stack spacing={1.25}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                  Variabel pesan
                </Typography>
                <Typography sx={{ fontSize: '0.96rem', color: adminPalette.textSecondary }}>
                  Gunakan variabel untuk membuat isi pesan lebih adaptif per penerima.
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {BLAST_VARIABLES.map((variable) => (
                    <Chip
                      key={variable.token}
                      clickable
                      label={variable.token}
                      onClick={() => handleInsertVariable(variable.token)}
                      sx={{
                        backgroundColor: adminPalette.brandSoft,
                        color: adminPalette.brand,
                        fontWeight: 700,
                      }}
                    />
                  ))}
                </Stack>
                <Typography sx={{ fontSize: '0.86rem', color: adminPalette.textMuted }}>
                  {'Variabel tersedia: {{name}}, {{phone_number}}, {{group_name}}.'}
                </Typography>
              </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="outlined"
                onClick={handlePreviousStep}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 4,
                  borderColor: adminPalette.brand,
                  color: adminPalette.brand,
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
                  backgroundColor: adminPalette.brand,
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
            border: `1px solid ${adminPalette.border}`,
            backgroundColor: adminPalette.surface,
          }}
        >
          <Stack spacing={2.5}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: adminPalette.textPrimary }}>
              4. Preview & konfirmasi
            </Typography>

            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 3,
                backgroundColor: adminPalette.surfaceSoft,
                border: `1px solid ${adminPalette.border}`,
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <CampaignRoundedIcon sx={{ color: adminPalette.brand }} />
                    <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                    Siap dikirim ke {recipientCount} penerima
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: '1rem', color: adminPalette.textSecondary }}>
                  Sumber penerima: {sourceLabel(selectedSource)}
                </Typography>
                <Divider />
                <Typography sx={{ fontSize: '1rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', color: adminPalette.textPrimary }}>
                  {message.trim()}
                </Typography>
              </Stack>
            </Paper>

            {previewMessages.length > 0 ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  backgroundColor: adminPalette.surfaceSoft,
                  border: `1px solid ${adminPalette.border}`,
                }}
              >
                <Stack spacing={1.5}>
                  <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                    Preview variabel
                  </Typography>
                  <Typography sx={{ fontSize: '0.96rem', color: adminPalette.textSecondary }}>
                    Contoh hasil render untuk beberapa penerima pertama.
                  </Typography>
                  {previewMessages.map(({ recipient, content }) => (
                    <Paper
                      key={`preview-${recipient.no_telp}`}
                      elevation={0}
                      sx={{
                        p: 2,
                        borderRadius: 3,
                        backgroundColor: adminPalette.surface,
                        border: `1px solid ${adminPalette.border}`,
                      }}
                    >
                      <Stack spacing={0.75}>
                        <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                          {recipient.nama || 'Tanpa nama'} · {recipient.no_telp}
                        </Typography>
                        {recipient.group_names?.length ? (
                          <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textSecondary }}>
                            Grup: {recipient.group_names.join(', ')}
                          </Typography>
                        ) : null}
                        <Typography sx={{ fontSize: '0.94rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: adminPalette.textPrimary }}>
                          {content}
                        </Typography>
                      </Stack>
                    </Paper>
                  ))}
                  {recipientCount > previewMessages.length ? (
                    <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
                      Preview dibatasi ke {previewMessages.length} penerima pertama dari total {recipientCount}.
                    </Typography>
                  ) : null}
                </Stack>
              </Paper>
            ) : null}

            {status?.type === 'success' ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  backgroundColor: adminPalette.successBg,
                  border: `1px solid ${adminPalette.successBorder}`,
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CheckCircleRoundedIcon sx={{ color: adminPalette.successText, fontSize: 32 }} />
                  <Stack spacing={0.4}>
                    <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                      Pesan sudah masuk ke antrian
                    </Typography>
                    <Typography sx={{ fontSize: '1rem', color: adminPalette.textSecondary }}>{status.message}</Typography>
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
                  borderColor: adminPalette.brand,
                  color: adminPalette.brand,
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Kembali
              </Button>
              <Button
                variant="contained"
                onClick={() => setConfirmOpen(true)}
                disabled={submitting || recipientCount === 0 || !message.trim()}
                sx={{
                  minHeight: 56,
                  borderRadius: 999,
                  px: 4,
                  backgroundColor: adminPalette.brand,
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
                  color: adminPalette.textSecondary,
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
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Konfirmasi pengiriman</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography sx={{ fontSize: '1rem', lineHeight: 1.7, color: adminPalette.textSecondary }}>
              Pesan akan dikirim ke {recipientCount} penerima. Pastikan isi pesan dan daftar penerima sudah benar.
            </Typography>

            {shouldShowSaveToGroupOption ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  backgroundColor: adminPalette.surfaceSoft,
                  border: `1px solid ${adminPalette.border}`,
                }}
              >
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Checkbox
                      checked={saveToGroup}
                      onChange={(event) => {
                        setSaveToGroup(event.target.checked);
                        if (!event.target.checked) {
                          setSaveGroupName('');
                        }
                      }}
                      sx={{ p: 0.5 }}
                    />
                    <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                      Save as group
                    </Typography>
                  </Stack>

                  {saveToGroup ? (
                    <TextField
                      label="Nama group"
                      value={saveGroupName}
                      onChange={(event) => setSaveGroupName(event.target.value)}
                      placeholder="Contoh: SmokeProdA"
                      fullWidth
                      autoFocus
                    />
                  ) : null}
                </Stack>
              </Paper>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setConfirmOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Cek lagi
          </Button>
          <Button
            variant="contained"
            onClick={handleSendBlast}
            disabled={requiresGroupName && !saveGroupName.trim()}
            sx={{
              borderRadius: 999,
              backgroundColor: adminPalette.brand,
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
