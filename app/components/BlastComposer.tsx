'use client';

import Link from 'next/link';
import { type UIEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';

import { BLAST_VARIABLES, renderBlastMessageTemplate } from '../lib/blast-variables';
import { adminPalette, adminTableHeaderCellSx, adminTableSortLabelSx } from '../lib/adminPalette';
import type { CsvContact } from '../lib/types';

const TRACKER_REGISTER_EVENT = 'outbound-tracker-register';
const MAX_MESSAGE_LENGTH = 4096;
const VARIABLE_PATTERN = /\{\{\s*(name|phone_number|group_name)\s*\}\}/g;

type RecipientSource = 'contact' | 'group' | 'csv' | 'manual';
type ContactSortKey = 'nama' | 'no_telp';
type GroupSortKey = 'name' | 'memberCount';
type SortDirection = 'asc' | 'desc';

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

const CONTACT_SORT_DEFAULTS: Record<ContactSortKey, SortDirection> = {
  nama: 'asc',
  no_telp: 'asc',
};

const GROUP_SORT_DEFAULTS: Record<GroupSortKey, SortDirection> = {
  name: 'asc',
  memberCount: 'desc',
};

const QUIET_BUTTON_SX = {
  minHeight: 34,
  borderRadius: 2,
  borderColor: adminPalette.borderStrong,
  color: adminPalette.textSecondary,
  backgroundColor: adminPalette.surface,
  textTransform: 'none',
  fontWeight: 700,
  boxShadow: 'none',
  '&:hover': {
    borderColor: adminPalette.brandSoftStrong,
    backgroundColor: adminPalette.brandSoft,
    boxShadow: 'none',
  },
} as const;

const PRIMARY_BUTTON_SX = {
  minHeight: 34,
  borderRadius: 2,
  px: 1.8,
  backgroundColor: adminPalette.brand,
  textTransform: 'none',
  fontWeight: 700,
  boxShadow: 'none',
  '&:hover': {
    backgroundColor: adminPalette.brandDark,
    boxShadow: 'none',
  },
} as const;

const SOURCE_OPTIONS = [
  { value: 'contact' as const, label: 'Kontak', helper: 'Pilih langsung dari direktori kontak.' },
  { value: 'group' as const, label: 'Grup', helper: 'Pakai satu atau beberapa grup yang sudah ada.' },
  { value: 'csv' as const, label: 'CSV', helper: 'Upload daftar nomor dari file CSV.' },
  { value: 'manual' as const, label: 'Manual', helper: 'Masukkan nomor satu per satu.' },
];

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
  if (source === 'manual') return 'Input manual';
  return '-';
}

function buildGroupPreview(previewNames: string[], memberCount: number): string {
  if (!previewNames.length) {
    return 'Belum ada pratinjau anggota.';
  }

  const extraCount = Math.max(0, memberCount - previewNames.length);
  return `${previewNames.join(', ')}${extraCount > 0 ? ` dan ${extraCount} lainnya` : ''}`;
}

function renderHighlightedTemplate(text: string) {
  if (!text) {
    return null;
  }

  const parts: Array<{ text: string; variable: boolean }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, index), variable: false });
    }

    parts.push({ text: match[0], variable: true });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), variable: false });
  }

  if (!parts.length) {
    return text;
  }

  return parts.map((part, index) =>
    part.variable ? (
      <Box
        key={`token-${index}`}
        component="span"
        sx={{
          display: 'inline',
          borderRadius: 0.75,
          backgroundColor: adminPalette.brandSoftStrong,
          color: adminPalette.brandDark,
          boxShadow: `0 0 0 1px ${adminPalette.brandSoftStrong}`,
        }}
      >
        {part.text}
      </Box>
    ) : (
      <Box key={`text-${index}`} component="span" sx={{ display: 'inline', color: adminPalette.textPrimary }}>
        {part.text}
      </Box>
    ),
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
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

export default function BlastComposer({ initialContacts, initialGroups }: BlastComposerProps) {
  const [selectedSource, setSelectedSource] = useState<RecipientSource | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [contactPage, setContactPage] = useState(initialContacts.page || 1);
  const [contactPageSize, setContactPageSize] = useState(initialContacts.pageSize || 12);
  const [groupPage, setGroupPage] = useState(initialGroups.page || 1);
  const [groupPageSize, setGroupPageSize] = useState(initialGroups.pageSize || 12);
  const [contactSortBy, setContactSortBy] = useState<ContactSortKey>('nama');
  const [contactSortDir, setContactSortDir] = useState<SortDirection>('asc');
  const [groupSortBy, setGroupSortBy] = useState<GroupSortKey>('memberCount');
  const [groupSortDir, setGroupSortDir] = useState<SortDirection>('desc');
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageMirrorRef = useRef<HTMLDivElement | null>(null);

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
  const shouldShowSaveToGroupOption = selectedSource === 'manual' || selectedSource === 'csv';
  const requiresGroupName = shouldShowSaveToGroupOption && saveToGroup;
  const canPreviewMessage = recipientCount > 0 && message.trim().length > 0;
  const canSendBlast = Boolean(selectedSource) && recipientCount > 0 && message.trim().length > 0 && message.trim().length <= MAX_MESSAGE_LENGTH;
  const selectedRecipientPreview = recipients.slice(0, 6);
  const previewableRecipients = recipients.slice(0, Math.min(10, recipients.length));
  const activePreviewRecipient = previewableRecipients[previewIndex] || null;
  const renderedPreviewContent = activePreviewRecipient ? renderBlastMessageTemplate(message.trim(), activePreviewRecipient) : '';

  useEffect(() => {
    if (previewIndex >= previewableRecipients.length) {
      setPreviewIndex(0);
    }
  }, [previewIndex, previewableRecipients.length]);

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
          pageSize: String(contactPageSize),
          sortBy: contactSortBy,
          sortDir: contactSortDir,
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
  }, [contactPage, contactPageSize, contactSearch, contactSortBy, contactSortDir, selectedSource]);

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
          pageSize: String(groupPageSize),
          sortBy: groupSortBy,
          sortDir: groupSortDir,
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
  }, [groupPage, groupPageSize, groupSearch, groupSortBy, groupSortDir, selectedSource]);

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
    setStatus(null);
    if (source !== 'manual' && source !== 'csv') {
      setSaveToGroup(false);
      setSaveGroupName('');
    }
  };

  const handleContactSortChange = (sortBy: ContactSortKey) => {
    setContactSortDir((previous) => (contactSortBy === sortBy ? (previous === 'asc' ? 'desc' : 'asc') : CONTACT_SORT_DEFAULTS[sortBy]));
    setContactSortBy(sortBy);
    setContactPage(1);
  };

  const handleGroupSortChange = (sortBy: GroupSortKey) => {
    setGroupSortDir((previous) => (groupSortBy === sortBy ? (previous === 'asc' ? 'desc' : 'asc') : GROUP_SORT_DEFAULTS[sortBy]));
    setGroupSortBy(sortBy);
    setGroupPage(1);
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
          group_names: [],
        },
      ]),
    );
    setManualPhone('');
    setManualName('');
    setStatus({ type: 'success', message: 'Penerima berhasil ditambahkan ke daftar blast.' });
  };

  const handleRemoveManualRecipient = (phoneNumber: string) => {
    setManualRecipients((previous) => previous.filter((recipient) => recipient.no_telp !== phoneNumber));
  };

  const handleInsertVariable = (token: string) => {
    const input = messageInputRef.current;

    if (!input) {
      setMessage((previous) => `${previous}${previous.endsWith(' ') || previous.length === 0 ? '' : ' '}${token}`);
      return;
    }

    const selectionStart = input.selectionStart ?? message.length;
    const selectionEnd = input.selectionEnd ?? message.length;
    const prefix = message.slice(0, selectionStart);
    const suffix = message.slice(selectionEnd);
    const insertValue = `${prefix && !/\s$/.test(prefix) ? ' ' : ''}${token}`;
    const nextMessage = `${prefix}${insertValue}${suffix}`;
    const caretPosition = prefix.length + insertValue.length;

    setMessage(nextMessage);

    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caretPosition, caretPosition);
    });
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
            message: 'File CSV belum berisi nomor yang valid. Gunakan kolom nomor dan nama opsional.',
          });
          return;
        }

        setStatus({
          type: 'success',
          message: `${parsedRecipients.length} penerima berhasil dibaca dari file CSV.`,
        });
      },
      error: (error) => {
        setStatus({ type: 'error', message: `CSV gagal dibaca: ${error.message}` });
      },
    });
  };

  const handleMessageScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (messageMirrorRef.current) {
      messageMirrorRef.current.scrollTop = event.currentTarget.scrollTop;
      messageMirrorRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  };

  const handleOpenPreview = () => {
    if (!canPreviewMessage) {
      setStatus({ type: 'error', message: 'Pilih penerima dan tulis pesan terlebih dahulu sebelum membuka preview.' });
      return;
    }

    setPreviewIndex(0);
    setPreviewOpen(true);
  };

  const handleSendBlast = async () => {
    if (!selectedSource || recipientCount === 0 || !message.trim()) {
      setConfirmOpen(false);
      setStatus({ type: 'error', message: 'Data blast belum lengkap. Periksa lagi sebelum kirim.' });
      return;
    }

    if (requiresGroupName && !saveGroupName.trim()) {
      setStatus({ type: 'error', message: 'Isi nama grup tujuan penyimpanan terlebih dahulu.' });
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
        message: `Blast masuk ke antrian untuk ${result.acceptedCount || 0} penerima. ${result.failedCount || 0} penerima gagal dan perlu diperiksa.${
          requiresGroupName ? ` Kontak valid juga disimpan ke grup ${saveGroupName.trim()}.` : ''
        }`,
      });
    } else {
      setStatus({
        type: 'success',
        message: `Blast masuk ke antrian untuk ${result.acceptedCount || recipientCount} penerima.${
          requiresGroupName ? ` Kontak valid disimpan ke grup ${saveGroupName.trim()}.` : ''
        }`,
      });
    }

    if (result.trackedMessageIds?.length && result.batchId) {
      const batchLabel =
        selectedSource === 'group'
          ? 'Blast grup'
          : selectedSource === 'csv'
            ? 'Blast CSV'
            : selectedSource === 'contact'
              ? 'Blast kontak'
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

    setSubmitting(false);
  };

  const handleReset = () => {
    setSelectedSource(null);
    setContactSearch('');
    setGroupSearch('');
    setContactPage(initialContacts.page || 1);
    setGroupPage(initialGroups.page || 1);
    setContactDirectory(initialContacts);
    setGroupDirectory(initialGroups);
    setSelectedContactRecipients([]);
    setSelectedGroups([]);
    setGroupPreview({ totalRecipients: 0, previewRecipients: [] });
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
    setPreviewOpen(false);
    setPreviewIndex(0);
  };

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
        <Stack spacing={1.25} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }}>
            <Box>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>
                Blast
              </Typography>
              <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
                Susun blast message
              </Typography>
              <Typography sx={{ mt: 0.55, fontSize: '0.8rem', color: adminPalette.textMuted }}>
                Pilih penerima, tulis pesan, dan tinjau hasil render tanpa keluar dari satu workspace.
              </Typography>
            </Box>

            <Button component={Link} href="/group" variant="outlined" sx={QUIET_BUTTON_SX}>
              Buka groups
            </Button>
          </Stack>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
              <MetricTile label="Sumber aktif" value={sourceLabel(selectedSource)} />
              <MetricTile label="Penerima siap" value={recipientCount} />
              <MetricTile label="Panjang pesan" value={`${message.trim().length}/${MAX_MESSAGE_LENGTH}`} />
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {selectedSource ? (
                <Chip label={sourceLabel(selectedSource)} size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} />
              ) : null}
              {saveToGroup && saveGroupName.trim() ? (
                <Chip label={`Simpan ke grup: ${saveGroupName.trim()}`} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
              ) : null}
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      {status ? (
        <Alert severity={status.type} sx={{ borderRadius: 2.5, '& .MuiAlert-message': { fontSize: '0.94rem' } }}>
          {status.message}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.98fr) minmax(0, 1.02fr)' },
          gap: 1.25,
          alignItems: 'start',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            overflow: 'hidden',
            borderRadius: 2.5,
            border: `1px solid ${adminPalette.border}`,
            backgroundColor: adminPalette.surface,
            boxShadow: 'none',
          }}
        >
          <Stack spacing={1} sx={{ px: { xs: 1.25, md: 1.5 }, py: 1.2, borderBottom: `1px solid ${adminPalette.border}` }}>
            <Stack spacing={0.35}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>Penerima</Typography>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
              {SOURCE_OPTIONS.map((option) => {
                const active = selectedSource === option.value;

                return (
                  <Button
                    key={option.value}
                    variant={active ? 'contained' : 'outlined'}
                    onClick={() => handleSourceChange(option.value)}
                    sx={
                      active
                        ? {
                            ...PRIMARY_BUTTON_SX,
                            px: 2.2,
                          }
                        : {
                            ...QUIET_BUTTON_SX,
                            px: 2.2,
                          }
                    }
                  >
                    {option.label}
                  </Button>
                );
              })}
            </Stack>
          </Stack>

          <Stack spacing={1.5} sx={{ p: { xs: 1.25, md: 1.5 } }}>
            {selectedSource === null ? (
              <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                Silahkan pilih sumber penerima terlebih dahulu
              </Alert>
            ) : null}

            {selectedSource === 'contact' ? (
              <Stack spacing={1.25}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                  <TextField
                    value={contactSearch}
                    onChange={(event) => {
                      setContactSearch(event.target.value);
                      setContactPage(1);
                    }}
                    placeholder="Cari nama, nomor, atau keterangan"
                    size="small"
                    sx={{ minWidth: { md: 280 }, '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
                    inputProps={{ 'aria-label': 'Cari kontak penerima' }}
                  />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={`${selectedContactRecipients.length} dipilih`} size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} />
                    <Chip label={`${contactDirectory.total} hasil`} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
                  </Stack>
                </Stack>

                <TableContainer>
                  <Table
                    size="small"
                    sx={{
                      minWidth: 720,
                      '& .MuiTableCell-root': { borderBottom: `1px solid ${adminPalette.border}` },
                    }}
                  >
                    <TableHead sx={{ backgroundColor: adminPalette.brand }}>
                      <TableRow>
                        <TableCell sx={adminTableHeaderCellSx}>
                          Pilih
                        </TableCell>
                        <TableCell sx={adminTableHeaderCellSx}>
                          <TableSortLabel
                            active={contactSortBy === 'nama'}
                            direction={contactSortBy === 'nama' ? contactSortDir : CONTACT_SORT_DEFAULTS.nama}
                            onClick={() => handleContactSortChange('nama')}
                            sx={adminTableSortLabelSx}
                          >
                            Nama
                          </TableSortLabel>
                        </TableCell>
                        <TableCell sx={adminTableHeaderCellSx}>
                          <TableSortLabel
                            active={contactSortBy === 'no_telp'}
                            direction={contactSortBy === 'no_telp' ? contactSortDir : CONTACT_SORT_DEFAULTS.no_telp}
                            onClick={() => handleContactSortChange('no_telp')}
                            sx={adminTableSortLabelSx}
                          >
                            Nomor WhatsApp
                          </TableSortLabel>
                        </TableCell>
                        <TableCell sx={adminTableHeaderCellSx}>
                          Grup
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {contactDirectory.items.map((contact) => {
                        const active = selectedContactRecipients.some((recipient) => recipient.no_telp === contact.no_telp);

                        return (
                          <TableRow key={contact.id} hover sx={{ '&:hover': { backgroundColor: adminPalette.brandSoft } }}>
                            <TableCell sx={{ py: 0.75 }}>
                              <Checkbox checked={active} onChange={() => toggleContactRecipient(contact)} inputProps={{ 'aria-label': `Pilih kontak ${contact.nama}` }} />
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: adminPalette.textPrimary }}>{contact.nama}</Typography>
                              <Typography sx={{ fontSize: '0.74rem', color: adminPalette.textMuted }}>{contact.jabatan || contact.jenis_kelamin}</Typography>
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textPrimary, fontFamily: 'var(--font-geist-mono), monospace' }}>{contact.no_telp}</Typography>
                            </TableCell>
                            <TableCell sx={{ py: 0.75, minWidth: 220 }}>
                              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                {contact.group_names.length ? (
                                  contact.group_names.slice(0, 2).map((groupName) => (
                                    <Chip key={`${contact.id}-${groupName}`} label={groupName} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
                                  ))
                                ) : (
                                  <Typography sx={{ fontSize: '0.74rem', color: adminPalette.textMuted }}>Belum punya grup.</Typography>
                                )}
                                {contact.group_names.length > 2 ? <Chip label={`+${contact.group_names.length - 2}`} size="small" variant="outlined" /> : null}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                <TablePagination
                  component="div"
                  count={contactDirectory.total}
                  page={Math.max(0, contactDirectory.page - 1)}
                  rowsPerPage={contactDirectory.pageSize}
                  rowsPerPageOptions={[10, 20, 50, 100]}
                  sx={{ opacity: loadingContacts ? 0.65 : 1 }}
                  onPageChange={(_, nextPage) => setContactPage(nextPage + 1)}
                  onRowsPerPageChange={(event) => {
                    setContactPageSize(Number(event.target.value));
                    setContactPage(1);
                  }}
                />
              </Stack>
            ) : null}

            {selectedSource === 'group' ? (
              <Stack spacing={1.25}>
                {groupDirectory.items.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                    Belum ada grup kontak. Kelola grup terlebih dahulu di halaman{' '}
                    <Link href="/group" style={{ color: adminPalette.brandDark, fontWeight: 700 }}>
                      Groups
                    </Link>
                    .
                  </Alert>
                ) : (
                  <>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                      <TextField
                        value={groupSearch}
                        onChange={(event) => {
                          setGroupSearch(event.target.value);
                          setGroupPage(1);
                        }}
                        placeholder="Cari grup atau anggota"
                        size="small"
                        sx={{ minWidth: { md: 280 }, '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surface } }}
                        inputProps={{ 'aria-label': 'Cari grup penerima' }}
                      />
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={`${selectedGroups.length} grup dipilih`} size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} />
                        <Chip label={`${groupPreview.totalRecipients} kontak unik`} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
                      </Stack>
                    </Stack>

                    <TableContainer>
                      <Table size="small" sx={{ minWidth: 700, '& .MuiTableCell-root': { borderBottom: `1px solid ${adminPalette.border}` } }}>
                        <TableHead sx={{ backgroundColor: adminPalette.brand }}>
                          <TableRow>
                            <TableCell sx={adminTableHeaderCellSx}>
                              Pilih
                            </TableCell>
                            <TableCell sx={adminTableHeaderCellSx}>
                              <TableSortLabel
                                active={groupSortBy === 'name'}
                                direction={groupSortBy === 'name' ? groupSortDir : GROUP_SORT_DEFAULTS.name}
                                onClick={() => handleGroupSortChange('name')}
                                sx={adminTableSortLabelSx}
                              >
                                Grup
                              </TableSortLabel>
                            </TableCell>
                            <TableCell sx={adminTableHeaderCellSx}>
                              <TableSortLabel
                                active={groupSortBy === 'memberCount'}
                                direction={groupSortBy === 'memberCount' ? groupSortDir : GROUP_SORT_DEFAULTS.memberCount}
                                onClick={() => handleGroupSortChange('memberCount')}
                                sx={adminTableSortLabelSx}
                              >
                                Jumlah anggota
                              </TableSortLabel>
                            </TableCell>
                            <TableCell sx={adminTableHeaderCellSx}>
                              Pratinjau
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {groupDirectory.items.map((group) => {
                            const active = selectedGroups.includes(group.name);

                            return (
                              <TableRow key={group.name} hover sx={{ backgroundColor: active ? adminPalette.brandSoft : 'transparent', '&:hover': { backgroundColor: adminPalette.brandSoft } }}>
                                <TableCell sx={{ py: 0.75 }}>
                                  <Checkbox checked={active} onChange={() => toggleGroup(group.name)} inputProps={{ 'aria-label': `Pilih grup ${group.name}` }} />
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }}>
                                  <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: adminPalette.textPrimary }}>{group.name}</Typography>
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }}>
                                  <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textPrimary }}>{group.memberCount}</Typography>
                                </TableCell>
                                <TableCell sx={{ py: 0.75, minWidth: 280 }}>
                                  <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary, lineHeight: 1.5 }}>{buildGroupPreview(group.previewNames, group.memberCount)}</Typography>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    <TablePagination
                      component="div"
                      count={groupDirectory.total}
                      page={Math.max(0, groupDirectory.page - 1)}
                      rowsPerPage={groupDirectory.pageSize}
                      rowsPerPageOptions={[10, 20, 50, 100]}
                      sx={{ opacity: loadingGroups ? 0.65 : 1 }}
                      onPageChange={(_, nextPage) => setGroupPage(nextPage + 1)}
                      onRowsPerPageChange={(event) => {
                        setGroupPageSize(Number(event.target.value));
                        setGroupPage(1);
                      }}
                    />
                  </>
                )}
              </Stack>
            ) : null}

            {selectedSource === 'csv' ? (
              <Stack spacing={1.25}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                  <Button component="label" variant="outlined" sx={{ ...QUIET_BUTTON_SX, px: 2.2, alignSelf: 'flex-start' }}>
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
                  {csvFileName ? <Chip label={csvFileName} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} /> : null}
                </Stack>

                <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
                  Format yang didukung: `nomor` dan `nama` opsional.
                </Typography>

                {csvRecipients.length > 0 ? (
                  <TableContainer>
                    <Table size="small" sx={{ minWidth: 520, '& .MuiTableCell-root': { borderBottom: `1px solid ${adminPalette.border}` } }}>
                      <TableHead sx={{ backgroundColor: adminPalette.brand }}>
                        <TableRow>
                          {['Nama', 'Nomor WhatsApp'].map((label) => (
                            <TableCell key={label} sx={adminTableHeaderCellSx}>
                              {label}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {csvRecipients.slice(0, 8).map((recipient) => (
                          <TableRow key={recipient.no_telp} hover sx={{ '&:hover': { backgroundColor: adminPalette.brandSoft } }}>
                            <TableCell sx={{ py: 0.75 }}>
                              <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textPrimary }}>{recipient.nama || 'Tanpa nama'}</Typography>
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textPrimary, fontFamily: 'var(--font-geist-mono), monospace' }}>{recipient.no_telp}</Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                    Upload file CSV untuk menampilkan daftar penerima.
                  </Alert>
                )}
              </Stack>
            ) : null}

            {selectedSource === 'manual' ? (
              <Stack spacing={1.25}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr 1fr auto' }, gap: 1, alignItems: 'center' }}>
                  <TextField
                    label="Nomor WhatsApp"
                    value={manualPhone}
                    onChange={(event) => setManualPhone(event.target.value)}
                    placeholder="Contoh: 6281234567890"
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Nama penerima"
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    placeholder="Opsional"
                    size="small"
                    fullWidth
                  />
                  <Button variant="contained" onClick={handleAddManualRecipient} sx={{ ...PRIMARY_BUTTON_SX, minHeight: 40 }}>
                    Tambah
                  </Button>
                </Box>

                {manualRecipients.length > 0 ? (
                  <TableContainer>
                    <Table size="small" sx={{ minWidth: 560, '& .MuiTableCell-root': { borderBottom: `1px solid ${adminPalette.border}` } }}>
                      <TableHead sx={{ backgroundColor: adminPalette.brand }}>
                        <TableRow>
                          {['Nama', 'Nomor WhatsApp', 'Aksi'].map((label) => (
                            <TableCell key={label} sx={adminTableHeaderCellSx}>
                              {label}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {manualRecipients.map((recipient) => (
                          <TableRow key={recipient.no_telp} hover sx={{ '&:hover': { backgroundColor: adminPalette.brandSoft } }}>
                            <TableCell sx={{ py: 0.75 }}>
                              <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textPrimary }}>{recipient.nama || 'Tanpa nama'}</Typography>
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textPrimary, fontFamily: 'var(--font-geist-mono), monospace' }}>{recipient.no_telp}</Typography>
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>
                              <Button variant="text" color="error" onClick={() => handleRemoveManualRecipient(recipient.no_telp)} sx={{ textTransform: 'none', fontWeight: 700 }}>
                                Hapus
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                    Tambahkan nomor secara manual untuk membangun daftar penerima.
                  </Alert>
                )}
              </Stack>
            ) : null}

            <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
              <Stack spacing={1}>
                <Typography sx={{ fontSize: '0.94rem', fontWeight: 700, color: adminPalette.textPrimary }}>Ringkasan penerima</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textMuted }}>
                  {selectedSource === 'group'
                    ? `${selectedGroups.length} grup dipilih dengan estimasi ${groupPreview.totalRecipients} penerima unik.`
                    : `${recipientCount} penerima`}
                </Typography>
                {selectedSource === 'group' ? (
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {selectedGroups.length ? (
                      selectedGroups.slice(0, 6).map((groupName) => <Chip key={groupName} label={groupName} size="small" sx={{ backgroundColor: adminPalette.surface, color: adminPalette.textSecondary, fontWeight: 700 }} />)
                    ) : (
                      <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textMuted }}>Belum ada grup yang dipilih.</Typography>
                    )}
                    {selectedGroups.length > 6 ? <Chip label={`+${selectedGroups.length - 6}`} size="small" variant="outlined" /> : null}
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {selectedRecipientPreview.length ? (
                      selectedRecipientPreview.map((recipient) => (
                        <Chip
                          key={recipient.no_telp}
                          label={recipient.nama ? `${recipient.nama} • ${recipient.no_telp}` : recipient.no_telp}
                          size="small"
                          sx={{ backgroundColor: adminPalette.surface, color: adminPalette.textSecondary, fontWeight: 700 }}
                        />
                      ))
                    ) : (
                      <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textMuted }}>Belum ada penerima yang dipilih.</Typography>
                    )}
                    {recipientCount > selectedRecipientPreview.length ? <Chip label={`+${recipientCount - selectedRecipientPreview.length}`} size="small" variant="outlined" /> : null}
                  </Stack>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            overflow: 'hidden',
            borderRadius: 2.5,
            border: `1px solid ${adminPalette.border}`,
            backgroundColor: adminPalette.surface,
            boxShadow: 'none',
          }}
        >
          <Stack spacing={1} sx={{ px: { xs: 1.25, md: 1.5 }, py: 1.2, borderBottom: `1px solid ${adminPalette.border}` }}>
            <Stack spacing={0.35}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>Pesan blast</Typography>
              <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
                Tulis pesan, sisipkan variabel, lalu buka preview untuk melihat hasil render per penerima contoh.
              </Typography>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {BLAST_VARIABLES.map((variable) => (
                  <Chip key={variable.token} clickable label={variable.token} onClick={() => handleInsertVariable(variable.token)} sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} />
                ))}
              </Stack>
              <Button variant="outlined" onClick={handleOpenPreview} disabled={!canPreviewMessage} sx={QUIET_BUTTON_SX}>
                Preview pesan
              </Button>
            </Stack>
          </Stack>

          <Stack spacing={1.5} sx={{ p: { xs: 1.25, md: 1.5 } }}>
            <Box>
              <Typography sx={{ mb: 0.8, fontSize: '0.82rem', fontWeight: 700, color: adminPalette.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Editor pesan
              </Typography>
              <Box
                sx={{
                  position: 'relative',
                  minHeight: 240,
                  borderRadius: 2.5,
                  border: `1px solid ${adminPalette.borderStrong}`,
                  backgroundColor: adminPalette.surface,
                  overflow: 'hidden',
                  '&:focus-within': {
                    borderColor: adminPalette.brand,
                    boxShadow: `0 0 0 3px ${adminPalette.brandSoft}`,
                  },
                }}
              >
                <Box
                  ref={messageMirrorRef}
                  aria-hidden
                  sx={{
                    minHeight: 240,
                    px: 1.5,
                    py: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflow: 'auto',
                    fontSize: '0.96rem',
                    lineHeight: 1.65,
                    fontFamily: 'inherit',
                    letterSpacing: 'normal',
                    color: adminPalette.textPrimary,
                  }}
                >
                  {message ? (
                    renderHighlightedTemplate(message)
                  ) : (
                    <Box component="span" sx={{ color: adminPalette.textSubtle }}>
                      Tulis pesan blast di sini. Variabel seperti {'{{name}}'} atau {'{{group_name}}'} akan disorot otomatis.
                    </Box>
                  )}
                </Box>
                <Box
                  component="textarea"
                  ref={messageInputRef}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onScroll={handleMessageScroll}
                  aria-label="Isi pesan blast"
                  spellCheck={false}
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    p: 1.5,
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    backgroundColor: 'transparent',
                    color: 'transparent',
                    caretColor: adminPalette.textPrimary,
                    fontSize: '0.96rem',
                    lineHeight: 1.65,
                    fontFamily: 'inherit',
                    letterSpacing: 'normal',
                  }}
                />
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" sx={{ mt: 0.9 }}>
                <Typography sx={{ fontSize: '0.8rem', color: message.trim().length > MAX_MESSAGE_LENGTH ? adminPalette.dangerText : adminPalette.textMuted, fontWeight: 700 }}>
                  {message.trim().length}/{MAX_MESSAGE_LENGTH} karakter
                </Typography>
              </Stack>
            </Box>

            {shouldShowSaveToGroupOption ? (
              <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
                <Stack spacing={1.25}>
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
                    <Box>
                      <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                        Simpan penerima valid ke grup setelah blast
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textMuted }}>
                        Cocok untuk sumber CSV atau input manual agar daftar baru bisa dipakai lagi nanti.
                      </Typography>
                    </Box>
                  </Stack>

                  {saveToGroup ? (
                    <TextField
                      label="Nama grup tujuan"
                      value={saveGroupName}
                      onChange={(event) => setSaveGroupName(event.target.value)}
                      placeholder="Contoh: Orang Tua Tryout 2026"
                      size="small"
                      fullWidth
                    />
                  ) : null}
                </Stack>
              </Paper>
            ) : null}

            <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
              <Stack spacing={0.75}>
                <Typography sx={{ fontSize: '0.94rem', fontWeight: 700, color: adminPalette.textPrimary }}>Siap dikirim</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textMuted }}>
                  {selectedSource ? `${recipientCount} penerima dari ${sourceLabel(selectedSource)}.` : 'Pilih sumber penerima untuk mulai menyiapkan blast.'}
                </Typography>
              </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Button variant="text" onClick={handleReset} disabled={submitting} sx={{ textTransform: 'none', fontWeight: 700, color: adminPalette.textSecondary, alignSelf: { xs: 'stretch', sm: 'center' } }}>
                Reset workspace
              </Button>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={handleOpenPreview} disabled={!canPreviewMessage} sx={QUIET_BUTTON_SX}>
                  Preview pesan
                </Button>
                <Button variant="contained" onClick={() => setConfirmOpen(true)} disabled={!canSendBlast || submitting || (requiresGroupName && !saveGroupName.trim())} sx={PRIMARY_BUTTON_SX}>
                  {submitting ? 'Mengirim...' : 'Kirim blast'}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Paper>
      </Box>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Preview pesan</DialogTitle>
        <DialogContent>
          {activePreviewRecipient ? (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                <Box>
                  <Typography sx={{ fontSize: '0.98rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                    {activePreviewRecipient.nama || 'Tanpa nama'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textSecondary }}>
                    {activePreviewRecipient.no_telp}
                  </Typography>
                  {activePreviewRecipient.group_names?.length ? (
                    <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textMuted }}>
                      Grup: {activePreviewRecipient.group_names.join(', ')}
                    </Typography>
                  ) : null}
                </Box>

                {previewableRecipients.length > 1 ? (
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" onClick={() => setPreviewIndex((previous) => Math.max(0, previous - 1))} disabled={previewIndex <= 0} sx={QUIET_BUTTON_SX}>
                      Sebelumnya
                    </Button>
                    <Button variant="outlined" onClick={() => setPreviewIndex((previous) => Math.min(previewableRecipients.length - 1, previous + 1))} disabled={previewIndex >= previewableRecipients.length - 1} sx={QUIET_BUTTON_SX}>
                      Berikutnya
                    </Button>
                  </Stack>
                ) : null}
              </Stack>

              <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
                <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: adminPalette.textPrimary }}>
                  {renderedPreviewContent}
                </Typography>
              </Paper>

              {recipientCount > previewableRecipients.length ? (
                <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textMuted }}>
                  Preview dibatasi ke {previewableRecipients.length} penerima contoh pertama dari total {recipientCount}.
                </Typography>
              ) : null}
            </Stack>
          ) : (
            <Typography sx={{ mt: 0.5, fontSize: '0.92rem', color: adminPalette.textSecondary }}>
              Belum ada penerima yang bisa dipakai untuk preview.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setPreviewOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Tutup
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Konfirmasi pengiriman</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.7, color: adminPalette.textSecondary }}>
              Blast akan dikirim ke {recipientCount} penerima dari {sourceLabel(selectedSource)}. Pastikan isi pesan dan segmentasi sudah sesuai.
            </Typography>

            <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
              <Stack spacing={0.75}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: adminPalette.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Ringkasan
                </Typography>
                <Typography sx={{ fontSize: '0.92rem', color: adminPalette.textPrimary }}>
                  {message.trim().slice(0, 220)}
                  {message.trim().length > 220 ? '...' : ''}
                </Typography>
                {requiresGroupName ? (
                  <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textSecondary }}>
                    Penerima valid juga akan disimpan ke grup <strong>{saveGroupName.trim()}</strong>.
                  </Typography>
                ) : null}
              </Stack>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setConfirmOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Cek lagi
          </Button>
          <Button variant="contained" onClick={handleSendBlast} disabled={submitting || (requiresGroupName && !saveGroupName.trim())} sx={PRIMARY_BUTTON_SX}>
            Ya, kirim sekarang
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
