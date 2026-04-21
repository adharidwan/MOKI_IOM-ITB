'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  queued: { label: 'Pending', tone: '#eff6ff', text: '#1d4ed8', border: 'rgba(29, 78, 216, 0.14)' },
  retrying: { label: 'Retrying', tone: '#fff7ed', text: '#c2410c', border: 'rgba(194, 65, 12, 0.16)' },
  sent: { label: 'Done', tone: '#ecfdf3', text: '#15803d', border: 'rgba(21, 128, 61, 0.16)' },
  failed: { label: 'Failed', tone: '#fef2f2', text: '#b91c1c', border: 'rgba(185, 28, 28, 0.16)' },
};

const SOURCE_COPY: Record<
  OutboundMessageSourceType,
  { label: string; filterLabel: string; tone: string; text: string }
> = {
  blast: { label: 'Blast', filterLabel: 'Blast', tone: '#eef2ff', text: '#4338ca' },
  ticket_reply: { label: 'Ticket', filterLabel: 'Ticket', tone: '#eff6ff', text: '#1d4ed8' },
  api_notification: { label: 'External', filterLabel: 'External', tone: '#f0fdf4', text: '#166534' },
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
        backgroundColor: '#ffffff',
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }} noWrap>
              {item.recipient_phone_number}
            </Typography>
            <Typography sx={{ fontSize: '0.76rem', color: '#64748b' }}>
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
            <Typography sx={{ fontSize: '0.78rem', color: '#334155' }}>
              Ref: <strong>{item.client_reference}</strong>
            </Typography>
          ) : null}
          {item.ticket_id ? (
            <Typography sx={{ fontSize: '0.78rem', color: '#334155' }}>
              Ticket: <strong>{item.ticket_id}</strong>
            </Typography>
          ) : null}
          {item.last_delivery_error ? (
            <Typography sx={{ fontSize: '0.76rem', color: '#b91c1c' }}>{item.last_delivery_error}</Typography>
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
  const [selectedBatchId, setSelectedBatchId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sectionOpen, setSectionOpen] = useState<Record<SectionKey, boolean>>({ active: true, failed: true, done: true });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const previousAttentionCountRef = useRef(0);
  const trackedIds = useMemo(() => collectTrackedIds(trackedBatches), [trackedBatches]);

  useEffect(() => {
    const storedValue = window.sessionStorage.getItem(OUTBOUND_TRACKER_SESSION_STORAGE_KEY);

    if (!storedValue) {
      setHydrated(true);
      return;
    }

    try {
      setTrackedBatches(normalizeTrackedBatches(JSON.parse(storedValue)));
    } catch {
      window.sessionStorage.removeItem(OUTBOUND_TRACKER_SESSION_STORAGE_KEY);
    }

    setHydrated(true);
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
    };

    window.addEventListener(TRACKER_REGISTER_EVENT, handleRegister as EventListener);

    return () => {
      window.removeEventListener(TRACKER_REGISTER_EVENT, handleRegister as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!trackedIds.length) {
      setData(null);
      setErrorMessage(null);
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

  useEffect(() => {
    if (selectedBatchId !== 'all' && !trackedBatches.some((batch) => batch.id === selectedBatchId)) {
      setSelectedBatchId('all');
    }
  }, [selectedBatchId, trackedBatches]);

  const summary = data?.summary;

  useEffect(() => {
    const attentionCount = (summary?.active || 0) + (summary?.failed || 0);

    if (attentionCount > previousAttentionCountRef.current) {
      setOpen(true);
    }

    previousAttentionCountRef.current = attentionCount;
  }, [summary?.active, summary?.failed]);

  const batchSummaries = useMemo(
    () => deriveBatchSummaries(trackedBatches, data?.items || []),
    [data?.items, trackedBatches],
  );
  const batchIdsForFilter = useMemo(
    () => new Set(selectedBatchId === 'all' ? trackedIds : trackedBatches.find((batch) => batch.id === selectedBatchId)?.tracked_ids || []),
    [selectedBatchId, trackedBatches, trackedIds],
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

  return (
    <Box
      sx={{
        position: 'fixed',
        right: { xs: 12, md: 20 },
        bottom: { xs: 12, md: 20 },
        width: { xs: 'calc(100vw - 24px)', sm: 392 },
        maxWidth: 'calc(100vw - 24px)',
        zIndex: 1400,
      }}
    >
      <Paper
        elevation={8}
        sx={{
          overflow: 'hidden',
          borderRadius: 3,
          border: '1px solid #cbd5e1',
          backgroundColor: '#ffffff',
          boxShadow: '0 16px 40px rgba(15, 23, 42, 0.12)',
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ alignItems: 'center' }}>
            <Chip label={`${visibleSummary.active} aktif`} size="small" sx={{ backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 700 }} />
            <Chip label={`${visibleSummary.failed} gagal`} size="small" sx={{ backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: 700 }} />
            <Chip label={`${visibleSummary.sent} selesai`} size="small" sx={{ backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 700 }} />
            <Chip label={`ETA ${formatEta(visibleSummary.estimated_completion_seconds)}`} size="small" sx={{ backgroundColor: '#eff6ff', color: '#1e40af', fontWeight: 700 }} />
            <IconButton size="small" onClick={() => setOpen((current) => !current)} sx={{ ml: 'auto' }} > {open ? <ExpandMoreRoundedIcon /> : <ExpandLessRoundedIcon />} </IconButton>
          </Stack>
        </Box>

        {open ? (
          <Stack spacing={2} sx={{ p: 2 }}>
            {errorMessage ? <Alert severity="warning">{errorMessage}</Alert> : null}

            {hasTrackedItems ? (
              <Stack spacing={1}>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Batch
                </Typography>
                <Stack spacing={1} sx={{ maxHeight: 200, overflowY: 'auto', pr: 0.5 }}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.25,
                      borderRadius: 3,
                      border: selectedBatchId === 'all' ? '1px solid #003793' : '1px solid #e2e8f0',
                      backgroundColor: selectedBatchId === 'all' ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedBatchId('all')}
                  >
                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>Semua batch</Typography>
                  </Paper>
                  {batchSummaries.map((batch) => (
                    <Paper
                      key={batch.id}
                      elevation={0}
                      sx={{
                        p: 1.25,
                        borderRadius: 3,
                        border: selectedBatchId === batch.id ? '1px solid #003793' : '1px solid #e2e8f0',
                        backgroundColor: selectedBatchId === batch.id ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedBatchId(batch.id)}
                    >
                      <Stack spacing={0.75}>
                        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                          <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
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
              </Stack>
            ) : null}

            <Stack spacing={1}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
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
                    sx={statusFilter === filterValue ? { backgroundColor: '#003793', color: '#ffffff', fontWeight: 700 } : undefined}
                  />
                ))}
              </Stack>
            </Stack>

            <Stack spacing={1}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Source
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(['all', 'ticket_reply', 'api_notification', 'blast'] as SourceFilter[]).map((filterValue) => (
                  <Chip
                    key={filterValue}
                    clickable
                    label={filterValue === 'all' ? 'All sources' : SOURCE_COPY[filterValue].filterLabel}
                    onClick={() => setSourceFilter(filterValue)}
                    variant={sourceFilter === filterValue ? 'filled' : 'outlined'}
                    sx={sourceFilter === filterValue ? { backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 700 } : undefined}
                  />
                ))}
              </Stack>
            </Stack>

            <Divider />

            {hasTrackedItems ? (
              <Stack spacing={1.25} sx={{ maxHeight: { xs: 280, md: 360 }, overflowY: 'auto', pr: 0.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                    In progress ({activeItems.length})
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => toggleSection('active')}
                    disabled={!activeItems.length}
                    sx={{ ml: 'auto' }}
                  >
                    {sectionOpen.active ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                  </IconButton>
                </Stack>
                {!activeItems.length ? (
                  <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>Tidak ada item aktif untuk filter ini.</Typography>
                ) : sectionOpen.active ? (
                  activeItems.map((item) => <TrackerRow key={item.id} item={item} />)
                ) : null}

                <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 0.5 }}>
                  <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                    Need attention ({failedItems.length})
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => toggleSection('failed')}
                    disabled={!failedItems.length}
                    sx={{ ml: 'auto' }}
                  >
                    {sectionOpen.failed ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                  </IconButton>
                </Stack>
                {!failedItems.length ? (
                  <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>Tidak ada item gagal untuk filter ini.</Typography>
                ) : sectionOpen.failed ? (
                  failedItems.map((item) => <TrackerRow key={item.id} item={item} />)
                ) : null}

                <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 0.5 }}>
                  <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                    Completed ({doneItems.length})
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => toggleSection('done')}
                    disabled={!doneItems.length}
                    sx={{ ml: 'auto' }}
                  >
                    {sectionOpen.done ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                  </IconButton>
                </Stack>
                {!doneItems.length ? (
                  <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>Belum ada item selesai untuk filter ini.</Typography>
                ) : sectionOpen.done ? (
                  doneItems.map((item) => <TrackerRow key={item.id} item={item} />)
                ) : null}
              </Stack>
            ) : (
              <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <Stack spacing={0.75}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                    Belum ada pengiriman pada sesi ini
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
