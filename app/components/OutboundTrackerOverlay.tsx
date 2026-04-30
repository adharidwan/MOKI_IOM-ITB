'use client';

import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import { adminPalette } from '../lib/adminPalette';
import {
  OUTBOUND_TRACKER_SESSION_STORAGE_KEY,
  collectTrackedIds,
  deriveBatchSummaries,
  normalizeTrackedBatches,
  prepareTrackedBatchForRegistration,
  reconcileTrackedBatches,
  registerTrackedBatch,
  type TrackedOutboundBatch,
} from '../lib/outbound-tracker-session';
import type {
  OutboundTrackerResponse,
  OutboundMessageSourceType,
  OutboundMessageStatus,
  WhatsappOutboundListItem,
} from '../lib/whatsapp-notification-utils';

type StatusFilter = 'all' | OutboundMessageStatus;
type SourceFilter = 'all' | OutboundMessageSourceType;
type SectionKey = 'active' | 'failed' | 'done';

type TrackerRegisterDetail = {
  batch?: TrackedOutboundBatch;
};

const TRACKER_REGISTER_EVENT = 'outbound-tracker-register';
const OUTBOUND_TRACKER_PILL_POSITION_KEY = 'outbound-tracker-pill-position';
const PILL_VIEWPORT_MARGIN = 8;

type PillPosition = {
  left: number;
  top: number;
};

type PillDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  moved: boolean;
};

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});

const STATUS_COPY: Record<
  OutboundMessageStatus,
  { label: string; tone: string; text: string; border: string }
> = {
  queued: { label: 'Pending', tone: adminPalette.brandSoft, text: adminPalette.brandDark, border: adminPalette.brandSoftStrong },
  retrying: { label: 'Retrying', tone: adminPalette.warningBg, text: adminPalette.warningText, border: adminPalette.warningBorder },
  sent: { label: 'Done', tone: adminPalette.successBg, text: adminPalette.successText, border: adminPalette.successBorder },
  failed: { label: 'Failed', tone: adminPalette.dangerBg, text: adminPalette.dangerText, border: adminPalette.dangerBorder },
};

const SOURCE_COPY: Record<
  OutboundMessageSourceType,
  { label: string; filterLabel: string; tone: string; text: string }
> = {
  blast: { label: 'Blast', filterLabel: 'Blast', tone: adminPalette.brandSoftStrong, text: adminPalette.brandDark },
  ticket_reply: { label: 'Ticket', filterLabel: 'Ticket', tone: adminPalette.brandSoft, text: adminPalette.brand },
  api_notification: { label: 'External', filterLabel: 'External', tone: adminPalette.surfaceSoft, text: adminPalette.brandDark },
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(date);
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return 'paused';
  if (seconds <= 0) return 'done';
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.ceil(seconds / 60)}m`;
}

function buildTrackerUrl(basePath: string, ids: string[]): string {
  const params = new URLSearchParams();
  ids.forEach((id) => params.append('id', id));
  return `${basePath}?${params.toString()}`;
}

function TrackerRow({ item }: { item: WhatsappOutboundListItem }) {
  const source = SOURCE_COPY[item.source_type];
  const status = STATUS_COPY[item.delivery_status];

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 3,
        border: `1px solid ${status.border}`,
        backgroundColor: adminPalette.surface,
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: adminPalette.textPrimary }} noWrap>
              {item.recipient_phone_number}
            </Typography>
            <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>
              {formatDateTime(item.created_at)}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent="flex-end">
            <Chip
              label={source.label}
              size="small"
              sx={{ height: 24, borderRadius: 999, backgroundColor: source.tone, color: source.text, fontWeight: 700 }}
            />
            <Chip
              label={status.label}
              size="small"
              sx={{ height: 24, borderRadius: 999, backgroundColor: status.tone, color: status.text, fontWeight: 700 }}
            />
          </Stack>
        </Stack>

        <Stack spacing={0.35}>
          {item.client_reference ? (
            <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textSecondary }}>
              Ref: <strong>{item.client_reference}</strong>
            </Typography>
          ) : null}
          {item.ticket_id ? (
            <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textSecondary }}>
              Ticket: <strong>{item.ticket_id}</strong>
            </Typography>
          ) : null}
          {item.last_delivery_error ? (
            <Typography sx={{ fontSize: '0.76rem', color: adminPalette.dangerText }}>{item.last_delivery_error}</Typography>
          ) : null}
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function OutboundTrackerOverlay() {
  const [trackedBatches, setTrackedBatches] = useState<TrackedOutboundBatch[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<OutboundTrackerResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pillPosition, setPillPosition] = useState<PillPosition | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('all');
  const [batchListOpen, setBatchListOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sectionOpen, setSectionOpen] = useState<Record<SectionKey, boolean>>({ active: true, failed: true, done: true });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const previousAttentionCountRef = useRef(0);
  const hiddenPillRef = useRef<HTMLButtonElement | null>(null);
  const pillDragStateRef = useRef<PillDragState | null>(null);
  const trackedIds = useMemo(() => collectTrackedIds(trackedBatches), [trackedBatches]);

  const clampPillPosition = (position: PillPosition): PillPosition => {
    const rect = hiddenPillRef.current?.getBoundingClientRect();
    const width = rect?.width || 0;
    const height = rect?.height || 0;

    return {
      left: Math.min(
        Math.max(position.left, PILL_VIEWPORT_MARGIN),
        window.innerWidth - width - PILL_VIEWPORT_MARGIN,
      ),
      top: Math.min(
        Math.max(position.top, PILL_VIEWPORT_MARGIN),
        window.innerHeight - height - PILL_VIEWPORT_MARGIN,
      ),
    };
  };

  useEffect(() => {
    const storedValue = window.sessionStorage.getItem(OUTBOUND_TRACKER_SESSION_STORAGE_KEY);

    if (!storedValue) {
      queueMicrotask(() => setHydrated(true));
      return;
    }

    try {
      const normalizedBatches = normalizeTrackedBatches(JSON.parse(storedValue));

      queueMicrotask(() => {
        setTrackedBatches(normalizedBatches);
        setHydrated(true);
      });
    } catch {
      window.sessionStorage.removeItem(OUTBOUND_TRACKER_SESSION_STORAGE_KEY);
      queueMicrotask(() => setHydrated(true));
      return;
    }
  }, []);

  useEffect(() => {
    const storedValue = window.sessionStorage.getItem(OUTBOUND_TRACKER_PILL_POSITION_KEY);

    if (!storedValue) {
      return;
    }

    try {
      const parsedValue = JSON.parse(storedValue) as Partial<PillPosition>;

      if (typeof parsedValue.left === 'number' && typeof parsedValue.top === 'number') {
        const storedPosition = { left: parsedValue.left, top: parsedValue.top };
        queueMicrotask(() => setPillPosition(storedPosition));
      }
    } catch {
      window.sessionStorage.removeItem(OUTBOUND_TRACKER_PILL_POSITION_KEY);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.sessionStorage.setItem(
      OUTBOUND_TRACKER_SESSION_STORAGE_KEY,
      JSON.stringify(trackedBatches),
    );
  }, [hydrated, trackedBatches]);

  useEffect(() => {
    const handleRegister = (event: Event) => {
      const customEvent = event as CustomEvent<TrackerRegisterDetail>;
      const batch = customEvent.detail?.batch;

      if (!batch) {
        return;
      }

      let nextSelectedBatchId: string | null = null;

      setTrackedBatches((current) => {
        const preparedBatch = prepareTrackedBatchForRegistration(current, batch);

        if (!preparedBatch) {
          return current;
        }

        nextSelectedBatchId = preparedBatch.id;
        return registerTrackedBatch(current, preparedBatch);
      });

      if (nextSelectedBatchId) {
        setSelectedBatchId(nextSelectedBatchId);
      }

      setOpen(true);
      setHidden(false);
    };

    window.addEventListener(TRACKER_REGISTER_EVENT, handleRegister as EventListener);

    return () => {
      window.removeEventListener(TRACKER_REGISTER_EVENT, handleRegister as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!trackedIds.length) {
      queueMicrotask(() => {
        setData(null);
        setErrorMessage(null);
      });
      return;
    }

    let cancelled = false;
    let eventSource: EventSource | null = null;
    let pollingId: ReturnType<typeof setInterval> | null = null;
    const snapshotUrl = buildTrackerUrl('/api/admin/outbound-tracker', trackedIds);
    const streamUrl = buildTrackerUrl('/api/admin/outbound-tracker/stream', trackedIds);

    const applyPayload = (payload: OutboundTrackerResponse) => {
      if (cancelled) {
        return;
      }

      setData(payload);
      setErrorMessage(null);
      setTrackedBatches((current) => {
        const next = reconcileTrackedBatches(current, payload.items);
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
    };

    const loadSnapshot = async () => {
      const response = await fetch(snapshotUrl, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`Gagal memuat tracker outbound (${response.status}).`);
      }

      applyPayload((await response.json()) as OutboundTrackerResponse);
    };

    const startPolling = () => {
      if (pollingId) {
        return;
      }

      pollingId = setInterval(() => {
        void loadSnapshot().catch((error) => {
          if (!cancelled) {
            setErrorMessage(error instanceof Error ? error.message : 'Gagal memperbarui tracker outbound.');
          }
        });
      }, 8000);
    };

    void loadSnapshot().catch((error) => {
      if (!cancelled) {
        setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat tracker outbound.');
      }
    });

    eventSource = new EventSource(streamUrl);
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as OutboundTrackerResponse & { error?: string };

        if (payload.error) {
          setErrorMessage(payload.error);
          return;
        }

        applyPayload(payload);
      } catch {
        setErrorMessage('Gagal membaca pembaruan tracker outbound.');
      }
    };
    eventSource.onerror = () => {
      eventSource?.close();
      startPolling();
    };

    return () => {
      cancelled = true;
      eventSource?.close();
      if (pollingId) {
        clearInterval(pollingId);
      }
    };
  }, [trackedIds]);

  const summary = data?.summary;
  const activeSelectedBatchId =
    selectedBatchId !== 'all' && !trackedBatches.some((batch) => batch.id === selectedBatchId)
      ? 'all'
      : selectedBatchId;

  useEffect(() => {
    const attentionCount = (summary?.active || 0) + (summary?.failed || 0);

    if (attentionCount > previousAttentionCountRef.current) {
      queueMicrotask(() => {
        setOpen(true);
        setHidden(false);
      });
    }

    previousAttentionCountRef.current = attentionCount;
  }, [summary?.active, summary?.failed]);

  const batchSummaries = useMemo(
    () => deriveBatchSummaries(trackedBatches, data?.items || []),
    [data?.items, trackedBatches],
  );
  const batchIdsForFilter = useMemo(
    () =>
      new Set(
        activeSelectedBatchId === 'all'
          ? trackedIds
          : trackedBatches.find((batch) => batch.id === activeSelectedBatchId)?.tracked_ids || [],
      ),
    [activeSelectedBatchId, trackedBatches, trackedIds],
  );

  const filteredItems = useMemo(() => {
    return (data?.items || []).filter((item) => {
      if (!batchIdsForFilter.has(item.id)) return false;
      if (statusFilter !== 'all' && item.delivery_status !== statusFilter) return false;
      if (sourceFilter !== 'all' && item.source_type !== sourceFilter) return false;
      return item;
    });
  }, [batchIdsForFilter, data?.items, sourceFilter, statusFilter]);

  const activeItems = filteredItems.filter((item) => ['queued', 'retrying'].includes(item.delivery_status));
  const failedItems = filteredItems.filter((item) => item.delivery_status === 'failed');
  const doneItems = filteredItems.filter((item) => item.delivery_status === 'sent');

  const toggleSection = (section: SectionKey) => {
    setSectionOpen((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const handleHiddenPillPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();

    pillDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleHiddenPillPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const dragState = pillDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragState.moved = true;
    }

    setPillPosition(clampPillPosition({
      left: dragState.startLeft + deltaX,
      top: dragState.startTop + deltaY,
    }));
  };

  const handleHiddenPillPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const dragState = pillDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    pillDragStateRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!dragState.moved) {
      setHidden(false);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const nextPosition = clampPillPosition({ left: rect.left, top: rect.top });

    setPillPosition(nextPosition);
    window.sessionStorage.setItem(OUTBOUND_TRACKER_PILL_POSITION_KEY, JSON.stringify(nextPosition));
  };

  const handleHiddenPillKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setHidden(false);
    }
  };

  const hasTrackedItems = trackedBatches.length > 0;
  const visibleSummary =
    summary ||
    ({
      queued: 0,
      retrying: 0,
      failed: 0,
      sent: 0,
      active: 0,
      total: 0,
      ticket_reply: 0,
      api_notification: 0,
      blast: 0,
      queued_ticket_replies: 0,
      queued_api_notifications: 0,
      queued_blast_messages: 0,
      effective_min_gap_ms: 0,
      api_notifications_paused: false,
      estimated_completion_seconds: 0,
      updated_at: new Date().toISOString(),
    } satisfies OutboundTrackerResponse['summary']);

  if (!hasTrackedItems && !errorMessage) {
    return null;
  }

  if (hidden) {
    return (
      <Box
        sx={{
          position: 'fixed',
          ...(pillPosition
            ? { left: pillPosition.left, top: pillPosition.top }
            : { right: { xs: 12, md: 16 }, bottom: { xs: 12, md: 16 } }),
          zIndex: 1400,
        }}
      >
        <Paper
          ref={hiddenPillRef}
          component="button"
          elevation={0}
          type="button"
          aria-label="Tampilkan tracker outbound"
          onPointerDown={handleHiddenPillPointerDown}
          onPointerMove={handleHiddenPillPointerMove}
          onPointerUp={handleHiddenPillPointerUp}
          onPointerCancel={handleHiddenPillPointerUp}
          onKeyDown={handleHiddenPillKeyDown}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.25,
            py: 0.85,
            border: `1px solid ${adminPalette.borderStrong}`,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.96)',
            color: adminPalette.textPrimary,
            boxShadow: '0 10px 26px rgba(2, 132, 199, 0.12)',
            cursor: 'pointer',
            font: 'inherit',
            userSelect: 'none',
            touchAction: 'none',
            backdropFilter: 'blur(12px)',
            '&:hover': {
              backgroundColor: adminPalette.surfaceSoft,
            },
          }}
        >
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Outbound
          </Typography>
          <Chip
            label={`${visibleSummary.active} aktif`}
            size="small"
            sx={{ height: 22, borderRadius: 1.75, backgroundColor: adminPalette.brandSoftStrong, color: adminPalette.brandDark, fontWeight: 700 }}
          />
          {visibleSummary.failed ? (
            <Chip
              label={`${visibleSummary.failed} gagal`}
              size="small"
              sx={{ height: 22, borderRadius: 1.75, backgroundColor: adminPalette.dangerBg, color: adminPalette.dangerText, fontWeight: 700 }}
            />
          ) : null}
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        right: { xs: 12, md: 16 },
        bottom: { xs: 12, md: 16 },
        width: { xs: 'calc(100vw - 24px)', sm: 380 },
        maxWidth: 'calc(100vw - 24px)',
        zIndex: 1400,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: { xs: 'calc(100dvh - 24px)', md: 'calc(100dvh - 32px)' },
          borderRadius: 2.5,
          border: `1px solid ${adminPalette.borderStrong}`,
          backgroundColor: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 10px 26px rgba(2, 132, 199, 0.12)',
        }}
      >
        <Box
          sx={{
            px: 1.4,
            py: 1,
            borderBottom: open ? `1px solid ${adminPalette.border}` : 'none',
            backgroundColor: adminPalette.surfaceSoft,
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: adminPalette.textMuted,
                }}
              >
                Outbound
              </Typography>
              <Chip
                label={`${visibleSummary.active} aktif`}
                size="small"
                sx={{ height: 22, borderRadius: 1.75, backgroundColor: adminPalette.brandSoftStrong, color: adminPalette.brandDark, fontWeight: 700 }}
              />
              <Chip
                label={`${visibleSummary.failed} gagal`}
                size="small"
                sx={{ height: 22, borderRadius: 1.75, backgroundColor: adminPalette.dangerBg, color: adminPalette.dangerText, fontWeight: 700 }}
              />
              <Chip
                label={`ETA ${formatEta(visibleSummary.estimated_completion_seconds)}`}
                size="small"
                sx={{ height: 22, borderRadius: 1.75, backgroundColor: adminPalette.brandSoft, color: adminPalette.textSecondary, fontWeight: 700 }}
              />
            </Stack>
            <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', flexShrink: 0 }}>
              <IconButton
                size="small"
                aria-label={open ? 'Ciutkan tracker outbound' : 'Perluas tracker outbound'}
                onClick={() => setOpen((current) => !current)}
                sx={{ color: adminPalette.textMuted }}
              >
                {open ? <ExpandMoreRoundedIcon /> : <ExpandLessRoundedIcon />}
              </IconButton>
              <IconButton
                size="small"
                aria-label="Sembunyikan tracker outbound"
                onClick={() => setHidden(true)}
                sx={{ color: adminPalette.textMuted }}
              >
                <CloseRoundedIcon />
              </IconButton>
            </Stack>
          </Stack>
        </Box>

        {open ? (
          <Stack spacing={2} sx={{ p: 2, overflowY: 'auto', minHeight: 0 }}>
            {errorMessage ? <Alert severity="warning">{errorMessage}</Alert> : null}

            {hasTrackedItems ? (
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: adminPalette.textMuted, textTransform: 'uppercase' }}>
                    Batch
                  </Typography>
                  <IconButton size="small" onClick={() => setBatchListOpen((current) => !current)} sx={{ ml: 'auto', color: adminPalette.textMuted }}>
                    {batchListOpen ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                  </IconButton>
                </Stack>
                {batchListOpen ? (
                  <Stack spacing={1} sx={{ maxHeight: 200, overflowY: 'auto', pr: 0.5 }}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 1.25,
                        borderRadius: 3,
                        border: activeSelectedBatchId === 'all' ? `1px solid ${adminPalette.brand}` : `1px solid ${adminPalette.border}`,
                        backgroundColor: activeSelectedBatchId === 'all' ? adminPalette.brandSoft : adminPalette.surface,
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedBatchId('all')}
                    >
                      <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: adminPalette.textPrimary }}>Semua batch</Typography>
                    </Paper>
                    {batchSummaries.map((batch) => (
                      <Paper
                        key={batch.id}
                        elevation={0}
                        sx={{
                          p: 1.25,
                          borderRadius: 3,
                          border: activeSelectedBatchId === batch.id ? `1px solid ${adminPalette.brand}` : `1px solid ${adminPalette.border}`,
                          backgroundColor: activeSelectedBatchId === batch.id ? adminPalette.brandSoft : adminPalette.surface,
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedBatchId(batch.id)}
                      >
                        <Stack spacing={0.75}>
                          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                              {batch.label}
                            </Typography>
                            <Chip
                              label={SOURCE_COPY[batch.source_type].label}
                              size="small"
                              sx={{ backgroundColor: SOURCE_COPY[batch.source_type].tone, color: SOURCE_COPY[batch.source_type].text, fontWeight: 700 }}
                            />
                          </Stack>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            ) : null}

            <Stack spacing={1}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: adminPalette.textMuted, textTransform: 'uppercase' }}>
                Status
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(['all', 'queued', 'retrying', 'failed', 'sent'] as StatusFilter[]).map((filterValue) => (
                  <Chip
                    key={filterValue}
                    clickable
                    label={filterValue === 'all' ? 'All' : STATUS_COPY[filterValue].label}
                    onClick={() => setStatusFilter(filterValue)}
                    variant={statusFilter === filterValue ? 'filled' : 'outlined'}
                    sx={statusFilter === filterValue ? { backgroundColor: adminPalette.brandSoftStrong, color: adminPalette.brandDark, fontWeight: 700 } : undefined}
                  />
                ))}
              </Stack>
            </Stack>

            <Stack spacing={1}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: adminPalette.textMuted, textTransform: 'uppercase' }}>
                Source
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(['all', 'ticket_reply', 'api_notification', 'blast'] as SourceFilter[]).map((filterValue) => (
                  <Chip
                    key={filterValue}
                    clickable
                    label={filterValue === 'all' ? 'All' : SOURCE_COPY[filterValue].filterLabel}
                    onClick={() => setSourceFilter(filterValue)}
                    variant={sourceFilter === filterValue ? 'filled' : 'outlined'}
                    sx={sourceFilter === filterValue ? { backgroundColor: adminPalette.brandSoftStrong, color: adminPalette.brandDark, fontWeight: 700 } : undefined}
                  />
                ))}
              </Stack>
            </Stack>

            <Divider sx={{ borderColor: adminPalette.border }} />

            {hasTrackedItems ? (
              <Stack spacing={1.25} sx={{ maxHeight: { xs: 280, md: 360 }, overflowY: 'auto', pr: 0.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                    In progress ({activeItems.length})
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => toggleSection('active')}
                    disabled={!activeItems.length}
                    sx={{ ml: 'auto', color: adminPalette.textMuted }}
                  >
                    {sectionOpen.active ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                  </IconButton>
                </Stack>

                {(activeItems.length && sectionOpen.active) ? 
                  activeItems.map((item) => <TrackerRow key={item.id} item={item} />) : null}

                <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 0.5 }}>
                  <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                    Need attention ({failedItems.length})
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => toggleSection('failed')}
                    disabled={!failedItems.length}
                    sx={{ ml: 'auto', color: adminPalette.textMuted }}
                  >
                    {sectionOpen.failed ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                  </IconButton>
                </Stack>
                {failedItems.length && sectionOpen.failed ? 
                  failedItems.map((item) => <TrackerRow key={item.id} item={item} />) : null
                }

                <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 0.5 }}>
                  <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                    Completed ({doneItems.length})
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => toggleSection('done')}
                    disabled={!doneItems.length}
                    sx={{ ml: 'auto', color: adminPalette.textMuted }}
                  >
                    {sectionOpen.done ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                  </IconButton>
                </Stack>
                {doneItems.length && sectionOpen.done ? 
                  doneItems.map((item) => <TrackerRow key={item.id} item={item} />) : null}
              </Stack>
            ) : (
              <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: `1px solid ${adminPalette.border}`, backgroundColor: adminPalette.surfaceSoft }}>
                <Stack spacing={0.75}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                    Belum ada pengiriman
                  </Typography>
                </Stack>
              </Paper>
            )}
          </Stack>
        ) : null}
      </Paper>
    </Box>
  );
}

export { TRACKER_REGISTER_EVENT };
