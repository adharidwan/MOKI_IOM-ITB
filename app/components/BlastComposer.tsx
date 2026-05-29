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
  IconButton,
  InputAdornment,
  MenuItem,
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
  Tooltip,
  Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import InsertPhotoRoundedIcon from '@mui/icons-material/InsertPhotoRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';

import { BLAST_VARIABLES, renderBlastMessageTemplate } from '../lib/blast-variables';
import { adminPalette, adminTableHeaderCellSx, adminTableSortLabelSx } from '../lib/adminPalette';
import { downloadCsvContactTemplate } from '../lib/csv-template';
import type { CsvContact } from '../lib/types';

const TRACKER_REGISTER_EVENT = 'outbound-tracker-register';
const MAX_MESSAGE_LENGTH = 4096;
const MAX_BLAST_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
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

interface BlastTemplateSummary {
  id: string;
  title: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface BlastTemplateListResponse {
  items: BlastTemplateSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

const SCHEDULE_TIME_ZONE = 'Asia/Jakarta';

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function toJakartaDatetimeLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${valueByType.get('year')}-${valueByType.get('month')}-${valueByType.get('day')}T${valueByType.get('hour')}:${valueByType.get('minute')}`;
}

function jakartaDatetimeLocalToISOString(value: string): string {
  if (!value) return '';
  const valueWithSeconds = value.length === 16 ? `${value}:00` : value;
  return new Date(`${valueWithSeconds}+07:00`).toISOString();
}

function formatFileSize(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(value / 1024))} KB`;
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
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveToGroup, setSaveToGroup] = useState(false);
  const [saveGroupName, setSaveGroupName] = useState('');
  const [status, setStatus] = useState<
    { type: 'success' | 'error' | 'info' | 'warning'; message: string } | null
  >(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleType, setScheduleType] = useState<'once' | 'recurring'>('once');
  const [scheduleRunAt, setScheduleRunAt] = useState('');
  const [scheduleRecurrence, setScheduleRecurrence] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [scheduling, setScheduling] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateItems, setTemplateItems] = useState<BlastTemplateSummary[]>([]);
  const [templateTotal, setTemplateTotal] = useState(0);
  const [templatePage, setTemplatePage] = useState(1);
  const [templatePageSize, setTemplatePageSize] = useState(5);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BlastTemplateSummary | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<BlastTemplateSummary | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageMirrorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

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
  const hasBlastContent = message.trim().length > 0 || Boolean(selectedImage);
  const canPreviewMessage = recipientCount > 0 && hasBlastContent;
  const canSendBlast = Boolean(selectedSource) && recipientCount > 0 && hasBlastContent && message.trim().length <= MAX_MESSAGE_LENGTH;
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
    if (!selectedImage) {
      setImagePreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(selectedImage);
    setImagePreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedImage]);

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

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setStatus({ type: 'error', message: 'Lampiran harus berupa file image.' });
      return;
    }

    if (file.size > MAX_BLAST_IMAGE_SIZE_BYTES) {
      setStatus({ type: 'error', message: 'Ukuran image maksimal 10 MB.' });
      return;
    }

    setSelectedImage(file);
    setStatus({ type: 'success', message: `Image ${file.name} siap dikirim sebagai lampiran blast.` });
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const buildBlastFormData = () => {
    const formData = new FormData();
    formData.append('source', selectedSource || 'manual');
    formData.append('message', message);
    formData.append('recipients', JSON.stringify(selectedSource === 'group' ? [] : recipients));
    formData.append('groupNames', JSON.stringify(selectedSource === 'group' ? selectedGroups : []));
    formData.append('saveToGroup', String(requiresGroupName));
    formData.append('groupName', requiresGroupName ? saveGroupName.trim() : '');
    formData.append('saveGroupName', requiresGroupName ? saveGroupName.trim() : '');
    formData.append('sourceFile', selectedSource === 'csv' ? csvFileName || 'blast-csv' : '');
    if (selectedImage) {
      formData.append('image', selectedImage);
    }
    return formData;
  };

  const handleOpenPreview = () => {
    if (!canPreviewMessage) {
      setStatus({ type: 'error', message: 'Pilih penerima lalu tulis pesan atau tambahkan image sebelum membuka preview.' });
      return;
    }

    setPreviewIndex(0);
    setPreviewOpen(true);
  };

  const openScheduleDialog = () => {
    if (!canSendBlast) {
      setStatus({ type: 'error', message: 'Lengkapi penerima lalu tulis pesan atau tambahkan image sebelum menjadwalkan blast.' });
      return;
    }

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setMinutes(0, 0, 0);
    setScheduleName(scheduleName || `Blast ${sourceLabel(selectedSource)}`);
    setScheduleRunAt(toJakartaDatetimeLocal(tomorrow));
    setScheduleOpen(true);
  };

  const handleScheduleBlast = async () => {
    if (!selectedSource || !canSendBlast) {
      setStatus({ type: 'error', message: 'Data schedule belum lengkap.' });
      return;
    }

    if (scheduleType === 'once' && !scheduleRunAt) {
      setStatus({ type: 'error', message: 'Isi waktu kirim schedule terlebih dahulu.' });
      return;
    }

    setScheduling(true);
    const formData = buildBlastFormData();
    formData.append('name', scheduleName.trim() || `Blast ${sourceLabel(selectedSource)}`);
    formData.append('scheduleType', scheduleType);
    formData.append('recurrenceType', scheduleType === 'recurring' ? scheduleRecurrence : '');
    formData.append('runAt', scheduleRunAt ? jakartaDatetimeLocalToISOString(scheduleRunAt) : '');
    formData.append('timezone', SCHEDULE_TIME_ZONE);

    const response = await fetch('/api/admin/scheduled-blasts', {
      method: 'POST',
      body: formData,
    });

    const result = (await response.json()) as { error?: string };
    setScheduling(false);

    if (!response.ok) {
      setStatus({ type: 'error', message: result.error || 'Scheduled blast gagal dibuat.' });
      return;
    }

    setScheduleOpen(false);
    setStatus({ type: 'success', message: 'Scheduled blast berhasil dibuat.' });
    window.dispatchEvent(new CustomEvent('scheduled-blasts-refresh'));
  };

  const fetchTemplates = async (input: { page: number; pageSize: number; search: string }) => {
    setTemplateLoading(true);
    const params = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    });
    if (input.search.trim()) params.set('search', input.search.trim());

    const response = await fetch(`/api/admin/blast-templates?${params.toString()}`, { cache: 'no-store' });
    const payload = (await response.json()) as Partial<BlastTemplateListResponse> & { error?: string };
    setTemplateLoading(false);

    if (!response.ok) {
      setStatus({ type: 'error', message: payload.error || 'Gagal memuat template blast.' });
      return;
    }

    setTemplateItems(payload.items || []);
    setTemplateTotal(payload.total || 0);
  };

  const loadTemplates = (overrides: Partial<Parameters<typeof fetchTemplates>[0]> = {}) => fetchTemplates({
    page: templatePage,
    pageSize: templatePageSize,
    search: templateSearch,
    ...overrides,
  });

  const openTemplateManager = () => {
    setTemplatePage(1);
    setTemplateOpen(true);
    void fetchTemplates({ page: 1, pageSize: templatePageSize, search: templateSearch });
  };

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateTitle('');
    setTemplateDescription('');
    setTemplateContent(message.trim());
    setTemplateEditorOpen(true);
  };

  const openEditTemplate = (item: BlastTemplateSummary) => {
    setEditingTemplate(item);
    setTemplateTitle(item.title);
    setTemplateDescription(item.description);
    setTemplateContent(item.content);
    setTemplateEditorOpen(true);
  };

  const handleSaveTemplate = async () => {
    setTemplateSaving(true);
    const response = await fetch(editingTemplate ? `/api/admin/blast-templates/${editingTemplate.id}` : '/api/admin/blast-templates', {
      method: editingTemplate ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: templateTitle,
        description: templateDescription,
        content: templateContent,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    setTemplateSaving(false);

    if (!response.ok) {
      setStatus({ type: 'error', message: payload.error || 'Gagal menyimpan template blast.' });
      return;
    }

    setTemplateEditorOpen(false);
    setStatus({ type: 'success', message: editingTemplate ? 'Template blast berhasil diperbarui.' : 'Template blast berhasil disimpan.' });
    setTemplatePage(1);
    await loadTemplates({ page: 1 });
  };

  const handleUseTemplate = (item: BlastTemplateSummary) => {
    if (message.trim() && !window.confirm('Pesan saat ini akan diganti dengan template ini. Lanjutkan?')) {
      return;
    }

    setMessage(item.content);
    setTemplateOpen(false);
    setPreviewTemplate(null);
    setStatus({ type: 'success', message: `Template "${item.title}" dipakai sebagai pesan blast.` });
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Hapus template blast ini?')) return;
    const response = await fetch(`/api/admin/blast-templates/${id}`, { method: 'DELETE' });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setStatus({ type: 'error', message: payload.error || 'Gagal menghapus template blast.' });
      return;
    }

    setStatus({ type: 'success', message: 'Template blast berhasil dihapus.' });
    setPreviewTemplate((current) => (current?.id === id ? null : current));
    await loadTemplates();
  };

  const handleSendBlast = async () => {
    if (!selectedSource || recipientCount === 0 || !hasBlastContent) {
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
      body: buildBlastFormData(),
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
    setSelectedImage(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
    setSaveToGroup(false);
    setSaveGroupName('');
    setSubmitting(false);
    setStatus(null);
    setConfirmOpen(false);
    setPreviewOpen(false);
    setScheduleOpen(false);
    setTemplateOpen(false);
    setTemplateEditorOpen(false);
    setPreviewTemplate(null);
    setScheduleName('');
    setScheduleType('once');
    setScheduleRunAt('');
    setScheduleRecurrence('daily');
    setScheduling(false);
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
              {selectedImage ? (
                <Chip label={`Image: ${selectedImage.name}`} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
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
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRoundedIcon sx={{ fontSize: 17, color: adminPalette.textSubtle }} />
                        </InputAdornment>
                      ),
                    }}
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
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <SearchRoundedIcon sx={{ fontSize: 17, color: adminPalette.textSubtle }} />
                            </InputAdornment>
                          ),
                        }}
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
                  <Button
                    type="button"
                    variant="outlined"
                    onClick={() => downloadCsvContactTemplate()}
                    sx={{ ...QUIET_BUTTON_SX, px: 2.2, alignSelf: 'flex-start' }}
                  >
                    Download template CSV
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
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Tooltip title="Template pesan">
                  <Button
                    variant="outlined"
                    onClick={openTemplateManager}
                    sx={QUIET_BUTTON_SX}
                  >
                    Template
                  </Button>
                </Tooltip>
                <Tooltip title="Simpan sebagai template">
                  <Button
                    variant="outlined"
                    onClick={openCreateTemplate}
                    disabled={!message.trim()}
                    sx={QUIET_BUTTON_SX}
                  >
                    Simpan
                  </Button>
                </Tooltip>
              </Stack>
            </Stack>
          </Stack>

          <Stack spacing={1.5} sx={{ p: { xs: 1.25, md: 1.5 } }}>
            <Box>
              <Typography sx={{ mb: 0.8, fontSize: '0.82rem', fontWeight: 700, color: adminPalette.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Editor pesan
              </Typography>
              <input
                ref={imageInputRef}
                hidden
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    handleImageFile(file);
                  }
                }}
              />
              <Box
                sx={{
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
                {selectedImage ? (
                  <Box sx={{ px: 1.25, pt: 1.25 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{
                        p: 0.75,
                        borderRadius: 2,
                        border: `1px solid ${adminPalette.border}`,
                        backgroundColor: adminPalette.surfaceSoft,
                      }}
                    >
                      <Box sx={{ width: 48, height: 48, borderRadius: 1.5, overflow: 'hidden', backgroundColor: adminPalette.surface, border: `1px solid ${adminPalette.border}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {imagePreviewUrl ? (
                          <Box component="img" src={imagePreviewUrl} alt="Preview image blast" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <InsertPhotoRoundedIcon sx={{ color: adminPalette.brand, fontSize: 24 }} />
                        )}
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: adminPalette.textPrimary }} noWrap>
                          {selectedImage.name}
                        </Typography>
                        <Typography sx={{ mt: 0.15, fontSize: '0.76rem', color: adminPalette.textMuted }}>
                          {selectedImage.type || 'image'} • {formatFileSize(selectedImage.size)}
                        </Typography>
                      </Box>
                      <Tooltip title="Hapus image">
                        <IconButton size="small" onClick={handleRemoveImage} aria-label="Hapus image blast" sx={{ color: adminPalette.textMuted }}>
                          <CloseRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                ) : null}

                <Box sx={{ position: 'relative', minHeight: selectedImage ? 188 : 240 }}>
                  <Box
                    ref={messageMirrorRef}
                    aria-hidden
                    sx={{
                      minHeight: selectedImage ? 188 : 240,
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

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  justifyContent="space-between"
                  sx={{ px: 1, py: 0.85, borderTop: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surfaceSoft }}
                >
                  <Stack direction="row" spacing={0.85} alignItems="center" sx={{ minWidth: 0 }}>
                    <Tooltip title={selectedImage ? 'Ganti image' : 'Tambahkan image'}>
                      <IconButton
                        onClick={() => imageInputRef.current?.click()}
                        aria-label={selectedImage ? 'Ganti image blast' : 'Tambahkan image ke blast'}
                        sx={{
                          border: `1px solid ${adminPalette.border}`,
                          backgroundColor: selectedImage ? adminPalette.brandSoft : adminPalette.surface,
                          color: adminPalette.brandDark,
                          '&:hover': { backgroundColor: adminPalette.brandSoft },
                        }}
                      >
                        <ImageRoundedIcon />
                      </IconButton>
                    </Tooltip>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                        {selectedImage ? 'Image terlampir' : 'Tambahkan image'}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'space-between', sm: 'flex-end' }}>
                    {selectedImage ? (
                      <Button variant="text" onClick={() => imageInputRef.current?.click()} sx={{ minHeight: 30, px: 1, textTransform: 'none', fontWeight: 800, color: adminPalette.brand }}>
                        Ganti
                      </Button>
                    ) : null}
                    <Typography sx={{ fontSize: '0.78rem', color: message.trim().length > MAX_MESSAGE_LENGTH ? adminPalette.dangerText : adminPalette.textMuted, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {message.trim().length}/{MAX_MESSAGE_LENGTH} karakter
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
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
                  Preview
                </Button>
                <Button variant="outlined" onClick={openScheduleDialog} disabled={!canSendBlast || submitting || scheduling || (requiresGroupName && !saveGroupName.trim())} sx={QUIET_BUTTON_SX}>
                  Jadwalkan
                </Button>
                <Button variant="contained" onClick={() => setConfirmOpen(true)} disabled={!canSendBlast || submitting || (requiresGroupName && !saveGroupName.trim())} sx={PRIMARY_BUTTON_SX}>
                  {submitting ? 'Mengirim...' : 'Kirim blast'}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Paper>
      </Box>

      <Dialog open={templateOpen} onClose={() => setTemplateOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Template pesan blast</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
              <TextField
                value={templateSearch}
                onChange={(event) => {
                  const nextSearch = event.target.value;
                  setTemplateSearch(nextSearch);
                  setTemplatePage(1);
                  void loadTemplates({ page: 1, search: nextSearch });
                }}
                placeholder="Cari judul, deskripsi, atau isi"
                size="small"
                sx={{ minWidth: { sm: 280 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ fontSize: 17, color: adminPalette.textSubtle }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={() => void loadTemplates()} disabled={templateLoading} sx={QUIET_BUTTON_SX}>
                  {templateLoading ? 'Memuat...' : 'Refresh'}
                </Button>
                <Button variant="contained" onClick={openCreateTemplate} sx={PRIMARY_BUTTON_SX}>
                  Template baru
                </Button>
              </Stack>
            </Stack>

            <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${adminPalette.border}`, borderRadius: 2.5 }}>
                <Table size="small" sx={{ minWidth: 760, '& .MuiTableCell-root': { borderBottom: `1px solid ${adminPalette.border}` } }}>
                  <TableHead sx={{ backgroundColor: adminPalette.brand }}>
                    <TableRow>
                      {['Template', 'Diperbarui', 'Aksi'].map((label) => (
                        <TableCell key={label} sx={adminTableHeaderCellSx}>{label}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {templateItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ py: 6, textAlign: 'center' }}>
                          <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Belum ada template blast.</Typography>
                          <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>Simpan pesan saat ini sebagai template untuk dipakai ulang.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : templateItems.map((item) => (
                      <TableRow key={item.id} hover onClick={() => setPreviewTemplate(item)} sx={{ cursor: 'pointer', '&:hover': { backgroundColor: adminPalette.brandSoft } }}>
                        <TableCell sx={{ py: 0.9, minWidth: 360 }}>
                          <Typography sx={{ fontSize: '0.86rem', fontWeight: 800, color: adminPalette.textPrimary }}>{item.title}</Typography>
                          {item.description ? (
                            <Typography sx={{ mt: 0.25, fontSize: '0.78rem', color: adminPalette.textSecondary }}>{item.description}</Typography>
                          ) : null}
                          <Typography sx={{ mt: 0.55, fontSize: '0.78rem', color: adminPalette.textMuted, whiteSpace: 'pre-wrap' }}>
                            {item.content.slice(0, 180)}{item.content.length > 180 ? '...' : ''}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.9, minWidth: 160 }}>
                          <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>{formatDate(item.updatedAt)}</Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.9, minWidth: 230 }}>
                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            <Button variant="outlined" onClick={(event) => { event.stopPropagation(); handleUseTemplate(item); }} sx={QUIET_BUTTON_SX}>Use</Button>
                            <Button variant="outlined" onClick={(event) => { event.stopPropagation(); openEditTemplate(item); }} sx={QUIET_BUTTON_SX}>Edit</Button>
                            <Button variant="text" color="error" onClick={(event) => { event.stopPropagation(); handleDeleteTemplate(item.id); }} sx={{ textTransform: 'none', fontWeight: 700 }}>Delete</Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

            <TablePagination
              component="div"
              count={templateTotal}
              page={Math.max(0, templatePage - 1)}
              rowsPerPage={templatePageSize}
              rowsPerPageOptions={[10, 20, 50, 100]}
              onPageChange={(_, nextPage) => {
                const nextPageNumber = nextPage + 1;
                setTemplatePage(nextPageNumber);
                void loadTemplates({ page: nextPageNumber });
              }}
              onRowsPerPageChange={(event) => {
                const nextPageSize = Number(event.target.value);
                setTemplatePageSize(nextPageSize);
                setTemplatePage(1);
                void loadTemplates({ page: 1, pageSize: nextPageSize });
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setTemplateOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Tutup
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={templateEditorOpen} onClose={() => setTemplateEditorOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>
          {editingTemplate ? 'Edit template blast' : 'Simpan template blast'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Judul template"
              value={templateTitle}
              onChange={(event) => setTemplateTitle(event.target.value)}
              inputProps={{ maxLength: 120 }}
              size="small"
              fullWidth
            />
            <TextField
              label="Deskripsi"
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
              inputProps={{ maxLength: 240 }}
              size="small"
              fullWidth
            />
            <TextField
              label="Konten template"
              value={templateContent}
              onChange={(event) => setTemplateContent(event.target.value)}
              inputProps={{ maxLength: MAX_MESSAGE_LENGTH }}
              size="small"
              fullWidth
              multiline
              minRows={5}
            />
            <Typography sx={{ fontSize: '0.8rem', color: templateContent.trim().length > MAX_MESSAGE_LENGTH ? adminPalette.dangerText : adminPalette.textMuted, fontWeight: 700 }}>
              {templateContent.trim().length}/{MAX_MESSAGE_LENGTH} karakter
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setTemplateEditorOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Batal
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveTemplate}
            disabled={templateSaving || !templateTitle.trim() || !templateContent.trim() || templateContent.trim().length > MAX_MESSAGE_LENGTH}
            sx={PRIMARY_BUTTON_SX}
          >
            {templateSaving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(previewTemplate)} onClose={() => setPreviewTemplate(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{previewTemplate?.title || 'Preview template'}</DialogTitle>
        <DialogContent>
          {previewTemplate ? (
            <Stack spacing={1.5} sx={{ mt: 0.5 }}>
              {previewTemplate.description ? (
                <Typography sx={{ fontSize: '0.9rem', color: adminPalette.textSecondary }}>{previewTemplate.description}</Typography>
              ) : null}
              <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
                <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: adminPalette.textPrimary }}>
                  {previewTemplate.content}
                </Typography>
              </Paper>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setPreviewTemplate(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Tutup
          </Button>
          {previewTemplate ? (
            <Button variant="contained" onClick={() => handleUseTemplate(previewTemplate)} sx={PRIMARY_BUTTON_SX}>
              Use template
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>

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
                <Stack spacing={1.25}>
                  {imagePreviewUrl ? (
                    <Box component="img" src={imagePreviewUrl} alt="Preview image blast" sx={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 2, backgroundColor: adminPalette.surface }} />
                  ) : null}
                  {renderedPreviewContent ? (
                    <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: adminPalette.textPrimary }}>
                      {renderedPreviewContent}
                    </Typography>
                  ) : (
                    <Typography sx={{ fontSize: '0.86rem', color: adminPalette.textMuted }}>
                      Image akan dikirim tanpa caption.
                    </Typography>
                  )}
                </Stack>
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

      <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Jadwalkan blast</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Nama schedule"
              value={scheduleName}
              onChange={(event) => setScheduleName(event.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              select
              label="Tipe schedule"
              value={scheduleType}
              onChange={(event) => setScheduleType(event.target.value as 'once' | 'recurring')}
              size="small"
              fullWidth
            >
              <MenuItem value="once">Sekali kirim</MenuItem>
              <MenuItem value="recurring">Periodik</MenuItem>
            </TextField>
            <TextField
              label={scheduleType === 'once' ? 'Waktu kirim' : 'Mulai kirim'}
              type="datetime-local"
              value={scheduleRunAt}
              onChange={(event) => setScheduleRunAt(event.target.value)}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            {scheduleType === 'recurring' ? (
              <TextField
                select
                label="Pengulangan"
                value={scheduleRecurrence}
                onChange={(event) => setScheduleRecurrence(event.target.value as 'daily' | 'weekly' | 'monthly')}
                size="small"
                fullWidth
              >
                <MenuItem value="daily">Setiap hari</MenuItem>
                <MenuItem value="weekly">Setiap minggu</MenuItem>
                <MenuItem value="monthly">Setiap bulan</MenuItem>
              </TextField>
            ) : null}
            <Paper elevation={0} sx={{ p: 1.25, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
              <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textSecondary }}>
                Schedule akan memakai pesan saat ini dan {recipientCount} penerima dari {sourceLabel(selectedSource)}.
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setScheduleOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Batal
          </Button>
          <Button variant="contained" onClick={handleScheduleBlast} disabled={scheduling} sx={PRIMARY_BUTTON_SX}>
            {scheduling ? 'Menyimpan...' : 'Simpan schedule'}
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
                  {message.trim() ? `${message.trim().slice(0, 220)}${message.trim().length > 220 ? '...' : ''}` : 'Tanpa caption teks.'}
                </Typography>
                {selectedImage ? (
                  <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textSecondary }}>
                    Image terlampir: <strong>{selectedImage.name}</strong> ({formatFileSize(selectedImage.size)}).
                  </Typography>
                ) : null}
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
