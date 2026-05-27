'use client';

import type { DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
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
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
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
} from '../../lib/adminPalette';
import type { ContentAsset, ContentAssetProject, ContentTag } from '../../lib/types';
import {
  deleteContentAssetAction,
  saveContentAssetTagsAction,
  type ContentAssetTagFormState,
} from '../actions';

interface ContentAssetDetailWorkspaceProps {
  project: ContentAssetProject;
  assets: ContentAsset[];
  tags: ContentTag[];
  currentSearch: string;
  currentContentType: string;
  currentTagIds: string[];
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

const CONTENT_TAG_SX = {
  height: 22,
  borderRadius: 1.75,
  backgroundColor: adminPalette.brandSoft,
  color: adminPalette.brandDark,
  border: `1px solid ${adminPalette.brandSoftStrong}`,
  fontSize: '0.71rem',
  fontWeight: 600,
} as const;
const VISIBLE_TAG_LIMIT = 2;
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
const tagFilter = createFilterOptions<TagOption>();
const EMPTY_ASSET_FORM: ContentAssetTagFormState = { id: '', original_filename: '', notes: '', tag_ids: [], new_tag_names: [] };

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

function normalizeTagOption(value: TagOption | string): TagOption {
  if (typeof value === 'string') {
    return { id: `new:${value.toLowerCase()}`, name: value, inputValue: value, isNew: true };
  }
  if (value.inputValue) {
    return { ...value, name: value.inputValue, isNew: true };
  }
  return value;
}

function TagChips({ tags }: { tags: ContentTag[] }) {
  const hiddenTags = tags.slice(VISIBLE_TAG_LIMIT);

  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
      {tags.length ? tags.slice(0, VISIBLE_TAG_LIMIT).map((tag) => <Chip key={tag.id} size="small" label={tag.name} sx={CONTENT_TAG_SX} />) : <Chip size="small" label="Untagged" sx={{ color: adminPalette.warningText, backgroundColor: adminPalette.warningBg }} />}
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
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '-';
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getFileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatSelectedFiles(files: readonly File[]): string {
  if (!files.length) {
    return 'Belum ada file dipilih';
  }

  return `${files.length} file siap upload`;
}

function MetricTile({ label, value }: { label: string; value: number | string }) {
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

function AssetPreview({ asset }: { asset: ContentAsset }) {
  const isVideo = asset.mime_type.startsWith('video/');
  const previewUrl = `/api/admin/content-assets/${asset.id}/download`;

  if (!asset.storage_path) {
    return (
      <Box sx={{ aspectRatio: '16 / 10', backgroundColor: adminPalette.surfaceSoft }} />
    );
  }

  return isVideo ? (
    <Box component="video" src={previewUrl} muted controls sx={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block', backgroundColor: '#000000' }} />
  ) : (
    <Box component="img" src={previewUrl} alt={asset.original_filename} sx={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block', backgroundColor: adminPalette.surfaceSoft }} />
  );
}

export default function ContentAssetDetailWorkspace({
  project,
  assets,
  tags,
  currentSearch,
  currentContentType,
  currentTagIds,
  initialLoadError,
}: ContentAssetDetailWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [flash, setFlash] = useState<FlashState>(
    initialLoadError ? { severity: 'warning', message: initialLoadError } : null,
  );
  const [tagOptions, setTagOptions] = useState<TagOption[]>(tags);
  const [filters, setFilters] = useState({ search: currentSearch, contentType: currentContentType, tagIds: currentTagIds });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContentAsset | null>(null);
  const [editAssetTarget, setEditAssetTarget] = useState<ContentAsset | null>(null);
  const [editAssetForm, setEditAssetForm] = useState<ContentAssetTagFormState>(EMPTY_ASSET_FORM);
  const [selectedAssetTags, setSelectedAssetTags] = useState<TagOption[]>([]);
  const [isUploading, startUploadTransition] = useTransition();
  const [isSavingAsset, startSaveAssetTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const imageCount = assets.filter((asset) => asset.mime_type.startsWith('image/')).length;
  const videoCount = assets.filter((asset) => asset.mime_type.startsWith('video/')).length;
  const totalSize = assets.reduce((total, asset) => total + asset.file_size, 0);
  const selectedFilterTags = useMemo(
    () => tagOptions.filter((tag) => filters.tagIds.includes(tag.id)),
    [filters.tagIds, tagOptions],
  );

  useEffect(() => {
    setTagOptions(tags);
  }, [tags]);

  useEffect(() => {
    setFilters({ search: currentSearch, contentType: currentContentType, tagIds: currentTagIds });
  }, [currentContentType, currentSearch, currentTagIds]);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (
        filters.search === currentSearch &&
        filters.contentType === currentContentType &&
        filters.tagIds.join(',') === currentTagIds.join(',')
      ) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      setOptionalParam(params, 'search', filters.search.trim());
      setOptionalParam(params, 'contentType', filters.contentType);
      setOptionalParam(params, 'tagIds', filters.tagIds.join(','));
      params.delete('tagId');
      router.replace(toUrl(pathname, params));
    }, 300);

    return () => clearTimeout(delay);
  }, [currentContentType, currentSearch, currentTagIds, filters, pathname, router, searchParams]);

  function syncAssetTags(nextTags: TagOption[]) {
    const normalized = Array.from(
      new Map(
        nextTags
          .map(normalizeTagOption)
          .filter((tag) => tag.name.trim())
          .map((tag) => [tag.isNew ? `new:${tag.name.toLowerCase()}` : tag.id, tag] as const),
      ).values(),
    );

    setSelectedAssetTags(normalized);
    setEditAssetForm((current) => ({
      ...current,
      tag_ids: normalized.filter((tag) => !tag.isNew).map((tag) => tag.id),
      new_tag_names: normalized.filter((tag) => tag.isNew).map((tag) => tag.name),
    }));
  }

  function syncFileInput(files: readonly File[]) {
    if (!fileInputRef.current) {
      return;
    }

    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    fileInputRef.current.files = dataTransfer.files;
  }

  function updateSelectedFiles(files: File[]) {
    setSelectedFiles(files);
    syncFileInput(files);
  }

  function handleFileSelection(files: FileList | null) {
    const incomingFiles = Array.from(files || []);
    if (!incomingFiles.length) {
      syncFileInput(selectedFiles);
      return;
    }

    const selectedFileKeys = new Set(selectedFiles.map(getFileKey));
    const nextFiles = [...selectedFiles];

    incomingFiles.forEach((file) => {
      const fileKey = getFileKey(file);
      if (!selectedFileKeys.has(fileKey)) {
        selectedFileKeys.add(fileKey);
        nextFiles.push(file);
      }
    });

    updateSelectedFiles(nextFiles);
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropActive(false);
    if (isUploading) {
      return;
    }

    handleFileSelection(event.dataTransfer.files);
  }

  function removeSelectedFile(file: File) {
    updateSelectedFiles(selectedFiles.filter((candidate) => getFileKey(candidate) !== getFileKey(file)));
  }

  function clearSelectedFiles() {
    updateSelectedFiles([]);
  }

  function openEditAsset(asset: ContentAsset) {
    setEditAssetTarget(asset);
    setSelectedAssetTags(asset.tags);
    setEditAssetForm({
      id: asset.id,
      original_filename: asset.original_filename,
      notes: asset.notes || '',
      tag_ids: asset.tags.map((tag) => tag.id),
      new_tag_names: [],
    });
  }

  function handleUpload(formData: FormData) {
    setFlash(null);
    startUploadTransition(async () => {
      try {
        const response = await fetch('/api/admin/content-assets/upload', {
          method: 'POST',
          body: formData,
        });
        const result = (await response.json().catch(() => null)) as { success?: boolean; count?: number; error?: string } | null;

        if (response.ok && result?.success) {
          formRef.current?.reset();
          updateSelectedFiles([]);
          setFlash({ severity: 'success', message: `${result.count ?? 0} asset berhasil diupload.` });
          router.refresh();
        } else {
          setFlash({ severity: 'error', message: result?.error || 'Gagal upload asset. Coba lagi beberapa saat.' });
        }
      } catch (error) {
        setFlash({
          severity: 'error',
          message: error instanceof Error
            ? `Gagal menghubungi backend upload: ${error.message}`
            : 'Gagal menghubungi backend upload. Coba lagi beberapa saat.',
        });
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    const targetId = deleteTarget.id;
    startDeleteTransition(async () => {
      const result = await deleteContentAssetAction(targetId);
      setDeleteTarget(null);
      setFlash(
        result.success
          ? { severity: 'success', message: 'Asset berhasil dihapus.' }
          : { severity: 'error', message: result.error || 'Gagal menghapus asset.' },
      );
      if (result.success) {
        router.refresh();
      }
    });
  }

  function handleSaveAsset() {
    startSaveAssetTransition(async () => {
      const result = await saveContentAssetTagsAction(editAssetForm);

      if (!result.success || !result.asset) {
        setFlash({ severity: 'error', message: result.error || 'Gagal menyimpan asset.' });
        return;
      }

      setTagOptions((current) => {
        const byId = new Map(current.map((tag) => [tag.id, tag]));
        result.asset?.tags.forEach((tag) => byId.set(tag.id, tag));
        return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
      });
      setEditAssetTarget(null);
      setFlash({ severity: 'success', message: 'Asset berhasil disimpan.' });
      router.refresh();
    });
  }

  function clearFilters() {
    setFilters({ search: '', contentType: '', tagIds: [] });
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    params.delete('contentType');
    params.delete('tagIds');
    params.delete('tagId');
    router.replace(toUrl(pathname, params));
  }

  return (
    <Stack spacing={1.25}>
      {flash ? <Alert severity={flash.severity} onClose={() => setFlash(null)}>{flash.message}</Alert> : null}

      <Paper elevation={0} sx={adminPanelSx}>
        <Stack spacing={1.25} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }}>
            <Box>
              <Button component={Link} href="/content-assets" startIcon={<ArrowBackRoundedIcon />} sx={{ mb: 1, px: 0, alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700 }}>
                Back to projects
              </Button>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>
                Asset Drafting
              </Typography>
              <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
                {project.project_name}
              </Typography>
              <Typography sx={{ mt: 0.55, fontSize: '0.8rem', color: adminPalette.textMuted }}>
                Upload dan preview kumpulan asset image/video untuk project ini.
              </Typography>
            </Box>
            <Button
              component="a"
              href={assets.length ? `/api/admin/content-assets/projects/${project.id}/download` : undefined}
              variant="outlined"
              startIcon={<ArchiveRoundedIcon />}
              disabled={assets.length === 0}
              sx={{ alignSelf: { xs: 'flex-start', lg: 'center' }, minHeight: 36, borderRadius: 2, textTransform: 'none', fontWeight: 700, borderColor: adminPalette.borderStrong, color: adminPalette.textSecondary }}
            >
              Download ZIP
            </Button>
          </Stack>

          <Stack direction="row" spacing={{ xs: 1, sm: 0.5 }} useFlexGap flexWrap="wrap">
            <MetricTile label="Assets" value={assets.length} />
            <MetricTile label="Images" value={imageCount} />
            <MetricTile label="Videos" value={videoCount} />
            <MetricTile label="Size" value={formatBytes(totalSize)} />
          </Stack>

          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            <TagChips tags={project.tags} />
          </Stack>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={adminPanelSx}>
        <Box component="form" ref={formRef} action={handleUpload} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Box component="input" type="hidden" name="project_id" value={project.id} />
          <Stack spacing={1.25}>
            <Box
              onDragEnter={(event) => {
                event.preventDefault();
                if (!isUploading) {
                  setDropActive(true);
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return;
                }
                setDropActive(false);
              }}
              onDrop={handleFileDrop}
              sx={{
                p: { xs: 1.4, md: 1.8 },
                borderRadius: 2.5,
                border: `1.5px dashed ${dropActive ? adminPalette.brand : adminPalette.borderStrong}`,
                backgroundColor: dropActive ? adminPalette.brandSoft : adminPalette.surface,
                transition: 'border-color 160ms ease, background-color 160ms ease',
              }}
            >
              <Stack spacing={0.7} alignItems="center" textAlign="center">
                <UploadFileRoundedIcon sx={{ color: adminPalette.brand, fontSize: 32 }} />
                <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Drag & drop file image/video ke sini</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textSecondary }}>
                  Bisa drop beberapa file sekaligus, atau pakai tombol tambah file di bawah.
                </Typography>
              </Stack>
            </Box>

            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', lg: 'flex-start' }}>
              <Button
                component="label"
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                sx={{ minHeight: 40, borderRadius: 2, textTransform: 'none', fontWeight: 700, borderColor: adminPalette.borderStrong, color: adminPalette.textSecondary }}
                disabled={isUploading}
              >
                Tambah file
                <Box
                  component="input"
                  name="asset_files"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  ref={fileInputRef}
                  onChange={(event) => handleFileSelection(event.target.files)}
                  sx={{ display: 'none' }}
                />
              </Button>
              <TextField name="notes" label="Notes upload" size="small" multiline minRows={1} sx={{ flex: 1 }} disabled={isUploading} />
              <Button type="submit" variant="contained" startIcon={<UploadFileRoundedIcon />} disabled={isUploading || selectedFiles.length === 0} sx={{ minHeight: 40, borderRadius: 2, backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
                {isUploading ? 'Uploading...' : 'Upload Asset'}
              </Button>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Typography sx={{ fontSize: '0.84rem', color: selectedFiles.length ? adminPalette.textSecondary : adminPalette.textMuted, fontWeight: 700 }}>
                {formatSelectedFiles(selectedFiles)}
              </Typography>
              {selectedFiles.length ? (
                <Button size="small" onClick={clearSelectedFiles} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, textTransform: 'none', fontWeight: 700 }}>
                  Clear
                </Button>
              ) : null}
            </Stack>

            {selectedFiles.length ? (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {selectedFiles.map((file) => (
                  <Chip
                    key={getFileKey(file)}
                    label={`${file.name} (${formatBytes(file.size)})`}
                    onDelete={() => removeSelectedFile(file)}
                    deleteIcon={<CloseRoundedIcon />}
                    sx={{ maxWidth: { xs: '100%', sm: 360 }, borderColor: adminPalette.border, fontWeight: 700 }}
                    variant="outlined"
                  />
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Box>
      </Paper>

      <Paper elevation={0} sx={adminPanelSx}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ xs: 'stretch', lg: 'center' }} sx={{ p: { xs: 1.5, md: 2 } }}>
          <TextField
            size="small"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search file, uploader, notes, or tag"
            sx={{ flex: 1, minWidth: { lg: 280 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: adminPalette.textMuted }} /></InputAdornment> }}
          />
          <TextField select size="small" label="Content type" value={filters.contentType} onChange={(event) => setFilters((current) => ({ ...current, contentType: event.target.value }))} sx={{ minWidth: { xs: '100%', sm: 180 } }}>
            <MenuItem value="">All assets</MenuItem>
            <MenuItem value="image">Image</MenuItem>
            <MenuItem value="video">Video</MenuItem>
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
          {[currentSearch, currentContentType].filter(Boolean).length + currentTagIds.length > 0 ? <Button onClick={clearFilters} sx={{ color: adminPalette.textSecondary, textTransform: 'none', fontWeight: 700 }}>Clear filters</Button> : null}
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ ...adminPanelSx, overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>Uploaded Assets</Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>Preview asset yang sudah tersimpan untuk project ini.</Typography>
        </Box>

        {assets.length === 0 ? (
          <Box sx={{ py: 6, px: 2, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Belum ada asset di project ini.</Typography>
            <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>Gunakan tombol tambah file untuk memilih beberapa file, lalu upload.</Typography>
          </Box>
        ) : (
          <Box sx={{ p: { xs: 1.5, md: 2 }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
            {assets.map((asset) => (
              <Paper key={asset.id} elevation={0} sx={{ overflow: 'hidden', borderRadius: 1.5, border: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface }}>
                <AssetPreview asset={asset} />
                <Stack spacing={0.8} sx={{ p: 1.2 }}>
                  <Stack direction="row" spacing={0.75} justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.original_filename}</Typography>
                      <Typography sx={{ mt: 0.3, fontSize: '0.76rem', color: adminPalette.textMuted }}>{formatDateTime(asset.created_at)}</Typography>
                    </Box>
                    <Stack direction="row" spacing={0.25}>
                      <Tooltip title="Download asset">
                        <IconButton component="a" href={`/api/admin/content-assets/${asset.id}/download`} size="small" sx={{ color: adminPalette.textMuted }}>
                          <DownloadRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit asset">
                        <IconButton size="small" onClick={() => openEditAsset(asset)} sx={{ color: adminPalette.textMuted }}>
                          <EditRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete asset">
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(asset)}>
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                    <Chip size="small" label={asset.mime_type.startsWith('video/') ? 'Video' : 'Image'} sx={{ height: 22, fontWeight: 700, color: adminPalette.brandDark, backgroundColor: adminPalette.brandSoft }} />
                    <Chip size="small" label={formatBytes(asset.file_size)} variant="outlined" sx={{ height: 22, fontWeight: 700, borderColor: adminPalette.border }} />
                  </Stack>
                  <Box>
                    <Typography sx={{ fontSize: '0.69rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: adminPalette.textMuted }}>Uploaded by</Typography>
                    <Typography sx={{ mt: 0.2, fontSize: '0.8rem', fontWeight: 700, color: adminPalette.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.uploader || asset.uploader_email || '-'}</Typography>
                    {asset.uploader_email ? <Typography sx={{ fontSize: '0.72rem', color: adminPalette.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.uploader_email}</Typography> : null}
                  </Box>
                  <TagChips tags={asset.tags} />
                  {asset.notes ? <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textSecondary }}>{asset.notes}</Typography> : null}
                </Stack>
              </Paper>
            ))}
          </Box>
        )}
      </Paper>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Delete asset?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: adminPalette.textSecondary }}>
            {`File "${deleteTarget?.original_filename || ''}" akan dihapus dari database dan Supabase Storage.`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={isDeleting} sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editAssetTarget)} onClose={() => setEditAssetTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Edit asset</DialogTitle>
        <DialogContent>
          <Stack spacing={1.4} sx={{ pt: 1 }}>
            <TextField label="Nama asset" value={editAssetForm.original_filename || ''} onChange={(event) => setEditAssetForm((current) => ({ ...current, original_filename: event.target.value }))} fullWidth disabled={isSavingAsset} />
            <TextField label="Notes asset" value={editAssetForm.notes || ''} onChange={(event) => setEditAssetForm((current) => ({ ...current, notes: event.target.value }))} multiline minRows={2} fullWidth disabled={isSavingAsset} />
            <Autocomplete
              multiple
              freeSolo
              options={tagOptions}
              value={selectedAssetTags}
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
              onChange={(_, value) => syncAssetTags(value.map(normalizeTagOption))}
              renderOption={(props, option) => <Box component="li" {...props}>{option.inputValue ? `Add "${option.inputValue}"` : option.name}</Box>}
              renderInput={(params) => <TextField {...params} label="Tags" helperText="Select existing tags or type a new tag name and choose Add." />}
              renderTags={(value, getTagProps) => value.map((option, index) => {
                const { key, ...tagProps } = getTagProps({ index });
                return <Chip key={key} label={option.inputValue || option.name} {...tagProps} />;
              })}
              disabled={isSavingAsset}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setEditAssetTarget(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveAsset} disabled={isSavingAsset} sx={{ backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
            {isSavingAsset ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

    </Stack>
  );
}
