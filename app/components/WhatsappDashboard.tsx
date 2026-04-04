'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Collapse,
  Divider,
  Grid,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';

import type {
  WhatsappDashboardOverview,
  WhatsappInstanceEventRecord,
  WhatsappInstanceStatus,
  WhatsappInstanceSummary,
  WhatsappOutboundListItem,
  WhatsappOutboundSummary,
} from '../lib/whatsapp-notification-utils';

interface OutboundResponse {
  summary: WhatsappOutboundSummary;
  items: WhatsappOutboundListItem[];
}

interface WhatsappDashboardProps {
  initialOverview: WhatsappDashboardOverview;
  initialOutbound: OutboundResponse;
  initialEvents: WhatsappInstanceEventRecord[];
  initialRenderedAt: string;
}

type OutboundFilter = 'all' | 'queued' | 'retrying' | 'failed' | 'sent';
type DetailTab = 'ringkasan' | 'aktivitas' | 'pengiriman' | 'teknis';

interface GroupedEvent {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  count: number;
}

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});

const STATUS_COPY: Record<
  WhatsappInstanceStatus,
  {
    label: string;
    color: 'success' | 'warning' | 'error' | 'info' | 'default';
    rank: number;
    shortAction: string;
  }
> = {
  starting: { label: 'Memulai', color: 'default', rank: 4, shortAction: 'Tunggu proses awal selesai' },
  qr_required: { label: 'Perlu Scan QR', color: 'warning', rank: 0, shortAction: 'Scan QR untuk mengaktifkan kembali' },
  connecting: { label: 'Menghubungkan', color: 'info', rank: 3, shortAction: 'Tunggu hingga perangkat tersambung' },
  ready: { label: 'Aktif', color: 'success', rank: 5, shortAction: 'Pantau aktivitas terbaru' },
  degraded: { label: 'Perlu Dicek', color: 'warning', rank: 1, shortAction: 'Periksa koneksi dan antrean pesan' },
  disconnected: { label: 'Terputus', color: 'error', rank: 1, shortAction: 'Sambungkan ulang perangkat' },
  auth_failed: { label: 'Gagal Masuk', color: 'error', rank: 0, shortAction: 'Masuk ulang dengan scan QR baru' },
};

const OUTBOUND_FILTER_COPY: Record<
  OutboundFilter,
  { label: string; color?: 'warning' | 'error' | 'success' }
> = {
  all: { label: 'Semua' },
  queued: { label: 'Tertunda', color: 'warning' },
  retrying: { label: 'Coba Lagi', color: 'warning' },
  failed: { label: 'Gagal', color: 'error' },
  sent: { label: 'Berhasil', color: 'success' },
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(date);
}

function formatAgeWithNow(value: string | null, nowMs: number | null): string {
  if (!value) {
    return '-';
  }

  if (nowMs === null) {
    return formatDateTime(value);
  }

  const diffMs = nowMs - Date.parse(value);
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return formatDateTime(value);
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return 'baru saja';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} menit lalu`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} jam lalu`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} hari lalu`;
}

function getStatusPresentation(status: WhatsappInstanceStatus) {
  return STATUS_COPY[status];
}

function getPendingMessageCount(instance: WhatsappInstanceSummary): number {
  return (
    instance.queue.queued_ticket_replies +
    instance.queue.queued_api_notifications +
    instance.queue.retrying_messages
  );
}

function getLastActivityAt(instance: WhatsappInstanceSummary): string | null {
  return (
    instance.runtime?.last_inbound_at ||
    instance.staff.latest_inbound_at ||
    instance.runtime?.last_outbound_at ||
    instance.runtime?.last_heartbeat_at ||
    instance.instance.updated_at
  );
}

function isCriticalInstance(instance: WhatsappInstanceSummary): boolean {
  return ['qr_required', 'degraded', 'disconnected', 'auth_failed'].includes(instance.derived_status);
}

function getPrimaryActionLabel(instance: WhatsappInstanceSummary): string {
  if (instance.derived_status === 'qr_required' || instance.derived_status === 'auth_failed') {
    return 'Lihat QR';
  }

  if (instance.derived_status === 'degraded' || instance.derived_status === 'disconnected') {
    return 'Periksa Status';
  }

  return 'Buka Detail';
}

function getEventCopy(event: WhatsappInstanceEventRecord): { title: string; description: string } {
  switch (event.event_type) {
    case 'qr_issued':
      return {
        title: 'QR baru siap dipindai',
        description: event.message || 'Perangkat membutuhkan scan QR agar bisa dipakai kembali.',
      };
    case 'ready':
      return {
        title: 'Perangkat sudah aktif',
        description: event.message || 'Perangkat sudah terhubung dan siap mengirim atau menerima pesan.',
      };
    case 'disconnected':
      return {
        title: 'Koneksi perangkat terputus',
        description: event.message || 'Perlu pengecekan koneksi atau login ulang.',
      };
    case 'auth_failed':
      return {
        title: 'Login perangkat gagal',
        description: event.message || 'Silakan scan ulang untuk masuk kembali.',
      };
    case 'worker_stale':
      return {
        title: 'Pembaruan perangkat terlambat',
        description: event.message || 'Sistem tidak menerima kabar terbaru dari perangkat.',
      };
    case 'reconnect_started':
      return {
        title: 'Sistem mencoba menyambungkan ulang',
        description: event.message || 'Perangkat sedang diproses agar kembali aktif.',
      };
    default:
      return {
        title: 'Aktivitas perangkat diperbarui',
        description: event.message || formatDateTime(event.created_at),
      };
  }
}

function groupEvents(events: WhatsappInstanceEventRecord[]): GroupedEvent[] {
  const grouped: GroupedEvent[] = [];

  events.forEach((event) => {
    const copy = getEventCopy(event);
    const previous = grouped[grouped.length - 1];

    if (previous && previous.title === copy.title) {
      previous.count += 1;
      previous.createdAt = previous.createdAt > event.created_at ? previous.createdAt : event.created_at;
      return;
    }

    grouped.push({
      id: event.id,
      title: copy.title,
      description: copy.description,
      createdAt: event.created_at,
      count: 1,
    });
  });

  return grouped;
}

function updateOverviewWithDetail(
  currentOverview: WhatsappDashboardOverview,
  detail: WhatsappInstanceSummary,
): WhatsappDashboardOverview {
  const instances = currentOverview.instances.map((item) =>
    item.instance.id === detail.instance.id ? detail : item,
  );

  return {
    summary: {
      ...currentOverview.summary,
      total_instances: instances.length,
      ready_instances: instances.filter((item) => item.derived_status === 'ready').length,
      qr_required_instances: instances.filter((item) => item.derived_status === 'qr_required').length,
      degraded_instances: instances.filter((item) =>
        ['degraded', 'disconnected', 'auth_failed'].includes(item.derived_status),
      ).length,
    },
    instances,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function SummaryCard({
  label,
  value,
  helper,
  icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'warning' | 'error' | 'success';
  onClick?: () => void;
}) {
  const tones: Record<NonNullable<typeof tone>, (theme: Theme) => { background: string; border: string }> = {
    default: (theme) => ({
      background: theme.palette.background.paper,
      border: alpha(theme.palette.divider, 1),
    }),
    warning: (theme) => ({
      background: alpha(theme.palette.warning.main, 0.08),
      border: alpha(theme.palette.warning.main, 0.3),
    }),
    error: (theme) => ({
      background: alpha(theme.palette.error.main, 0.08),
      border: alpha(theme.palette.error.main, 0.3),
    }),
    success: (theme) => ({
      background: alpha(theme.palette.success.main, 0.08),
      border: alpha(theme.palette.success.main, 0.3),
    }),
  };

  const content = (
    <Card
      elevation={0}
      sx={(theme) => ({
        height: '100%',
        borderRadius: 3,
        border: `1px solid ${tones[tone](theme).border}`,
        backgroundColor: tones[tone](theme).background,
      })}
    >
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Box>
            <Typography color="text.secondary" variant="body2">
              {label}
            </Typography>
            <Typography sx={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{value}</Typography>
            {helper ? (
              <Typography color="text.secondary" variant="caption">
                {helper}
              </Typography>
            ) : null}
          </Box>
          <Box sx={{ color: 'text.secondary' }}>{icon}</Box>
        </Stack>
      </CardContent>
    </Card>
  );

  if (!onClick) {
    return content;
  }

  return (
    <CardActionArea onClick={onClick} sx={{ borderRadius: 3 }}>
      {content}
    </CardActionArea>
  );
}

export default function WhatsappDashboard({
  initialOverview,
  initialOutbound,
  initialEvents,
  initialRenderedAt,
}: WhatsappDashboardProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [outbound, setOutbound] = useState(initialOutbound);
  const [selectedInstanceId, setSelectedInstanceId] = useState(
    initialOverview.instances[0]?.instance.id || null,
  );
  const [selectedDetail, setSelectedDetail] = useState<WhatsappInstanceSummary | null>(
    initialOverview.instances[0] || null,
  );
  const [events, setEvents] = useState(initialEvents);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [outboundFilter, setOutboundFilter] = useState<OutboundFilter>('all');
  const [detailTab, setDetailTab] = useState<DetailTab>('ringkasan');
  const initialSelectedInstanceId = initialOverview.instances[0]?.instance.id || null;
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState(initialRenderedAt);
  const [detailUpdatedAt, setDetailUpdatedAt] = useState(initialRenderedAt);
  const [eventsUpdatedAt, setEventsUpdatedAt] = useState(initialRenderedAt);
  const [outboundUpdatedAt, setOutboundUpdatedAt] = useState(initialRenderedAt);
  const [eventsInstanceId, setEventsInstanceId] = useState<string | null>(initialSelectedInstanceId);

  useEffect(() => {
    if (!selectedInstanceId) {
      return;
    }

    if (detailTab === 'aktivitas' && eventsInstanceId !== selectedInstanceId) {
      let cancelled = false;

      const loadEvents = async () => {
        try {
          const eventsResponse = await fetchJson<{ instance_id: string; events: WhatsappInstanceEventRecord[] }>(
            `/api/admin/whatsapp/instances/${selectedInstanceId}/events`,
          );

          if (cancelled) {
            return;
          }

          setEvents(eventsResponse.events);
          setEventsInstanceId(selectedInstanceId);
          setEventsUpdatedAt(new Date().toISOString());
          setErrorMessage(null);
        } catch (error) {
          if (!cancelled) {
            setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat aktivitas perangkat.');
          }
        }
      };

      void loadEvents();
      return () => {
        cancelled = true;
      };
    }

  }, [detailTab, eventsInstanceId, selectedInstanceId]);

  const selectedDerivedStatus = selectedDetail?.derived_status;

  useEffect(() => {
    if (
      !selectedInstanceId ||
      detailTab !== 'ringkasan' ||
      !selectedDerivedStatus ||
      !['qr_required', 'auth_failed'].includes(selectedDerivedStatus)
    ) {
      return;
    }

    const eventSource = new EventSource(`/api/admin/whatsapp/instances/${selectedInstanceId}/qr-stream`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { detail?: WhatsappInstanceSummary; error?: string };

        if (payload.error) {
          setErrorMessage(payload.error);
          return;
        }

        if (!payload.detail) {
          return;
        }

        const updatedAt = new Date().toISOString();
        setSelectedDetail(payload.detail);
        setOverview((currentOverview) => updateOverviewWithDetail(currentOverview, payload.detail));
        setDetailUpdatedAt(updatedAt);
        setErrorMessage(null);
      } catch {
        setErrorMessage('Gagal membaca pembaruan QR secara langsung.');
      }
    };

    eventSource.onerror = () => {
      setErrorMessage('Sambungan QR langsung terputus. Gunakan tombol perbarui jika diperlukan.');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [detailTab, selectedDerivedStatus, selectedInstanceId]);

  const sortedInstances = useMemo(
    () =>
      [...overview.instances].sort((a, b) => {
        const statusRankDiff =
          getStatusPresentation(a.derived_status).rank - getStatusPresentation(b.derived_status).rank;

        if (statusRankDiff !== 0) {
          return statusRankDiff;
        }

        return getPendingMessageCount(b) - getPendingMessageCount(a);
      }),
    [overview.instances],
  );

  const criticalInstances = useMemo(
    () => sortedInstances.filter((instance) => isCriticalInstance(instance)),
    [sortedInstances],
  );

  const groupedEvents = useMemo(() => groupEvents(events), [events]);
  const visibleEvents = showAllEvents ? groupedEvents : groupedEvents.slice(0, 5);

  const filteredOutboundItems = useMemo(() => {
    if (!selectedDetail) {
      return [];
    }

    return outbound.items
      .filter((item) => item.whatsapp_instance_id === selectedDetail.instance.id)
      .filter((item) => (outboundFilter === 'all' ? true : item.delivery_status === outboundFilter));
  }, [outbound.items, outboundFilter, selectedDetail]);

  const totalPendingMessages =
    overview.summary.queued_ticket_replies +
    overview.summary.queued_api_notifications +
    outbound.summary.retrying;

  const activePanelUpdatedAt = useMemo(() => {
    if (detailTab === 'aktivitas') {
      return eventsUpdatedAt;
    }

    if (detailTab === 'pengiriman') {
      return outboundUpdatedAt;
    }

    return detailUpdatedAt;
  }, [detailTab, detailUpdatedAt, eventsUpdatedAt, outboundUpdatedAt]);
  const overviewNowMs = Date.parse(overviewUpdatedAt);
  const activePanelNowMs = Date.parse(activePanelUpdatedAt);

  const refreshOverview = async () => {
    const nextOverview = await fetchJson<WhatsappDashboardOverview>('/api/admin/whatsapp/instances');
    setOverview(nextOverview);
    setOverviewUpdatedAt(new Date().toISOString());

    const selectedStillExists = nextOverview.instances.some(
      (instance) => instance.instance.id === selectedInstanceId,
    );

    if (!selectedStillExists) {
      const nextSelected = nextOverview.instances[0] || null;
      setSelectedInstanceId(nextSelected?.instance.id || null);
      setSelectedDetail(nextSelected);
      setEvents([]);
      setEventsInstanceId(nextSelected?.instance.id || null);
      setShowQr(false);
      return;
    }

    if (selectedInstanceId) {
      const nextSelected = nextOverview.instances.find((instance) => instance.instance.id === selectedInstanceId);
      if (nextSelected) {
        setSelectedDetail((current) =>
          current && current.instance.id === nextSelected.instance.id ? current : nextSelected,
        );
      }
    }
  };

  const refreshSelectedDetail = async (instanceId = selectedInstanceId) => {
    if (!instanceId) {
      return;
    }

    const detailResponse = await fetchJson<WhatsappInstanceSummary>(`/api/admin/whatsapp/instances/${instanceId}`);
    setSelectedDetail(detailResponse);
    setOverview((currentOverview) => updateOverviewWithDetail(currentOverview, detailResponse));
    setDetailUpdatedAt(new Date().toISOString());
  };

  const refreshEvents = async (instanceId = selectedInstanceId) => {
    if (!instanceId) {
      return;
    }

    const eventsResponse = await fetchJson<{ instance_id: string; events: WhatsappInstanceEventRecord[] }>(
      `/api/admin/whatsapp/instances/${instanceId}/events`,
    );
    setEvents(eventsResponse.events);
    setEventsInstanceId(instanceId);
    setEventsUpdatedAt(new Date().toISOString());
  };

  const refreshOutbound = async () => {
    const nextOutbound = await fetchJson<OutboundResponse>('/api/admin/whatsapp/outbound');
    setOutbound(nextOutbound);
    setOutboundUpdatedAt(new Date().toISOString());
  };

  const handleManualRefresh = async () => {
    try {
      await refreshOverview();

      if (detailTab === 'aktivitas') {
        await Promise.all([refreshSelectedDetail(), refreshEvents()]);
      } else if (detailTab === 'pengiriman') {
        await Promise.all([refreshSelectedDetail(), refreshOutbound()]);
      } else {
        await refreshSelectedDetail();
      }

      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal memperbarui data dashboard.');
    }
  };

  const selectInstance = (instanceSummary: WhatsappInstanceSummary) => {
    setSelectedInstanceId(instanceSummary.instance.id);
    setSelectedDetail(instanceSummary);
    setShowQr(instanceSummary.derived_status === 'qr_required' || instanceSummary.derived_status === 'auth_failed');
    setShowAllEvents(false);
    setDetailTab('ringkasan');
    void refreshSelectedDetail(instanceSummary.instance.id).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat detail perangkat.');
    });
  };

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 4 } }}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Status Operasional WhatsApp
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 760 }}>
          Pantau koneksi perangkat, lihat masalah yang perlu ditangani, dan buka detail percakapan atau antrean pesan
          dengan cepat.
        </Typography>
      </Box>

      <Paper
        sx={{
          p: 2,
          borderRadius: 3,
          border: (theme) => `1px solid ${alpha(theme.palette.divider, 1)}`,
          background: (theme) =>
            `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.06)}, ${alpha(theme.palette.background.paper, 0.96)})`,
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
        >
          <Box>
            <Typography variant="subtitle2">Terakhir diperbarui</Typography>
            <Typography color="text.secondary" variant="body2">
              Ringkasan halaman: {formatDateTime(overviewUpdatedAt)}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Panel aktif: {formatDateTime(activePanelUpdatedAt)}
            </Typography>
          </Box>
          <Button variant="contained" onClick={() => void handleManualRefresh()}>
            Perbarui Sekarang
          </Button>
        </Stack>
      </Paper>

      {errorMessage ? <Alert severity="warning">{errorMessage}</Alert> : null}

      <Paper
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: (theme) => `1px solid ${alpha(theme.palette.divider, 1)}`,
        }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6">Butuh Perhatian Sekarang</Typography>
            <Typography color="text.secondary" variant="body2">
              Fokus pada perangkat yang perlu tindakan lebih dulu.
            </Typography>
          </Box>

          {criticalInstances.length ? (
            <Grid container spacing={2}>
              {criticalInstances.slice(0, 4).map((instance) => {
                const status = getStatusPresentation(instance.derived_status);
                return (
                  <Grid key={instance.instance.id} size={{ xs: 12, md: 6 }}>
                    <Card
                      elevation={0}
                      sx={(theme) => ({
                        height: '100%',
                        borderRadius: 3,
                        border: `1px solid ${alpha(
                          status.color === 'error'
                            ? theme.palette.error.main
                            : theme.palette.warning.main,
                          0.3,
                        )}`,
                        backgroundColor: alpha(
                          status.color === 'error'
                            ? theme.palette.error.main
                            : theme.palette.warning.main,
                          0.08,
                        ),
                      })}
                    >
                      <CardActionArea sx={{ height: '100%' }} onClick={() => selectInstance(instance)}>
                        <CardContent>
                          <Stack spacing={1.5}>
                            <Stack direction="row" justifyContent="space-between" spacing={2}>
                              <Box>
                                <Typography fontWeight={700}>{instance.instance.label}</Typography>
                                <Typography color="text.secondary" variant="body2">
                                  {status.shortAction}
                                </Typography>
                              </Box>
                              <Chip color={status.color} label={status.label} size="small" />
                            </Stack>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              <Chip
                                icon={<ScheduleRoundedIcon />}
                                label={`Aktivitas terakhir ${formatAgeWithNow(getLastActivityAt(instance), overviewNowMs)}`}
                                size="small"
                                variant="outlined"
                              />
                              <Chip
                                label={`${getPendingMessageCount(instance)} pesan perlu dipantau`}
                                size="small"
                                variant="outlined"
                              />
                            </Stack>
                            <Box>
                              <Chip color={status.color} label={getPrimaryActionLabel(instance)} size="small" />
                            </Box>
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          ) : (
            <Alert severity="success">Semua perangkat utama dalam kondisi aman saat ini.</Alert>
          )}
        </Stack>
      </Paper>

      <Box>
        <Typography variant="h6" gutterBottom>
          Ringkasan Hari Ini
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              label="Perangkat Aktif"
              value={overview.summary.ready_instances}
              helper={`${overview.summary.total_instances} perangkat terdaftar`}
              icon={<CheckCircleOutlineRoundedIcon />}
              tone="success"
              onClick={() => {
                const ready = sortedInstances.find((item) => item.derived_status === 'ready');
                if (ready) {
                  selectInstance(ready);
                }
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              label="Perlu Scan Ulang"
              value={overview.summary.qr_required_instances}
              helper="Perangkat belum bisa dipakai sebelum login ulang"
              icon={<QrCode2RoundedIcon />}
              tone={overview.summary.qr_required_instances ? 'warning' : 'default'}
              onClick={() => {
                const next = sortedInstances.find((item) =>
                  ['qr_required', 'auth_failed'].includes(item.derived_status),
                );
                if (next) {
                  selectInstance(next);
                }
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              label="Sedang Bermasalah"
              value={overview.summary.degraded_instances}
              helper="Perangkat terputus, gagal login, atau perlu dicek"
              icon={<ErrorOutlineRoundedIcon />}
              tone={overview.summary.degraded_instances ? 'error' : 'default'}
              onClick={() => {
                const next = sortedInstances.find((item) =>
                  ['degraded', 'disconnected', 'auth_failed'].includes(item.derived_status),
                );
                if (next) {
                  selectInstance(next);
                }
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              label="Pesan Tertunda"
              value={totalPendingMessages}
              helper={`Antrean terlama: ${formatAgeWithNow(overview.summary.oldest_queued_at, overviewNowMs)}`}
              icon={<ScheduleRoundedIcon />}
              tone={totalPendingMessages ? 'warning' : 'default'}
              onClick={() => {
                setOutboundFilter(totalPendingMessages ? 'queued' : 'all');
                setDetailTab('pengiriman');
              }}
            />
          </Grid>
        </Grid>
      </Box>

      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper
            sx={{
              p: 2,
              height: '100%',
              borderRadius: 3,
              border: (theme) => `1px solid ${alpha(theme.palette.divider, 1)}`,
            }}
          >
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6">Daftar Perangkat</Typography>
                <Typography color="text.secondary" variant="body2">
                  Pilih perangkat untuk melihat tindakan, aktivitas, dan status pengiriman.
                </Typography>
              </Box>

              <List disablePadding sx={{ display: 'grid', gap: 1.5 }}>
                {sortedInstances.map((instance) => {
                  const isSelected = selectedInstanceId === instance.instance.id;
                  const status = getStatusPresentation(instance.derived_status);

                  return (
                    <Paper
                      key={instance.instance.id}
                      elevation={0}
                      sx={(theme) => ({
                        overflow: 'hidden',
                        borderRadius: 3,
                        border: `1px solid ${
                          isSelected
                            ? theme.palette.primary.main
                            : alpha(
                                status.color === 'success'
                                  ? theme.palette.success.main
                                  : status.color === 'error'
                                    ? theme.palette.error.main
                                    : status.color === 'warning'
                                      ? theme.palette.warning.main
                                      : theme.palette.divider,
                                isCriticalInstance(instance) ? 0.28 : 0.16,
                              )
                        }`,
                        backgroundColor: isSelected ? alpha(theme.palette.primary.main, 0.06) : theme.palette.background.paper,
                      })}
                    >
                      <ListItemButton
                        selected={isSelected}
                        onClick={() => selectInstance(instance)}
                        sx={{ alignItems: 'stretch', p: 2 }}
                      >
                        <Stack spacing={1.5} sx={{ width: '100%' }}>
                          <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            justifyContent="space-between"
                            alignItems={{ xs: 'flex-start', sm: 'center' }}
                            spacing={1}
                          >
                            <Box>
                              <Typography fontWeight={700}>{instance.instance.label}</Typography>
                              <Typography color="text.secondary" variant="body2">
                                Aktivitas terakhir {formatAgeWithNow(getLastActivityAt(instance), overviewNowMs)}
                              </Typography>
                            </Box>
                            <Chip color={status.color} label={status.label} size="small" />
                          </Stack>

                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`${getPendingMessageCount(instance)} pesan tertunda`} size="small" variant="outlined" />
                            <Chip
                              label={
                                instance.staff.active_ticket_count
                                  ? `${instance.staff.active_ticket_count} tiket aktif`
                                  : 'Tidak ada tiket aktif'
                              }
                              size="small"
                              variant="outlined"
                            />
                            {instance.instance.last_known_phone_number ? (
                              <Chip label={instance.instance.last_known_phone_number} size="small" variant="outlined" />
                            ) : null}
                          </Stack>

                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography color="text.secondary" variant="caption">
                              {status.shortAction}
                            </Typography>
                            <Chip color={status.color} label={getPrimaryActionLabel(instance)} size="small" variant="outlined" />
                          </Stack>
                        </Stack>
                      </ListItemButton>
                    </Paper>
                  );
                })}
              </List>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          {selectedDetail ? (
            <Stack spacing={2}>
              <Paper
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: (theme) => `1px solid ${alpha(theme.palette.divider, 1)}`,
                }}
              >
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="h6">Detail Perangkat</Typography>
                    <Typography color="text.secondary" variant="body2">
                      {selectedDetail.instance.label} dipilih untuk ditinjau lebih lanjut.
                    </Typography>
                  </Box>
                  <Paper
                    variant="outlined"
                    sx={{
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <Tabs
                      value={detailTab}
                      onChange={(_, nextValue: DetailTab) => {
                        setDetailTab(nextValue);

                        if (nextValue === 'aktivitas' && selectedInstanceId) {
                          void refreshEvents(selectedInstanceId).catch((error) => {
                            setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat aktivitas perangkat.');
                          });
                        }

                        if (nextValue === 'pengiriman') {
                          void Promise.all([refreshSelectedDetail(), refreshOutbound()]).catch((error) => {
                            setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat status pengiriman.');
                          });
                        }

                        if ((nextValue === 'ringkasan' || nextValue === 'teknis') && selectedInstanceId) {
                          void refreshSelectedDetail(selectedInstanceId).catch((error) => {
                            setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat detail perangkat.');
                          });
                        }
                      }}
                      variant="scrollable"
                      scrollButtons="auto"
                      sx={{
                        px: 1,
                        backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.04),
                      }}
                    >
                      <Tab label="Ringkasan" value="ringkasan" />
                      <Tab label="Aktivitas" value="aktivitas" />
                      <Tab label="Pengiriman" value="pengiriman" />
                      <Tab icon={<TuneRoundedIcon fontSize="small" />} iconPosition="start" label="Teknis" value="teknis" />
                    </Tabs>

                    <Box sx={{ p: 2 }}>
                      {detailTab === 'ringkasan' ? (
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, md: 7 }}>
                            <Card sx={{ height: '100%', borderRadius: 3 }}>
                              <CardContent>
                                <Stack spacing={1.5}>
                                  <Typography variant="h6">Status & Tindakan</Typography>
                                  <Chip
                                    color={getStatusPresentation(selectedDetail.derived_status).color}
                                    label={getStatusPresentation(selectedDetail.derived_status).label}
                                    size="small"
                                    sx={{ alignSelf: 'flex-start' }}
                                  />
                                  <Typography variant="body2">
                                    Tindakan berikutnya: <strong>{getStatusPresentation(selectedDetail.derived_status).shortAction}</strong>
                                  </Typography>
                                  <Typography variant="body2">
                                    Dicek terakhir: <strong>{formatAgeWithNow(selectedDetail.runtime?.last_heartbeat_at || null, activePanelNowMs)}</strong>
                                  </Typography>
                                  <Typography variant="body2">
                                    Nomor terhubung: <strong>{selectedDetail.instance.last_known_phone_number || '-'}</strong>
                                  </Typography>
                                  <Typography variant="body2">
                                    Tiket aktif: <strong>{selectedDetail.staff.active_ticket_count}</strong>
                                  </Typography>
                                  <Typography variant="body2">
                                    Pesan tertunda:{' '}
                                    <strong>{selectedDetail.queue.queued_ticket_replies + selectedDetail.queue.queued_api_notifications}</strong>
                                  </Typography>
                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Button
                                      component={Link}
                                      href={`/ticket?instanceId=${selectedDetail.instance.id}`}
                                      size="small"
                                      variant="outlined"
                                    >
                                      Buka Daftar Tiket
                                    </Button>
                                    {(selectedDetail.derived_status === 'qr_required' ||
                                      selectedDetail.derived_status === 'auth_failed' ||
                                      selectedDetail.has_qr) && (
                                      <Button
                                        variant={showQr ? 'outlined' : 'contained'}
                                        startIcon={<QrCode2RoundedIcon />}
                                        size="small"
                                        onClick={() => setShowQr((current) => !current)}
                                      >
                                        {showQr ? 'Sembunyikan QR' : 'Tampilkan QR'}
                                      </Button>
                                    )}
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                          </Grid>

                          <Grid size={{ xs: 12, md: 5 }}>
                            <Card sx={{ height: '100%', borderRadius: 3 }}>
                              <CardContent>
                                <Stack spacing={1.5}>
                                  <Typography variant="h6">QR & Login</Typography>
                                  <Typography color="text.secondary" variant="body2">
                                    QR hanya ditampilkan saat dibutuhkan agar layar tetap ringkas.
                                  </Typography>
                                  <Typography variant="body2">
                                    QR tersedia: <strong>{selectedDetail.has_qr ? 'Ya' : 'Tidak'}</strong>
                                  </Typography>
                                  <Typography variant="body2">
                                    Dibuat: <strong>{formatDateTime(selectedDetail.runtime?.qr_generated_at || null)}</strong>
                                  </Typography>
                                  <Typography variant="body2">
                                    Berakhir: <strong>{formatDateTime(selectedDetail.runtime?.qr_expires_at || null)}</strong>
                                  </Typography>

                                  <Collapse in={showQr}>
                                    <Stack spacing={1.5} sx={{ pt: 1 }}>
                                      {selectedDetail.runtime?.qr_terminal ? (
                                        <Box
                                          component="pre"
                                          sx={{
                                            p: 1.5,
                                            overflowX: 'auto',
                                            borderRadius: 2,
                                            backgroundColor: '#111',
                                            color: '#f4f4f4',
                                            fontSize: 7,
                                            lineHeight: 0.8,
                                            maxHeight: 220,
                                          }}
                                        >
                                          {selectedDetail.runtime.qr_terminal}
                                        </Box>
                                      ) : (
                                        <Alert severity="info">QR belum tersedia untuk perangkat ini.</Alert>
                                      )}
                                    </Stack>
                                  </Collapse>
                                </Stack>
                              </CardContent>
                            </Card>
                          </Grid>
                        </Grid>
                      ) : null}

                      {detailTab === 'aktivitas' ? (
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, md: 5 }}>
                            <Card sx={{ height: '100%', borderRadius: 3 }}>
                              <CardContent>
                                <Stack spacing={1.5}>
                                  <Typography variant="h6">Aktivitas Terakhir</Typography>
                                  <Typography variant="body2">
                                    Pesan masuk terakhir: <strong>{formatAgeWithNow(selectedDetail.staff.latest_inbound_at, activePanelNowMs)}</strong>
                                  </Typography>
                                  <Typography variant="body2">
                                    Pesan keluar terakhir: <strong>{formatAgeWithNow(selectedDetail.runtime?.last_outbound_at || null, activePanelNowMs)}</strong>
                                  </Typography>
                                  <Typography variant="body2">
                                    Ringkasan pesan: <strong>{selectedDetail.staff.latest_inbound_preview || '-'}</strong>
                                  </Typography>
                                  <Typography variant="body2">
                                    Tiket terbaru:{' '}
                                    {selectedDetail.staff.latest_ticket_id ? (
                                      <Link href={`/ticket/${selectedDetail.staff.latest_ticket_id}`}>
                                        {selectedDetail.staff.latest_ticket_subject || selectedDetail.staff.latest_ticket_id}
                                      </Link>
                                    ) : (
                                      '-'
                                    )}
                                  </Typography>
                                </Stack>
                              </CardContent>
                            </Card>
                          </Grid>

                          <Grid size={{ xs: 12, md: 7 }}>
                            <Card sx={{ height: '100%', borderRadius: 3 }}>
                              <CardContent>
                                <Stack spacing={2}>
                                  <Box>
                                    <Typography variant="h6">Aktivitas Terbaru</Typography>
                                    <Typography color="text.secondary" variant="body2">
                                      Ringkasan singkat aktivitas perangkat terbaru.
                                    </Typography>
                                  </Box>

                                  <List disablePadding>
                                    {visibleEvents.map((event, index) => (
                                      <Box key={event.id}>
                                        {index ? <Divider /> : null}
                                        <Tooltip title={formatDateTime(event.createdAt)} placement="top-start">
                                          <ListItemButton
                                            disableGutters
                                            sx={{ py: 1.5 }}
                                            onClick={() => setShowAllEvents((current) => !current)}
                                          >
                                            <ListItemText
                                              primary={
                                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                                  <Typography fontWeight={600}>{event.title}</Typography>
                                                  {event.count > 1 ? (
                                                    <Chip label={`${event.count} kali`} size="small" variant="outlined" />
                                                  ) : null}
                                                </Stack>
                                              }
                                              secondary={`${event.description} • ${formatAgeWithNow(event.createdAt, activePanelNowMs)}`}
                                            />
                                          </ListItemButton>
                                        </Tooltip>
                                      </Box>
                                    ))}
                                    {!visibleEvents.length ? (
                                      <Typography color="text.secondary" variant="body2">
                                        Belum ada aktivitas yang tercatat.
                                      </Typography>
                                    ) : null}
                                  </List>

                                  {groupedEvents.length > 5 ? (
                                    <Button size="small" onClick={() => setShowAllEvents((current) => !current)}>
                                      {showAllEvents ? 'Tampilkan Lebih Sedikit' : 'Lihat Semua Aktivitas'}
                                    </Button>
                                  ) : null}
                                </Stack>
                              </CardContent>
                            </Card>
                          </Grid>
                        </Grid>
                      ) : null}

                      {detailTab === 'pengiriman' ? (
                        <Stack spacing={2}>
                          <Card sx={{ borderRadius: 3 }}>
                            <CardContent>
                              <Stack spacing={1.5}>
                                <Typography variant="h6">Status Pengiriman</Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  <Chip label={`Tertunda ${selectedDetail.queue.queued_ticket_replies + selectedDetail.queue.queued_api_notifications}`} size="small" color="warning" />
                                  <Chip label={`Coba Lagi ${selectedDetail.queue.retrying_messages}`} size="small" color="warning" variant="outlined" />
                                  <Chip label={`Gagal ${selectedDetail.queue.failed_messages}`} size="small" color="error" />
                                  <Chip label={`Berhasil ${selectedDetail.queue.sent_messages}`} size="small" color="success" />
                                </Stack>
                                <Typography variant="body2">
                                  Balasan tiket tertunda: <strong>{selectedDetail.queue.queued_ticket_replies}</strong>
                                </Typography>
                                <Typography variant="body2">
                                  Notifikasi API tertunda: <strong>{selectedDetail.queue.queued_api_notifications}</strong>
                                </Typography>
                                <Typography variant="body2">
                                  Antrean terlama: <strong>{formatAgeWithNow(selectedDetail.queue.oldest_queued_at, activePanelNowMs)}</strong>
                                </Typography>
                                <Typography variant="body2">
                                  Percobaan sambung ulang 24 jam: <strong>{selectedDetail.runtime?.reconnect_count_24h || 0}</strong>
                                </Typography>
                              </Stack>
                            </CardContent>
                          </Card>

                          <Card sx={{ borderRadius: 3 }}>
                            <CardContent>
                              <Stack spacing={2}>
                                <Box>
                                  <Typography variant="h6">Aktivitas Pengiriman Terbaru</Typography>
                                  <Typography color="text.secondary" variant="body2">
                                    Filter status untuk melihat pesan yang perlu ditindaklanjuti.
                                  </Typography>
                                </Box>

                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  {(Object.keys(OUTBOUND_FILTER_COPY) as OutboundFilter[]).map((filterKey) => (
                                    <Chip
                                      key={filterKey}
                                      clickable
                                      color={outboundFilter === filterKey ? OUTBOUND_FILTER_COPY[filterKey].color || 'default' : 'default'}
                                      label={OUTBOUND_FILTER_COPY[filterKey].label}
                                      onClick={() => setOutboundFilter(filterKey)}
                                      variant={outboundFilter === filterKey ? 'filled' : 'outlined'}
                                    />
                                  ))}
                                </Stack>

                                <TableContainer>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Penerima</TableCell>
                                        <TableCell>Sumber</TableCell>
                                        <TableCell>Referensi</TableCell>
                                        <TableCell>Tiket</TableCell>
                                        <TableCell>Dibuat</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {filteredOutboundItems.slice(0, 8).map((item) => (
                                        <TableRow key={item.id} hover>
                                          <TableCell>{OUTBOUND_FILTER_COPY[item.delivery_status].label}</TableCell>
                                          <TableCell>{item.recipient_phone_number}</TableCell>
                                          <TableCell>{item.source_type === 'ticket_reply' ? 'Balasan Tiket' : item.source_type === 'api_notification' ? 'Notifikasi API' : 'Blast'}</TableCell>
                                          <TableCell>{item.client_reference || '-'}</TableCell>
                                          <TableCell>
                                            {item.ticket_id ? <Link href={`/ticket/${item.ticket_id}`}>{item.ticket_id}</Link> : '-'}
                                          </TableCell>
                                          <TableCell title={item.created_at}>{formatDateTime(item.created_at)}</TableCell>
                                        </TableRow>
                                      ))}
                                      {!filteredOutboundItems.length ? (
                                        <TableRow>
                                          <TableCell colSpan={6}>
                                            <Typography color="text.secondary" variant="body2">
                                              Tidak ada aktivitas pengiriman untuk filter ini.
                                            </Typography>
                                          </TableCell>
                                        </TableRow>
                                      ) : null}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              </Stack>
                            </CardContent>
                          </Card>
                        </Stack>
                      ) : null}

                      {detailTab === 'teknis' ? (
                        <Card sx={{ borderRadius: 3 }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Typography variant="h6">Detail Teknis</Typography>
                              <Typography variant="body2">
                                Worker ID: <strong>{selectedDetail.runtime?.worker_id || selectedDetail.instance.assigned_worker_id || '-'}</strong>
                              </Typography>
                              <Typography variant="body2">
                                Host: <strong>{selectedDetail.runtime?.worker_host || '-'}</strong>
                              </Typography>
                              <Typography variant="body2">
                                Versi Worker: <strong>{selectedDetail.runtime?.worker_version || '-'}</strong>
                              </Typography>
                              <Typography variant="body2">
                                Konflik Worker: <strong>{selectedDetail.runtime?.has_worker_conflict ? 'Ya' : 'Tidak'}</strong>
                              </Typography>
                              <Typography variant="body2">
                                Chat ID: <strong>{selectedDetail.instance.last_known_chat_id || '-'}</strong>
                              </Typography>
                              <Typography variant="body2">
                                Siap sejak: <strong>{formatDateTime(selectedDetail.instance.last_ready_at)}</strong>
                              </Typography>
                              <Typography variant="body2">
                                Terputus terakhir: <strong>{formatDateTime(selectedDetail.instance.last_disconnect_at)}</strong>
                              </Typography>
                              <Typography variant="body2">
                                Error terakhir: <strong>{selectedDetail.runtime?.last_error || selectedDetail.instance.last_error || '-'}</strong>
                              </Typography>
                            </Stack>
                          </CardContent>
                        </Card>
                      ) : null}
                    </Box>
                  </Paper>
                </Stack>
              </Paper>
            </Stack>
          ) : (
            <Alert severity="info">Belum ada perangkat WhatsApp yang dikonfigurasi.</Alert>
          )}
        </Grid>
      </Grid>
    </Stack>
  );
}
