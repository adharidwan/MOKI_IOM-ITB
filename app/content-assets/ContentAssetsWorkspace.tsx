'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import InsertPhotoRoundedIcon from '@mui/icons-material/InsertPhotoRounded';
import MovieRoundedIcon from '@mui/icons-material/MovieRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import { adminPalette, adminTableSortLabelSx } from '../lib/adminPalette';
import type { ContentAsset, ContentAssetProject, ContentTag } from '../lib/types';
import {
  createContentAssetProjectAction,
  deleteContentAssetProjectAction,
  saveContentAssetProjectAction,
  type ContentAssetProjectFormState,
} from './actions';

interface ContentAssetsWorkspaceProps {
  projects: ContentAssetProject[];
  tags: ContentTag[];
  currentSearch: string;
  currentAssetFilter: string;
  currentTagIds: string[];
  currentSortDir: 'asc' | 'desc';
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

const VISIBLE_TAG_LIMIT = 2;
const CONTENT_TAG_SX = { height: 22, borderRadius: 1.75, fontSize: '0.71rem', fontWeight: 700, color: adminPalette.brandDark, backgroundColor: adminPalette.brandSoft };
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
const EMPTY_PROJECT_FORM: ContentAssetProjectFormState = { id: '', project_name: '', notes: '', tag_ids: [], new_tag_names: [] };

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

function formatDateTime(value: string | null): string {
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
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

function MetricTile({ label, value }: { label: string; value: number | string }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        px: { xs: 0, sm: 1.4 },
        py: 0.1,
        borderLeft: { sm: `1px solid ${adminPalette.border}` },
        '&:first-of-type': { pl: 0, borderLeft: 'none' },
      }}
    >
      <Typography sx={{ fontSize: '0.63rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: adminPalette.textMuted }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.4, fontSize: { xs: '1rem', sm: '1.12rem' }, fontWeight: 700, lineHeight: 1, color: adminPalette.brandDark }}>
        {value}
      </Typography>
    </Box>
  );
}

function ProjectPreview({ asset }: { asset: ContentAsset | null }) {
  if (!asset?.signed_url) {
    return (
      <Box sx={{ width: 86, height: 62, borderRadius: 1.5, display: 'grid', placeItems: 'center', backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
        <FolderRoundedIcon sx={{ color: adminPalette.textSubtle }} />
      </Box>
    );
  }

  const isVideo = asset.mime_type.startsWith('video/');

  return (
    <Box sx={{ width: 86, height: 62, borderRadius: 1.5, overflow: 'hidden', backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
      {isVideo ? (
        <Box component="video" src={asset.signed_url} muted sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <Box component="img" src={asset.signed_url} alt={asset.original_filename} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
    </Box>
  );
}

export default function ContentAssetsWorkspace({
  projects,
  tags,
  currentSearch,
  currentAssetFilter,
  currentTagIds,
  currentSortDir,
  initialLoadError,
}: ContentAssetsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [flash, setFlash] = useState<FlashState>(
    initialLoadError ? { severity: 'warning', message: initialLoadError } : null,
  );
  const [tagOptions, setTagOptions] = useState<TagOption[]>(tags);
  const [filters, setFilters] = useState({ search: currentSearch, assetFilter: currentAssetFilter, tagIds: currentTagIds });
  const [editTarget, setEditTarget] = useState<ContentAssetProject | null>(null);
  const [editForm, setEditForm] = useState<ContentAssetProjectFormState>(EMPTY_PROJECT_FORM);
  const [selectedEditTags, setSelectedEditTags] = useState<TagOption[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ContentAssetProject | null>(null);
  const [isCreating, startCreateTransition] = useTransition();
  const [isSavingProject, startSaveProjectTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const totalAssets = projects.reduce((total, project) => total + project.asset_count, 0);
  const totalImages = projects.reduce((total, project) => total + project.image_count, 0);
  const totalVideos = projects.reduce((total, project) => total + project.video_count, 0);
  const selectedFilterTags = useMemo(
    () => tagOptions.filter((tag) => filters.tagIds.includes(tag.id)),
    [filters.tagIds, tagOptions],
  );

  useEffect(() => {
    setTagOptions(tags);
  }, [tags]);

  useEffect(() => {
    setFilters({ search: currentSearch, assetFilter: currentAssetFilter, tagIds: currentTagIds });
  }, [currentAssetFilter, currentSearch, currentTagIds]);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (
        filters.search === currentSearch &&
        filters.assetFilter === currentAssetFilter &&
        filters.tagIds.join(',') === currentTagIds.join(',')
      ) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      setOptionalParam(params, 'search', filters.search.trim());
      setOptionalParam(params, 'assetFilter', filters.assetFilter);
      setOptionalParam(params, 'tagIds', filters.tagIds.join(','));
      params.delete('tagId');
      router.replace(toUrl(pathname, params));
    }, 300);

    return () => clearTimeout(delay);
  }, [currentAssetFilter, currentSearch, currentTagIds, filters, pathname, router, searchParams]);

  function updateQuery(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    router.replace(toUrl(pathname, params));
  }

  function syncEditTags(nextTags: TagOption[]) {
    const normalized = Array.from(
      new Map(
        nextTags
          .map(normalizeTagOption)
          .filter((tag) => tag.name.trim())
          .map((tag) => [tag.isNew ? `new:${tag.name.toLowerCase()}` : tag.id, tag] as const),
      ).values(),
    );

    setSelectedEditTags(normalized);
    setEditForm((current) => ({
      ...current,
      tag_ids: normalized.filter((tag) => !tag.isNew).map((tag) => tag.id),
      new_tag_names: normalized.filter((tag) => tag.isNew).map((tag) => tag.name),
    }));
  }

  function openEditProject(project: ContentAssetProject) {
    setEditTarget(project);
    setSelectedEditTags(project.tags);
    setEditForm({
      id: project.id,
      project_name: project.project_name,
      notes: project.notes || '',
      tag_ids: project.tags.map((tag) => tag.id),
      new_tag_names: [],
    });
  }

  function handleCreateProject(formData: FormData) {
    setFlash(null);
    startCreateTransition(async () => {
      const result = await createContentAssetProjectAction(formData);
      if (result.success && result.projectId) {
        router.push(`/content-assets/${result.projectId}`);
      } else {
        setFlash({ severity: 'error', message: result.error || 'Gagal membuat project asset.' });
      }
    });
  }

  function handleDeleteProject() {
    if (!deleteTarget) {
      return;
    }

    const targetId = deleteTarget.id;
    startDeleteTransition(async () => {
      const result = await deleteContentAssetProjectAction(targetId);
      setDeleteTarget(null);
      setFlash(
        result.success
          ? { severity: 'success', message: 'Project asset berhasil dihapus.' }
          : { severity: 'error', message: result.error || 'Gagal menghapus project asset.' },
      );
      if (result.success) {
        router.refresh();
      }
    });
  }

  function handleSaveProject() {
    startSaveProjectTransition(async () => {
      const result = await saveContentAssetProjectAction(editForm);

      if (!result.success || !result.project) {
        setFlash({ severity: 'error', message: result.error || 'Gagal menyimpan project asset.' });
        return;
      }

      setTagOptions((current) => {
        const byId = new Map(current.map((tag) => [tag.id, tag]));
        result.project?.tags.forEach((tag) => byId.set(tag.id, tag));
        return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
      });
      setEditTarget(null);
      setFlash({ severity: 'success', message: 'Project asset berhasil disimpan.' });
      router.refresh();
    });
  }

  function handleSortLatestAsset() {
    updateQuery((params) => {
      params.set('sortDir', currentSortDir === 'asc' ? 'desc' : 'asc');
    });
  }

  function clearFilters() {
    setFilters({ search: '', assetFilter: '', tagIds: [] });
    updateQuery((params) => {
      params.delete('search');
      params.delete('assetFilter');
      params.delete('tagIds');
      params.delete('tagId');
    });
  }

  return (
    <Stack spacing={1.25}>
      {flash ? <Alert severity={flash.severity} onClose={() => setFlash(null)}>{flash.message}</Alert> : null}

      <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surface, boxShadow: 'none' }}>
        <Stack spacing={1.5} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
              <MetricTile label="Projects" value={projects.length} />
              <MetricTile label="Assets" value={totalAssets} />
              <MetricTile label="Images" value={totalImages} />
              <MetricTile label="Videos" value={totalVideos} />
            </Stack>
          </Stack>

          <Box component="form" action={handleCreateProject}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', lg: 'flex-start' }}>
              <TextField name="project_name" label="Nama project" required size="small" sx={{ minWidth: { lg: 280 } }} disabled={isCreating} />
              <TextField name="notes" label="Notes project" size="small" multiline minRows={1} sx={{ flex: 1 }} disabled={isCreating} />
              <Button type="submit" variant="contained" disabled={isCreating} sx={{ minHeight: 40, borderRadius: 2, backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
                {isCreating ? 'Creating...' : 'Init Project'}
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, overflow: 'hidden', backgroundColor: adminPalette.surface }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ xs: 'stretch', lg: 'center' }} sx={{ p: { xs: 1.5, md: 2 }, borderBottom: `1px solid ${adminPalette.border}` }}>
          <TextField
            size="small"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search project, creator, notes, or tag"
            sx={{ flex: 1, minWidth: { lg: 280 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: adminPalette.textMuted }} /></InputAdornment> }}
          />
          <TextField select size="small" label="Asset" value={filters.assetFilter} onChange={(event) => setFilters((current) => ({ ...current, assetFilter: event.target.value }))} sx={{ minWidth: { xs: '100%', sm: 180 } }}>
            <MenuItem value="">All projects</MenuItem>
            <MenuItem value="image">Has image</MenuItem>
            <MenuItem value="video">Has video</MenuItem>
            <MenuItem value="empty">Empty project</MenuItem>
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
          {[currentSearch, currentAssetFilter].filter(Boolean).length + currentTagIds.length > 0 ? <Button onClick={clearFilters} sx={{ color: adminPalette.textSecondary, textTransform: 'none', fontWeight: 700 }}>Clear filters</Button> : null}
        </Stack>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: adminPalette.textPrimary }}>Asset Projects</Typography>
          <Typography sx={{ mt: 0.3, fontSize: '0.84rem', color: adminPalette.textSecondary }}>Klik project untuk membuka detail dan upload kumpulan asset.</Typography>
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead sx={{ backgroundColor: adminPalette.brand }}>
              <TableRow>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Preview</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Project</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Tags</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Assets</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Created By</TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>
                  <TableSortLabel active direction={currentSortDir} onClick={handleSortLatestAsset} sx={adminTableSortLabelSx}>
                    Latest Asset
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Belum ada asset project.</Typography>
                    <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>Init project pertama, lalu upload file di halaman detail project.</Typography>
                  </TableCell>
                </TableRow>
              ) : projects.map((project) => (
                <TableRow
                  key={project.id}
                  hover
                  sx={{ textDecoration: 'none' }}
                >
                  <TableCell><ProjectPreview asset={project.preview_asset} /></TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{project.project_name}</Typography>
                    {project.notes ? <Typography sx={{ mt: 0.4, maxWidth: 360, fontSize: '0.8rem', color: adminPalette.textSecondary }}>{project.notes}</Typography> : null}
                  </TableCell>
                  <TableCell>
                    <TagChips tags={project.tags} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                      <Chip size="small" label={`${project.asset_count} file`} sx={{ height: 22, fontWeight: 700, color: adminPalette.brandDark, backgroundColor: adminPalette.brandSoft }} />
                      <Chip size="small" icon={<InsertPhotoRoundedIcon />} label={project.image_count} variant="outlined" sx={{ height: 22, fontWeight: 700, borderColor: adminPalette.border }} />
                      <Chip size="small" icon={<MovieRoundedIcon />} label={project.video_count} variant="outlined" sx={{ height: 22, fontWeight: 700, borderColor: adminPalette.border }} />
                      <Chip size="small" label={formatBytes(project.total_file_size)} variant="outlined" sx={{ height: 22, fontWeight: 700, borderColor: adminPalette.border }} />
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{project.created_by}</Typography>
                    {project.created_by_email ? <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>{project.created_by_email}</Typography> : null}
                  </TableCell>
                  <TableCell sx={{ color: adminPalette.textSecondary, fontWeight: 700 }}>{formatDateTime(project.latest_asset_at)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                      <Button component={Link} href={`/content-assets/${project.id}`} size="small" sx={{ textTransform: 'none', fontWeight: 700 }}>
                        Detail
                      </Button>
                      <IconButton size="small" onClick={() => openEditProject(project)} aria-label={`Edit ${project.project_name}`}>
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(project)} aria-label={`Delete ${project.project_name}`}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Delete project?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: adminPalette.textSecondary }}>
            {`Project "${deleteTarget?.project_name || ''}" beserta ${deleteTarget?.asset_count || 0} asset dan file storage terkait akan dihapus.`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteProject} disabled={isDeleting} sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
            {isDeleting ? 'Deleting...' : 'Delete Project'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>Edit project</DialogTitle>
        <DialogContent>
          <Stack spacing={1.4} sx={{ pt: 1 }}>
            <TextField label="Nama project" value={editForm.project_name} onChange={(event) => setEditForm((current) => ({ ...current, project_name: event.target.value }))} fullWidth disabled={isSavingProject} />
            <TextField label="Notes project" value={editForm.notes || ''} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} multiline minRows={2} fullWidth disabled={isSavingProject} />
            <Autocomplete
              multiple
              freeSolo
              options={tagOptions}
              value={selectedEditTags}
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
              onChange={(_, value) => syncEditTags(value.map(normalizeTagOption))}
              renderOption={(props, option) => <Box component="li" {...props}>{option.inputValue ? `Add "${option.inputValue}"` : option.name}</Box>}
              renderInput={(params) => <TextField {...params} label="Tags" helperText="Select existing tags or type a new tag name and choose Add." />}
              renderTags={(value, getTagProps) => value.map((option, index) => {
                const { key, ...tagProps } = getTagProps({ index });
                return <Chip key={key} label={option.inputValue || option.name} {...tagProps} />;
              })}
              disabled={isSavingProject}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setEditTarget(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveProject} disabled={isSavingProject} sx={{ backgroundColor: adminPalette.brand, textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
            {isSavingProject ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
