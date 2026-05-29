'use client';

import type { ClipboardEvent } from 'react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ImageNotSupportedRoundedIcon from '@mui/icons-material/ImageNotSupportedRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
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

import {
  adminMetricLabelSx,
  adminMetricTileSx,
  adminMetricValueSx,
  adminPalette,
  adminPanelSx,
  adminSectionLabelSx,
  adminTableSortLabelSx,
} from '../lib/adminPalette';
import type { ContentRecording, ContentRecordingPlatform, ContentRecordingType, ContentTag } from '../lib/types';
import type { ContentRecordingSortKey, ContentRecordingsOverview, SortDirection } from '../lib/api';
import type { ContentRecordingFormState } from './actions';
import {
  deleteContentRecordingAction,
  scrapeContentRecordingAction,
  saveContentRecordingAction,
} from './actions';
import { useDownloadManager } from '../components/DownloadProvider';

interface WorkspaceProps {
  recordings: ContentRecording[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  overview: ContentRecordingsOverview;
  tags: ContentTag[];
  currentSearch: string;
  currentPlatform: string;
  currentContentType: string;
  currentTagIds: string[];
  currentSortBy: ContentRecordingSortKey;
  currentSortDir: SortDirection;
  initialLoadError?: string | null;
}

type FlashState =
  | { severity: 'success' | 'info' | 'warning' | 'error'; message: string }
  | null;

interface TagOption {
  id: string;
  name: string;
  inputValue?: string;
  isNew?: boolean;
}

const PLATFORM_OPTIONS: Array<{ value: ContentRecordingPlatform; label: string }> = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'x', label: 'X' },
  { value: 'Website', label: 'Website' },
];

const CONTENT_TYPE_OPTIONS: Array<{ value: ContentRecordingType; label: string }> = [
  { value: 'video', label: 'Video' },
  { value: 'short', label: 'Short' },
  { value: 'reel', label: 'Reel' },
  { value: 'post', label: 'Post' },
  { value: 'tweet', label: 'Tweet' },
  { value: 'article', label: 'Article' },
  { value: 'other', label: 'Other' },
];

const SORT_LABELS: Record<ContentRecordingSortKey, string> = {
  title: 'Title',
  platform: 'Platform',
  content_type: 'Type',
  upload_date: 'Date Uploaded',
  created_at: 'Added',
  updated_at: 'Updated',
};

const EMPTY_FORM: ContentRecordingFormState = {
  id: null,
  title: '',
  platform: 'youtube',
  caption: '',
  description: '',
  content_type: '',
  upload_date: '',
  link: '',
  source_post_id: '',
  thumbnail_url: '',
  media_urls: [],
  tag_ids: [],
  new_tag_names: [],
};

const tagFilter = createFilterOptions<TagOption>();
const VISIBLE_TAG_LIMIT = 2;

const CONTENT_TAG_SX = {
  height: 22,
  borderRadius: 1.75,
  backgroundColor: adminPalette.brandSoft,
  color: adminPalette.brandDark,
  border: `1px solid ${adminPalette.brandSoftStrong}`,
  fontSize: '0.71rem',
  fontWeight: 600,
} as const;

const IMAGE_PREVIEW_SX = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  objectPosition: 'center',
  display: 'block',
} as const;

const PREVIEW_FRAME_SX = {
  borderRadius: 1.5,
  border: `1px solid ${adminPalette.border}`,
  backgroundColor: adminPalette.surfaceSoft,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  p: 0.5,
  boxSizing: 'border-box',
} as const;

const CONTENT_TAG_TOOLTIP_SLOT_PROPS = {
  tooltip: {
    sx: {
      maxWidth: 320,
      p: 1,
      borderRadius: 2,
      backgroundColor: adminPalette.surface,
      color: adminPalette.textPrimary,
      border: `1px solid ${adminPalette.border}`,
      boxShadow: '0 18px 45px rgba(15, 23, 42, 0.18)',
    },
  },
  arrow: {
    sx: {
      color: adminPalette.surface,
      '&::before': {
        border: `1px solid ${adminPalette.border}`,
      },
    },
  },
} as const;

function createEmptyForm(): ContentRecordingFormState {
  return { ...EMPTY_FORM, media_urls: [], tag_ids: [], new_tag_names: [] };
}

function normalizeMediaUrls(values: string[]): string[] {
  const byUrl = new Map<string, string>();

  values.forEach((value) => {
    const url = String(value || '').trim();
    if (url) {
      byUrl.set(url, url);
    }
  });

  return Array.from(byUrl.values());
}

function getPreviewUrls(record: Pick<ContentRecording, 'thumbnail_url' | 'media_urls'>): string[] {
  return normalizeMediaUrls([...(record.media_urls || []), record.thumbnail_url || '']);
}

function getInstagramEmbedUrl(link: string): string {
  const match = String(link || '').match(/instagram\.com\/(p|reel|tv)\/([^/?#]+)/i);
  if (!match) {
    return '';
  }

  return `https://www.instagram.com/${match[1].toLowerCase()}/${match[2]}/embed`;
}

function getXEmbedUrl(link: string): string {
  const match = String(link || '').match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i);
  if (!match) {
    return '';
  }

  return `https://platform.twitter.com/embed/Tweet.html?id=${match[1]}&theme=light`;
}

function isDownloadableRecord(record: Pick<ContentRecording, 'platform' | 'link'>): boolean {
  try {
    const url = new URL(record.link);
    const hostname = url.hostname.toLowerCase();

    if (record.platform === 'youtube') {
      return hostname === 'youtu.be' || hostname.endsWith('youtube.com');
    }

    if (record.platform === 'x') {
      return (
        (hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com' || hostname.endsWith('.twitter.com')) &&
        /\/[^/]+\/status\/\d+/i.test(url.pathname)
      );
    }

    if (record.platform === 'Instagram') {
      return (
        (hostname === 'instagram.com' || hostname.endsWith('.instagram.com')) &&
        /\/(p|reel|tv)\//i.test(url.pathname)
      );
    }
  } catch {
    return false;
  }

  return false;
}

function formatDateLabel(value: string): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatPlatformLabel(value: ContentRecordingPlatform): string {
  return PLATFORM_OPTIONS.find((option) => option.value === value)?.label || value;
}

function formatContentTypeLabel(value: ContentRecordingType | null | ''): string {
  if (!value) {
    return 'Unspecified';
  }

  return CONTENT_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function normalizeTagOption(option: TagOption | string): TagOption {
  if (typeof option === 'string') {
    const name = option.replace(/\s+/g, ' ').trim();
    return { id: `new:${name.toLowerCase()}`, name, inputValue: name, isNew: true };
  }

  if (option.inputValue) {
    return {
      id: `new:${option.inputValue.toLowerCase()}`,
      name: option.inputValue,
      inputValue: option.inputValue,
      isNew: true,
    };
  }

  return option;
}

function toForm(record: ContentRecording): ContentRecordingFormState {
  return {
    id: record.id,
    title: record.title,
    platform: record.platform,
    caption: record.caption || '',
    description: record.description || '',
    content_type: record.content_type || '',
    upload_date: record.upload_date,
    link: record.link,
    source_post_id: record.source_post_id || '',
    thumbnail_url: record.thumbnail_url || '',
    media_urls: record.media_urls || [],
    tag_ids: record.tags.map((tag) => tag.id),
    new_tag_names: [],
  };
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={adminSectionLabelSx}>
      {children}
    </Typography>
  );
}

function setOptionalParam(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}

function toUrl(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function PreviewImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return <Box component="img" src={src} alt={alt} sx={IMAGE_PREVIEW_SX} />;
}

function PreviewCarousel({
  urls,
  alt,
  emptyLabel = 'No thumbnail preview',
}: {
  urls: string[];
  alt: string;
  emptyLabel?: string;
}) {
  const normalizedUrls = useMemo(() => normalizeMediaUrls(urls), [urls]);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasMultiple = normalizedUrls.length > 1;
  const safeActiveIndex = Math.min(activeIndex, Math.max(normalizedUrls.length - 1, 0));
  const activeUrl = normalizedUrls[safeActiveIndex];

  if (!activeUrl) {
    return <Typography sx={{ color: adminPalette.textMuted, fontWeight: 700 }}>{emptyLabel}</Typography>;
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <PreviewImage src={activeUrl} alt={alt} />
      {hasMultiple ? (
        <>
          <IconButton
            size="small"
            aria-label="Previous media"
            onClick={(event) => {
              event.stopPropagation();
              setActiveIndex((current) => (current - 1 + normalizedUrls.length) % normalizedUrls.length);
            }}
            sx={{
              position: 'absolute',
              left: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 22,
              height: 22,
              color: '#ffffff',
              backgroundColor: 'rgba(15, 23, 42, 0.62)',
              '&:hover': { backgroundColor: 'rgba(15, 23, 42, 0.78)' },
            }}
          >
            <ChevronLeftRoundedIcon sx={{ fontSize: 17 }} />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Next media"
            onClick={(event) => {
              event.stopPropagation();
              setActiveIndex((current) => (current + 1) % normalizedUrls.length);
            }}
            sx={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 22,
              height: 22,
              color: '#ffffff',
              backgroundColor: 'rgba(15, 23, 42, 0.62)',
              '&:hover': { backgroundColor: 'rgba(15, 23, 42, 0.78)' },
            }}
          >
            <ChevronRightRoundedIcon sx={{ fontSize: 17 }} />
          </IconButton>
          <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 4, display: 'flex', justifyContent: 'center', gap: 0.4 }}>
            {normalizedUrls.map((url, index) => (
              <Box key={`${url}-${index}`} sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: index === safeActiveIndex ? '#ffffff' : 'rgba(255, 255, 255, 0.55)' }} />
            ))}
          </Box>
        </>
      ) : null}
    </Box>
  );
}

function InstagramEmbedPreview({
  link,
  compact = false,
}: {
  link: string;
  compact?: boolean;
}) {
  const embedUrl = getInstagramEmbedUrl(link);

  if (!embedUrl) {
    return <ImageNotSupportedRoundedIcon sx={{ color: adminPalette.textSubtle }} />;
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
      }}
    >
      <Box
        component="iframe"
        src={embedUrl}
        title="Instagram post preview"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        sx={{
          border: 0,
          display: 'block',
          width: compact ? 328 : '100%',
          height: compact ? 430 : '100%',
          transform: compact ? 'scale(0.31)' : 'none',
          transformOrigin: 'top left',
          pointerEvents: compact ? 'none' : 'auto',
        }}
      />
    </Box>
  );
}

function XEmbedPreview({
  link,
  compact = false,
}: {
  link: string;
  compact?: boolean;
}) {
  const embedUrl = getXEmbedUrl(link);

  if (!embedUrl) {
    return <ImageNotSupportedRoundedIcon sx={{ color: adminPalette.textSubtle }} />;
  }

  return (
    <Box
      component="iframe"
      src={embedUrl}
      title="X post preview"
      loading="lazy"
      sx={{
        border: 0,
        display: 'block',
        width: compact ? 360 : '100%',
        height: compact ? 520 : '100%',
        transform: compact ? 'scale(0.29)' : 'none',
        transformOrigin: 'top left',
        pointerEvents: compact ? 'none' : 'auto',
        backgroundColor: '#ffffff',
      }}
    />
  );
}

function XPostFallbackPreview({
  title,
  caption,
  sourcePostId,
}: {
  title: string;
  caption: string | null;
  sourcePostId: string | null;
}) {
  return (
    <Stack
      spacing={0.7}
      sx={{
        width: '100%',
        height: '100%',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        p: 1,
        backgroundColor: '#ffffff',
      }}
    >
      <Stack direction="row" spacing={0.7} alignItems="center" sx={{ minWidth: 0 }}>
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
            backgroundColor: '#111827',
            color: '#ffffff',
            fontSize: '0.75rem',
            fontWeight: 800,
          }}
        >
          X
        </Box>
        <Typography sx={{ minWidth: 0, color: adminPalette.textPrimary, fontSize: '0.68rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          X post
        </Typography>
      </Stack>
      <Typography sx={{ color: adminPalette.textPrimary, fontSize: '0.68rem', fontWeight: 700, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {caption || title || 'No text preview'}
      </Typography>
      <Typography sx={{ color: adminPalette.textMuted, fontSize: '0.61rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {sourcePostId || 'x.com'}
      </Typography>
    </Stack>
  );
}

export default function ContentRecordingWorkspace({
  recordings,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  overview,
  tags,
  currentSearch,
  currentPlatform,
  currentContentType,
  currentTagIds,
  currentSortBy,
  currentSortDir,
  initialLoadError,
}: WorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeDownloadId, startContentRecordingDownload } = useDownloadManager();
  const [form, setForm] = useState<ContentRecordingFormState>(() => createEmptyForm());
  const [selectedTags, setSelectedTags] = useState<TagOption[]>([]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>(tags);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContentRecording | null>(null);
  const [flash, setFlash] = useState<FlashState>(
    initialLoadError ? { severity: 'warning', message: initialLoadError } : null,
  );
  const [filters, setFilters] = useState({
    search: currentSearch,
    platform: currentPlatform,
    contentType: currentContentType,
    tagIds: currentTagIds,
  });
  const [lastScrapedLink, setLastScrapedLink] = useState('');
  const [isScraping, startScrapeTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const isBusy = isScraping || isSaving || isDeleting;
  const activeFilterCount = [currentSearch, currentPlatform, currentContentType].filter(Boolean).length + currentTagIds.length;
  const selectedFilterTags = useMemo(
    () => tagOptions.filter((tag) => filters.tagIds.includes(tag.id)),
    [filters.tagIds, tagOptions],
  );

  useEffect(() => {
    setTagOptions(tags);
  }, [tags]);

  useEffect(() => {
    setFilters({
      search: currentSearch,
      platform: currentPlatform,
      contentType: currentContentType,
      tagIds: currentTagIds,
    });
  }, [currentContentType, currentPlatform, currentSearch, currentTagIds]);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (
        filters.search === currentSearch &&
        filters.platform === currentPlatform &&
        filters.contentType === currentContentType &&
        filters.tagIds.join(',') === currentTagIds.join(',')
      ) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      setOptionalParam(params, 'search', filters.search.trim());
      setOptionalParam(params, 'platform', filters.platform);
      setOptionalParam(params, 'contentType', filters.contentType);
      setOptionalParam(params, 'tagIds', filters.tagIds.join(','));
      params.delete('tagId');
      params.set('page', '1');
      router.replace(toUrl(pathname, params));
    }, 300);

    return () => clearTimeout(delay);
  }, [currentContentType, currentPlatform, currentSearch, currentTagIds, filters, pathname, router, searchParams]);

  function updateQuery(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    router.replace(toUrl(pathname, params));
  }

  function setField<K extends keyof ContentRecordingFormState>(key: K, value: ContentRecordingFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function syncTags(nextTags: TagOption[]) {
    const normalized = Array.from(
      new Map(
        nextTags
          .map(normalizeTagOption)
          .filter((tag) => tag.name.trim())
          .map((tag) => [tag.isNew ? `new:${tag.name.toLowerCase()}` : tag.id, tag] as const),
      ).values(),
    );

    setSelectedTags(normalized);
    setForm((current) => ({
      ...current,
      tag_ids: normalized.filter((tag) => !tag.isNew).map((tag) => tag.id),
      new_tag_names: normalized.filter((tag) => tag.isNew).map((tag) => tag.name),
    }));
  }

  function openAddDrawer() {
    setForm(createEmptyForm());
    setSelectedTags([]);
    setLastScrapedLink('');
    setDrawerOpen(true);
  }

  function openEditDrawer(record: ContentRecording) {
    setForm(toForm(record));
    setSelectedTags(record.tags);
    setLastScrapedLink(record.link);
    setDrawerOpen(true);
  }

  function applyScrapedData(data: Partial<ContentRecordingFormState>) {
    setForm((current) => ({
      ...current,
      title: current.title || data.title || '',
      platform: data.platform || current.platform,
      caption: current.caption || data.caption || '',
      description: current.description || data.description || '',
      content_type: current.content_type || data.content_type || '',
      upload_date: current.upload_date || data.upload_date || '',
      link: current.link || data.link || '',
      source_post_id: current.source_post_id || data.source_post_id || '',
      thumbnail_url: current.thumbnail_url || data.thumbnail_url || '',
      media_urls: current.media_urls.length ? current.media_urls : normalizeMediaUrls(data.media_urls || []),
    }));
  }

  function hydrateFromLink(rawLink: string) {
    const link = rawLink.trim();
    if (!link || link === lastScrapedLink) {
      return;
    }

    setFlash({ severity: 'info', message: 'Mengambil metadata dari link konten...' });

    startScrapeTransition(async () => {
      const result = await scrapeContentRecordingAction(link);

      if (!result.success || !result.data) {
        setFlash({ severity: 'error', message: result.error || 'Gagal mengambil metadata dari link.' });
        return;
      }

      applyScrapedData(result.data);
      setLastScrapedLink(link);
      setFlash({
        severity: result.data.upload_date ? 'success' : 'warning',
        message: result.data.upload_date
          ? 'Metadata imported. Please review before saving.'
          : 'Some metadata could not be found. Complete the missing fields manually.',
      });
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedLink = event.clipboardData.getData('text').trim();
    if (!pastedLink) {
      return;
    }

    event.preventDefault();
    setForm((current) => ({ ...current, link: pastedLink }));
    void Promise.resolve().then(() => hydrateFromLink(pastedLink));
  }

  function handleSubmit() {
    setFlash(null);

    startSaveTransition(async () => {
      const result = await saveContentRecordingAction(form);

      if (!result.success || !result.record) {
        setFlash({ severity: 'error', message: result.error || 'Gagal menyimpan content record.' });
        return;
      }

      setTagOptions((current) => {
        const byId = new Map(current.map((tag) => [tag.id, tag]));
        result.record?.tags.forEach((tag) => byId.set(tag.id, tag));
        return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
      });
      setDrawerOpen(false);
      setForm(createEmptyForm());
      setSelectedTags([]);
      setFlash({ severity: 'success', message: 'Content record berhasil disimpan.' });
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    const record = deleteTarget;
    setFlash(null);

    startDeleteTransition(async () => {
      const result = await deleteContentRecordingAction(record.id);

      if (!result.success) {
        setFlash({ severity: 'error', message: result.error || 'Gagal menghapus content record.' });
        return;
      }

      setDeleteTarget(null);
      setDrawerOpen(false);
      setFlash({ severity: 'success', message: `Content record "${record.title || record.link}" berhasil dihapus.` });
      router.refresh();
    });
  }

  function handleSortChange(sortBy: ContentRecordingSortKey) {
    updateQuery((params) => {
      const nextSortDir = currentSortBy === sortBy && currentSortDir === 'asc' ? 'desc' : 'asc';
      params.set('sortBy', sortBy);
      params.set('sortDir', nextSortDir);
      params.set('page', '1');
    });
  }

  function clearFilters() {
    setFilters({ search: '', platform: '', contentType: '', tagIds: [] });
    updateQuery((params) => {
      params.delete('search');
      params.delete('platform');
      params.delete('contentType');
      params.delete('tagIds');
      params.delete('tagId');
      params.set('page', '1');
    });
  }

  return (
    <Stack spacing={1.25}>
      {flash ? <Alert severity={flash.severity}>{flash.message}</Alert> : null}

      <Paper elevation={0} sx={adminPanelSx}>
        <Stack spacing={1.25} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }}>
            <Box>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>
                Content Library
              </Typography>
              <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
                Content Library
              </Typography>
              <Typography sx={{ mt: 0.55, fontSize: '0.8rem', color: adminPalette.textMuted }}>
                Kelola arsip konten yang sudah dipublikasikan dari berbagai kanal dalam satu tempat.
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', lg: 'auto' } }}>
              <Button component={Link} href="/scrape" variant="outlined" startIcon={<UploadFileRoundedIcon />} sx={{ minHeight: 36, borderRadius: 2, borderColor: adminPalette.borderStrong, color: adminPalette.textSecondary, textTransform: 'none', fontWeight: 700 }}>
                Import from Channel
              </Button>
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openAddDrawer} sx={{ minHeight: 36, borderRadius: 2, backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
                Add Content
              </Button>
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
            <MetricTile label="Total records" value={overview.totalRecords} />
            <MetricTile label="Platforms" value={overview.platformCount} />
            <MetricTile label="This month" value={overview.thisMonthCount} />
            <MetricTile label="Untagged" value={overview.untaggedCount} />
          </Stack>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={adminPanelSx}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ xs: 'stretch', lg: 'center' }} sx={{ p: { xs: 1.5, md: 2 } }}>
          <TextField
            size="small"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search nomor, title, caption, link, or source ID"
            sx={{ flex: 1, minWidth: { lg: 280 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: adminPalette.textMuted }} /></InputAdornment> }}
          />
          <TextField select size="small" label="Platform" value={filters.platform} onChange={(event) => setFilters((current) => ({ ...current, platform: event.target.value }))} sx={{ minWidth: { xs: '100%', sm: 170 } }}>
            <MenuItem value="">All platforms</MenuItem>
            {PLATFORM_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Content type" value={filters.contentType} onChange={(event) => setFilters((current) => ({ ...current, contentType: event.target.value }))} sx={{ minWidth: { xs: '100%', sm: 170 } }}>
            <MenuItem value="">All types</MenuItem>
            {CONTENT_TYPE_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple
            size="small"
            options={tagOptions}
            value={selectedFilterTags}
            onChange={(_, value) => setFilters((current) => ({ ...current, tagIds: value.map((tag) => tag.id) }))}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            filterSelectedOptions
            sx={{ minWidth: { xs: '100%', sm: 300 }, flex: { lg: '0 1 360px' } }}
            renderInput={(params) => <TextField {...params} label="Tag" placeholder="All tags" />}
            renderTags={(value, getTagProps) => value.map((option, index) => {
              const { key, ...tagProps } = getTagProps({ index });
              return <Chip key={key} label={option.name} size="small" sx={CONTENT_TAG_SX} {...tagProps} />;
            })}
          />
          {activeFilterCount > 0 ? <Button onClick={clearFilters} sx={{ color: adminPalette.textSecondary, textTransform: 'none', fontWeight: 700 }}>Clear filters</Button> : null}
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ ...adminPanelSx, overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>Content Library</Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>{totalCount} records total, page {currentPage} of {totalPages}</Typography>
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1360 }}>
            <TableHead sx={{ backgroundColor: adminPalette.brand }}>
              <TableRow>
                <TableCell align="center" sx={{ width: 72, color: '#ffffff', fontWeight: 800 }}>No</TableCell>
                <TableCell sx={{ width: 132, color: '#ffffff', fontWeight: 800 }}>Preview</TableCell>
                {(['title', 'platform', 'content_type', 'upload_date'] as ContentRecordingSortKey[]).map((sortKey) => (
                  <TableCell key={sortKey} sx={{ color: '#ffffff', fontWeight: 800 }}>
                    <TableSortLabel active={currentSortBy === sortKey} direction={currentSortBy === sortKey ? currentSortDir : 'asc'} onClick={() => handleSortChange(sortKey)} sx={adminTableSortLabelSx}>
                      {SORT_LABELS[sortKey]}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>
                  <TableSortLabel active={currentSortBy === 'created_at'} direction={currentSortBy === 'created_at' ? currentSortDir : 'asc'} onClick={() => handleSortChange('created_at')} sx={adminTableSortLabelSx}>
                    {SORT_LABELS.created_at}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Tags</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Metadata</TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recordings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{totalCount === 0 ? 'Belum ada konten yang tercatat.' : 'Tidak ada konten yang cocok.'}</Typography>
                    <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>{totalCount === 0 ? 'Tambahkan konten manual atau import dari workflow channel.' : 'Coba ubah pencarian atau hapus filter aktif.'}</Typography>
                  </TableCell>
                </TableRow>
              ) : recordings.map((record, index) => {
                const hiddenTags = record.tags.slice(VISIBLE_TAG_LIMIT);
                const previewUrls = getPreviewUrls(record);
                const instagramEmbedUrl = record.platform === 'Instagram' ? getInstagramEmbedUrl(record.link) : '';
                const xEmbedUrl = record.platform === 'x' ? getXEmbedUrl(record.link) : '';
                const frontendDisplayId = ((currentPage - 1) * pageSize) + index + 1;

                return (
                  <TableRow key={record.id} hover>
                    <TableCell align="center">
                      <Typography
                        title={`Content nomor ${frontendDisplayId}`}
                        sx={{
                          color: adminPalette.textSecondary,
                          fontFamily: 'var(--font-geist-mono), monospace',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                        }}
                      >
                        {frontendDisplayId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ ...PREVIEW_FRAME_SX, width: 104, height: 132, p: previewUrls.length ? 0.5 : instagramEmbedUrl || xEmbedUrl ? 0 : 0.5 }}>
                        {previewUrls.length ? (
                          <PreviewCarousel urls={previewUrls} alt={record.title || 'Content preview'} emptyLabel="" />
                        ) : instagramEmbedUrl ? (
                          <InstagramEmbedPreview link={record.link} compact />
                        ) : xEmbedUrl ? (
                          <XPostFallbackPreview title={record.title} caption={record.caption} sourcePostId={record.source_post_id} />
                        ) : (
                          <ImageNotSupportedRoundedIcon sx={{ color: adminPalette.textSubtle }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 330 }}>
                      <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{record.title}</Typography>
                      <Typography sx={{ mt: 0.4, color: adminPalette.textSecondary, fontSize: '0.78rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{record.caption || record.description || 'No caption recorded yet.'}</Typography>
                      <Typography component={Link} href={record.link} target="_blank" rel="noopener noreferrer" sx={{ mt: 0.4, display: 'block', color: adminPalette.textMuted, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.76rem', '&:hover': { color: adminPalette.brand } }}>{record.source_post_id ? `${record.source_post_id} - ` : ''}{record.link}</Typography>
                    </TableCell>
                    <TableCell><Chip size="small" label={formatPlatformLabel(record.platform)} sx={{ fontWeight: 700, color: adminPalette.brand, backgroundColor: adminPalette.brandSoft }} /></TableCell>
                    <TableCell><Chip size="small" label={formatContentTypeLabel(record.content_type)} variant="outlined" sx={{ fontWeight: 700, borderColor: adminPalette.border }} /></TableCell>
                    <TableCell sx={{ color: adminPalette.textSecondary, fontWeight: 700 }}>{formatDateLabel(record.upload_date)}</TableCell>
                    <TableCell sx={{ color: adminPalette.textSecondary, fontWeight: 700 }}>{formatDateLabel(record.created_at)}</TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                        {record.tags.length ? record.tags.slice(0, VISIBLE_TAG_LIMIT).map((tag) => <Chip key={tag.id} size="small" label={tag.name} sx={CONTENT_TAG_SX} />) : <Chip size="small" label="Untagged" sx={{ color: adminPalette.warningText, backgroundColor: adminPalette.warningBg }} />}
                        {hiddenTags.length ? (
                          <Tooltip
                            title={
                              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                                {hiddenTags.map((tag) => <Chip key={tag.id} size="small" label={tag.name} sx={CONTENT_TAG_SX} />)}
                              </Stack>
                            }
                            placement="top"
                            arrow
                            slotProps={CONTENT_TAG_TOOLTIP_SLOT_PROPS}
                          >
                            <Chip size="small" label={`+${hiddenTags.length}`} variant="outlined" sx={{ height: 22, borderRadius: 1.75, borderColor: adminPalette.borderStrong, color: adminPalette.textMuted, fontSize: '0.71rem', fontWeight: 700 }} />
                          </Tooltip>
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                        {!record.caption ? <Chip size="small" label="No caption" sx={{ color: adminPalette.warningText, backgroundColor: adminPalette.warningBg }} /> : null}
                        {record.platform !== 'x' && !previewUrls.length && !instagramEmbedUrl && !xEmbedUrl ? <Chip size="small" label="No thumbnail" sx={{ color: adminPalette.warningText, backgroundColor: adminPalette.warningBg }} /> : null}
                        {previewUrls.length > 1 ? <Chip size="small" label={`${previewUrls.length} media`} sx={{ color: adminPalette.brandDark, backgroundColor: adminPalette.brandSoft }} /> : null}
                        {record.caption && (record.platform === 'x' || previewUrls.length || instagramEmbedUrl) ? <Chip size="small" label="Complete" sx={{ color: adminPalette.successText, backgroundColor: adminPalette.successBg }} /> : null}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                        <IconButton component={Link} href={record.link} target="_blank" rel="noopener noreferrer" size="small"><OpenInNewRoundedIcon fontSize="small" /></IconButton>
                        {isDownloadableRecord(record) ? (
                          <Tooltip title={record.platform === 'youtube' ? 'Download YouTube video' : record.platform === 'x' ? 'Download X media' : 'Download Instagram media'} placement="top" arrow>
                            <IconButton
                              size="small"
                              onClick={() => {
                                void startContentRecordingDownload({
                                  id: record.id,
                                });
                              }}
                              disabled={Boolean(activeDownloadId)}
                            >
                              <DownloadRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        <IconButton size="small" onClick={() => openEditDrawer(record)}><EditRoundedIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(record)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
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
          count={totalCount}
          page={Math.max(0, currentPage - 1)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onPageChange={(_, nextPage) => updateQuery((params) => params.set('page', String(nextPage + 1)))}
          onRowsPerPageChange={(event) => updateQuery((params) => {
            params.set('pageSize', event.target.value);
            params.set('page', '1');
          })}
        />
      </Paper>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { width: { xs: '100%', sm: 560 }, backgroundColor: adminPalette.canvas, borderLeft: `1px solid ${adminPalette.border}` } }}>
        <Stack sx={{ minHeight: '100%' }}>
          <Stack spacing={1.5} sx={{ px: 2.5, py: 2.25, borderBottom: `1px solid ${adminPalette.border}` }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>{form.id ? 'Edit Content' : 'Add Content'}</Typography>
                <Typography sx={{ mt: 0.7, fontSize: '1.45rem', fontWeight: 700, color: adminPalette.textPrimary }}>{form.id ? 'Edit content record' : 'Add content record'}</Typography>
              </Box>
              <IconButton onClick={() => setDrawerOpen(false)} size="small"><CloseRoundedIcon fontSize="small" /></IconButton>
            </Stack>
          </Stack>

          <Stack spacing={2.2} sx={{ p: 2.5, flex: 1, overflowY: 'auto' }}>
            <Stack spacing={1.4}>
              <SectionLabel>Source details</SectionLabel>
              <TextField label="Link" value={form.link} onChange={(event) => { setField('link', event.target.value); setLastScrapedLink(''); }} onBlur={(event) => hydrateFromLink(event.target.value)} onPaste={handlePaste} helperText="Paste a published content URL to auto-fill available metadata." fullWidth disabled={isBusy} InputProps={{ startAdornment: <InputAdornment position="start"><LinkRoundedIcon sx={{ color: adminPalette.textMuted }} /></InputAdornment> }} />
              <Button variant="outlined" startIcon={<AutoFixHighRoundedIcon />} onClick={() => hydrateFromLink(form.link)} disabled={isBusy || !form.link.trim()} sx={{ alignSelf: 'flex-start', borderRadius: 2, textTransform: 'none', fontWeight: 700 }}>{isScraping ? 'Importing metadata...' : 'Auto-fill from link'}</Button>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
                <TextField select label="Platform" value={form.platform} onChange={(event) => setField('platform', event.target.value as ContentRecordingFormState['platform'])} fullWidth disabled={isBusy}>{PLATFORM_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</TextField>
                <TextField select label="Content type" value={form.content_type} onChange={(event) => setField('content_type', event.target.value as ContentRecordingFormState['content_type'])} fullWidth disabled={isBusy}><MenuItem value="">Unspecified</MenuItem>{CONTENT_TYPE_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</TextField>
              </Stack>
            </Stack>

            <Stack spacing={1.4}>
              <SectionLabel>Metadata</SectionLabel>
              <TextField
                label="Title (optional)"
                value={form.title}
                onChange={(event) => setField('title', event.target.value)}
                helperText="Optional internal label for easier browsing."
                fullWidth
                disabled={isBusy}
              />
              <TextField label="Caption" value={form.caption} onChange={(event) => setField('caption', event.target.value)} helperText="Original caption or post text from the source platform." minRows={4} multiline fullWidth disabled={isBusy} />
              <TextField label="Upload/publication date" type="date" value={form.upload_date} onChange={(event) => setField('upload_date', event.target.value)} fullWidth disabled={isBusy} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Source post ID" value={form.source_post_id} onChange={(event) => setField('source_post_id', event.target.value)} fullWidth disabled={isBusy} />
            </Stack>

            <Stack spacing={1.4}>
              <SectionLabel>Preview</SectionLabel>
              <TextField label="Thumbnail URL" value={form.thumbnail_url} onChange={(event) => setField('thumbnail_url', event.target.value)} fullWidth disabled={isBusy} />
              <Box sx={{ ...PREVIEW_FRAME_SX, height: form.platform === 'Instagram' && getInstagramEmbedUrl(form.link) ? 420 : form.platform === 'x' && getXEmbedUrl(form.link) && !getPreviewUrls(form).length ? 360 : 180, borderRadius: 2, backgroundColor: adminPalette.surface, p: ((form.platform === 'Instagram' && getInstagramEmbedUrl(form.link)) || (form.platform === 'x' && getXEmbedUrl(form.link))) && !getPreviewUrls(form).length ? 0 : 0.5 }}>
                {form.platform === 'Instagram' && getInstagramEmbedUrl(form.link) ? (
                  <InstagramEmbedPreview link={form.link} />
                ) : getPreviewUrls(form).length ? (
                  <PreviewCarousel urls={getPreviewUrls(form)} alt={form.title || 'Thumbnail preview'} />
                ) : form.platform === 'x' && getXEmbedUrl(form.link) ? (
                  <XEmbedPreview link={form.link} />
                ) : (
                  <PreviewCarousel urls={getPreviewUrls(form)} alt={form.title || 'Thumbnail preview'} />
                )}
              </Box>
            </Stack>

            <Stack spacing={1.4}>
              <SectionLabel>Organization</SectionLabel>
              <Autocomplete
                multiple
                freeSolo
                options={tagOptions}
                value={selectedTags}
                filterSelectedOptions
                filterOptions={(options, params) => {
                  const filtered = tagFilter(options, params);
                  const input = params.inputValue.replace(/\s+/g, ' ').trim();
                  const exists = options.some((option) => option.name.toLowerCase() === input.toLowerCase());
                  if (input && !exists) {
                    filtered.push({ id: `new:${input.toLowerCase()}`, name: `Add "${input}"`, inputValue: input, isNew: true });
                  }
                  return filtered;
                }}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                onChange={(_, value) => syncTags(value.map(normalizeTagOption))}
                renderOption={(props, option) => <Box component="li" {...props}>{option.inputValue ? `Add "${option.inputValue}"` : option.name}</Box>}
                renderInput={(params) => <TextField {...params} label="Tags" helperText="Select existing tags or type a new tag name and choose Add." />}
                renderTags={(value, getTagProps) => value.map((option, index) => {
                  const { key, ...tagProps } = getTagProps({ index });
                  return <Chip key={key} label={option.inputValue || option.name} {...tagProps} />;
                })}
                disabled={isBusy}
              />
              <TextField label="Internal description" value={form.description} onChange={(event) => setField('description', event.target.value)} helperText="Internal notes for the team. Not copied from the platform." minRows={3} multiline fullWidth disabled={isBusy} />
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ p: 2.5, borderTop: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface }}>
            {form.id ? <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => setDeleteTarget(recordings.find((item) => item.id === form.id) || null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Delete</Button> : <Box />}
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setDrawerOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
              <Button variant="contained" onClick={handleSubmit} disabled={isBusy} sx={{ backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>{isSaving ? 'Saving...' : 'Save'}</Button>
            </Stack>
          </Stack>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Delete content record?</DialogTitle>
        <DialogContent><Typography sx={{ color: adminPalette.textSecondary }}>{`This will remove "${deleteTarget?.title || ''}" from the content library. The original platform post will not be affected.`}</Typography></DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={isDeleting} sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>{isDeleting ? 'Deleting...' : 'Delete'}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
