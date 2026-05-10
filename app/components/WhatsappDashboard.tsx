'use client';

import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PauseCircleOutlineRoundedIcon from '@mui/icons-material/PauseCircleOutlineRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  InputAdornment,
  List,
  ListItemButton,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  type AlertColor,
} from '@mui/material';

import {
  adminMetricLabelSx,
  adminMetricTileSx,
  adminMetricValueSx,
  adminPalette,
  adminPanelSx,
  adminSectionLabelSx,
  adminTypographySx,
} from '../lib/adminPalette';
import type {
  WhatsappDashboardOverview,
  WhatsappContainerState,
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
type HealthFilter = 'all' | 'attention' | 'queue' | 'disabled' | 'ready';
type DetailSection = 'overview' | 'deliveries' | 'activity' | 'technical';
type DeleteWhatsappInstanceMode = 'stop_only' | 'remove_runtime_resources' | 'delete_db_row';

type ToastState = {
  severity: AlertColor;
  message: string;
} | null;

type EditorDialogState =
  | {
      mode: 'create';
      id: string;
      label: string;
    }
  | {
      mode: 'rename';
      instanceId: string;
      label: string;
    }
  | null;

type ConfirmActionState =
  | {
      kind: 'toggle-assignment';
      instanceId: string;
      instanceLabel: string;
      nextEnabled: boolean;
    }
  | {
      kind: 'container';
      instanceId: string;
      instanceLabel: string;
      action: 'start' | 'stop' | 'restart';
    }
  | {
      kind: 'retire';
      instanceId: string;
      instanceLabel: string;
      mode: DeleteWhatsappInstanceMode;
    }
  | null;

interface GroupedEvent {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  count: number;
}

const numberFormatter = new Intl.NumberFormat('id-ID');

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
    detail: string;
  }
> = {
  qr_required: {
    label: 'Need QR Login',
    color: 'warning',
    rank: 0,
    shortAction: 'Scan QR to reactivate device.',
    detail: 'Device cannot receive new tasks until a new QR is scanned.',
  },
  auth_failed: {
    label: 'Login Failed',
    color: 'error',
    rank: 0,
    shortAction: 'Scan new QR to log in again.',
    detail: 'Device session failed to recover and requires re-authentication.',
  },
  disconnected: {
    label: 'Disconnected',
    color: 'error',
    rank: 1,
    shortAction: 'Check connection then reconnect worker.',
    detail: 'Worker is not currently connected to the WhatsApp device.',
  },
  degraded: {
    label: 'Needs Attention',
    color: 'warning',
    rank: 1,
    shortAction: 'Check message backlog and worker heartbeat.',
    detail: 'Operational signals indicate decreased device performance.',
  },
  starting: {
    label: 'Starting',
    color: 'default',
    rank: 2,
    shortAction: 'Wait for worker initialization to complete.',
    detail: 'Worker is bootstrapping and not yet fully ready.',
  },
  connecting: {
    label: 'Connecting',
    color: 'info',
    rank: 3,
    shortAction: 'Wait for device session to connect.',
    detail: 'Worker is attempting to establish connection to device.',
  },
  ready: {
    label: 'Healthy',
    color: 'success',
    rank: 4,
    shortAction: 'Monitor queue and recent activity.',
    detail: 'Device is ready to receive assignments and send messages.',
  },
};

const OUTBOUND_FILTER_COPY: Record<
  OutboundFilter,
  { label: string; color: 'default' | 'warning' | 'error' | 'success' }
> = {
  all: { label: 'All', color: 'default' },
  queued: { label: 'Queued Messages', color: 'warning' },
  retrying: { label: 'Retrying', color: 'warning' },
  failed: { label: 'Delivery Issues', color: 'error' },
  sent: { label: 'Delivered', color: 'success' },
};

const OUTBOUND_SOURCE_COPY = {
  ticket_reply: { label: 'Balasan tiket', chipLabel: 'Tiket' },
  api_notification: { label: 'External API', chipLabel: 'API' },
  blast: { label: 'Blast', chipLabel: 'Blast' },
} as const;

const CONTAINER_STATUS_COPY: Record<
  WhatsappContainerState['status'],
  { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'default' }
> = {
  not_configured: { label: 'Orchestrator not configured', color: 'default' },
  not_found: { label: 'Container not created', color: 'warning' },
  created: { label: 'Container created', color: 'info' },
  running: { label: 'Container running', color: 'success' },
  stopped: { label: 'Container stopped', color: 'default' },
  restarting: { label: 'Container restarting', color: 'warning' },
  error: { label: 'Container error', color: 'error' },
};

const HEALTH_FILTER_OPTIONS: Array<{ value: HealthFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'attention', label: 'Need Action' },
  { value: 'queue', label: 'Has Queue' },
  { value: 'disabled', label: 'Paused' },
  { value: 'ready', label: 'Active' },
];

const dashboardTypography = adminTypographySx;

const monoTypography =
  'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const elevatedPanelSx = {
  ...adminPanelSx,
} as const;

const sectionLabelSx = adminSectionLabelSx;

const primaryButtonSx = {
  minHeight: 36,
  borderRadius: 2,
  backgroundColor: adminPalette.brand,
  textTransform: 'none',
  fontWeight: 700,
  boxShadow: 'none',
  '&:hover': {
    backgroundColor: adminPalette.brandDark,
    boxShadow: 'none',
  },
} as const;

const secondaryButtonSx = {
  minHeight: 36,
  borderRadius: 2,
  borderColor: adminPalette.borderStrong,
  color: adminPalette.textSecondary,
  textTransform: 'none',
  fontWeight: 700,
  backgroundColor: adminPalette.surface,
} as const;

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
    instance.queue.queued_blast_messages +
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

function hasQueuePressure(instance: WhatsappInstanceSummary): boolean {
  return getPendingMessageCount(instance) > 0 || instance.queue.failed_messages > 0;
}

function getInstanceOperationalNote(instance: WhatsappInstanceSummary): string {
  if (!instance.runtime) {
    return 'Worker is not active. Start the worker or verify orchestrator availability.';
  }

  if (!instance.instance.is_enabled) {
    return 'New blasts and API notifications are paused for this device.';
  }

  if (instance.queue.failed_messages > 0) {
    return `${instance.queue.failed_messages} recent failed messages need review.`;
  }

  if (getPendingMessageCount(instance) > 0) {
    return `${getPendingMessageCount(instance)} messages are waiting for delivery or retry.`;
  }

  return getStatusPresentation(instance.derived_status).detail;
}

function getRecommendedActionLabel(instance: WhatsappInstanceSummary): string {
  if (!instance.runtime) {
    return 'Start worker';
  }

  if (instance.derived_status === 'qr_required' || instance.derived_status === 'auth_failed') {
    return 'Scan QR';
  }

  if (instance.derived_status === 'disconnected' || instance.derived_status === 'degraded') {
    return 'Check worker';
  }

  if (!instance.instance.is_enabled) {
    return 'Resume assignment';
  }

  if (getPendingMessageCount(instance) > 0) {
    return 'Review queue';
  }

  return 'Monitor status';
}

function getEventCopy(event: WhatsappInstanceEventRecord): { title: string; description: string } {
  switch (event.event_type) {
    case 'qr_issued':
      return {
        title: 'QR baru tersedia',
        description: event.message || 'Perangkat menunggu QR dipindai untuk melanjutkan sesi.',
      };
    case 'ready':
      return {
        title: 'Perangkat aktif kembali',
        description: event.message || 'Perangkat sudah terhubung dan siap dipakai.',
      };
    case 'disconnected':
      return {
        title: 'Perangkat terputus',
        description: event.message || 'Koneksi terputus dan butuh pengecekan worker atau login.',
      };
    case 'auth_failed':
      return {
        title: 'Login perangkat gagal',
        description: event.message || 'Sesi login tidak valid dan perlu QR baru.',
      };
    case 'worker_stale':
      return {
        title: 'Heartbeat worker terlambat',
        description: event.message || 'Sistem terlambat menerima kabar terbaru dari worker.',
      };
    case 'reconnect_started':
      return {
        title: 'Reconnect dimulai',
        description: event.message || 'Worker sedang mencoba menyambungkan perangkat lagi.',
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

    if (previous && previous.title === copy.title && previous.description === copy.description) {
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

function getPreferredSelectedInstance(
  overview: WhatsappDashboardOverview,
  preferredInstanceId: string | null,
): WhatsappInstanceSummary | null {
  return (
    overview.instances.find((instance) => instance.instance.id === preferredInstanceId) ||
    overview.instances[0] ||
    null
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const contentType = response.headers.get('content-type') || '';
  let payload: unknown = null;
  let fallbackText = '';

  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  } else {
    fallbackText = await response.text().catch(() => '');
  }

  if (!response.ok) {
    const payloadRecord = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const errorRecord =
      payloadRecord && payloadRecord.error && typeof payloadRecord.error === 'object'
        ? (payloadRecord.error as Record<string, unknown>)
        : null;

    const message =
      (errorRecord && typeof errorRecord.message === 'string' && errorRecord.message) ||
      (payloadRecord && typeof payloadRecord.message === 'string' && payloadRecord.message) ||
      fallbackText ||
      `Request gagal (${response.status}) untuk ${url}.`;

    throw new Error(message);
  }

  return payload as T;
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={1.5}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', md: 'center' }}
    >
      <Stack spacing={0.45} sx={{ minWidth: 0 }}>
        {eyebrow ? <Typography sx={sectionLabelSx}>{eyebrow}</Typography> : null}
        <Typography
          sx={{
            ...dashboardTypography,
            fontSize: { xs: '1.02rem', md: '1.12rem' },
            fontWeight: 800,
            lineHeight: 1.15,
            color: adminPalette.textPrimary,
          }}
        >
          {title}
        </Typography>
        {description ? (
          <Typography sx={{ fontSize: '0.84rem', lineHeight: 1.55, color: adminPalette.textSecondary }}>
            {description}
          </Typography>
        ) : null}
      </Stack>
      {action ? <Box sx={{ width: { xs: '100%', md: 'auto' } }}>{action}</Box> : null}
    </Stack>
  );
}

function MetricTile({
  label,
  value,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: 'default' | 'warning' | 'error' | 'success';
  onClick?: () => void;
}) {
  const valueColor = {
    default: adminPalette.brandDark,
    warning: adminPalette.warningText,
    error: adminPalette.dangerText,
    success: adminPalette.successText,
  }[tone];

  const content = (
    <Box className="metric-tile-content">
      <Typography sx={adminMetricLabelSx}>{label}</Typography>
      <Typography sx={{ ...adminMetricValueSx, color: valueColor }}>
        {typeof value === 'number' ? numberFormatter.format(value) : value}
      </Typography>
    </Box>
  );

  if (!onClick) {
    return <Box sx={adminMetricTileSx}>{content}</Box>;
  }

  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        ...adminMetricTileSx,
        width: 'auto',
        display: 'block',
        borderRadius: 1.5,
        transition: 'background-color 160ms ease',
        textAlign: 'left',
        '&:hover': {
          backgroundColor: adminPalette.brandSoft,
        },
      }}
    >
      {content}
    </ButtonBase>
  );
}

function DetailStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Stack spacing={0.45} sx={{ minWidth: 0 }}>
      <Typography sx={sectionLabelSx}>
        {label}
      </Typography>
      <Typography sx={{ ...dashboardTypography, fontSize: '0.98rem', fontWeight: 800, color: adminPalette.textPrimary, wordBreak: 'break-word', lineHeight: 1.25 }}>
        {value}
      </Typography>
      {helper ? (
        <Typography sx={{ fontSize: '0.8rem', lineHeight: 1.45, color: adminPalette.textSecondary }}>
          {helper}
        </Typography>
      ) : null}
    </Stack>
  );
}

function getStatusChipSx(color: 'success' | 'warning' | 'error' | 'info' | 'default') {
  const colors = {
    success: { color: adminPalette.successText, backgroundColor: adminPalette.successBg, borderColor: adminPalette.successBorder },
    warning: { color: adminPalette.warningText, backgroundColor: adminPalette.warningBg, borderColor: adminPalette.warningBorder },
    error: { color: adminPalette.dangerText, backgroundColor: adminPalette.dangerBg, borderColor: adminPalette.dangerBorder },
    info: { color: adminPalette.brandDark, backgroundColor: adminPalette.brandSoft, borderColor: adminPalette.brandSoftStrong },
    default: { color: adminPalette.textSecondary, backgroundColor: adminPalette.surfaceSoft, borderColor: adminPalette.border },
  }[color];

  return {
    height: 22,
    borderRadius: 999,
    fontSize: '0.68rem',
    fontWeight: 700,
    border: `1px solid ${colors.borderColor}`,
    color: colors.color,
    backgroundColor: colors.backgroundColor,
    '& .MuiChip-label': { px: 1 },
  } as const;
}

export default function WhatsappDashboard({
  initialOverview,
  initialOutbound,
  initialEvents,
  initialRenderedAt,
}: WhatsappDashboardProps) {
  const initialSelected = initialOverview.instances[0] || null;
  const activeSelectionRef = useRef<string | null>(initialSelected?.instance.id || null);
  const [overview, setOverview] = useState(initialOverview);
  const [outbound, setOutbound] = useState(initialOutbound);
  const [selectedInstanceId, setSelectedInstanceId] = useState(initialSelected?.instance.id || null);
  const [selectedDetail, setSelectedDetail] = useState<WhatsappInstanceSummary | null>(initialSelected);
  const [events, setEvents] = useState(initialEvents);
  const [eventsInstanceId, setEventsInstanceId] = useState(initialSelected?.instance.id || null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [showQr, setShowQr] = useState(
    Boolean(initialSelected && ['qr_required', 'auth_failed'].includes(initialSelected.derived_status)),
  );
  const [qrImage, setQrImage] = useState<{ code: string; src: string } | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [outboundFilter, setOutboundFilter] = useState<OutboundFilter>('all');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [detailSection, setDetailSection] = useState<DetailSection>('overview');
  const [instanceSearch, setInstanceSearch] = useState('');
  const deferredInstanceSearch = useDeferredValue(instanceSearch.trim().toLowerCase());
  const [editorDialog, setEditorDialog] = useState<EditorDialogState>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [containerState, setContainerState] = useState<WhatsappContainerState | null>(null);
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState(initialRenderedAt);
  const [detailUpdatedAt, setDetailUpdatedAt] = useState(initialRenderedAt);
  const [eventsUpdatedAt, setEventsUpdatedAt] = useState(initialRenderedAt);
  const [outboundUpdatedAt, setOutboundUpdatedAt] = useState(initialRenderedAt);
  const [containerUpdatedAt, setContainerUpdatedAt] = useState(initialRenderedAt);

  const setSelectedInstance = (instance: WhatsappInstanceSummary | null) => {
    activeSelectionRef.current = instance?.instance.id || null;
    setSelectedInstanceId(instance?.instance.id || null);
    setSelectedDetail(instance);
  };

  useEffect(() => {
    if (overview.instances.length === 0) {
      setSelectedInstance(null);
      setEvents([]);
      setEventsInstanceId(null);
      setContainerState(null);
      setShowQr(false);
      return;
    }

    if (!selectedInstanceId) {
      const nextSelected = overview.instances[0];
      setSelectedInstance(nextSelected);
      setShowQr(['qr_required', 'auth_failed'].includes(nextSelected.derived_status));
      return;
    }

    const nextSelected = overview.instances.find((instance) => instance.instance.id === selectedInstanceId);
    if (!nextSelected) {
      const fallback = overview.instances[0] || null;
      setSelectedInstance(fallback);
      setEvents([]);
      setEventsInstanceId(null);
      setContainerState(null);
      setShowQr(Boolean(fallback && ['qr_required', 'auth_failed'].includes(fallback.derived_status)));
    }
  }, [overview.instances, selectedInstanceId]);

  useEffect(() => {
    const selectedDerivedStatus = selectedDetail?.derived_status;

    if (
      !selectedInstanceId ||
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

        if (!payload.detail || activeSelectionRef.current !== payload.detail.instance.id) {
          return;
        }

        const detail = payload.detail;
        const updatedAt = new Date().toISOString();
        setSelectedDetail(detail);
        setOverview((currentOverview) => updateOverviewWithDetail(currentOverview, detail));
        setDetailUpdatedAt(updatedAt);
        setErrorMessage(null);
      } catch {
        setErrorMessage('Gagal membaca pembaruan QR secara langsung.');
      }
    };

    eventSource.onerror = () => {
      setErrorMessage('Sambungan pembaruan QR terputus. Gunakan refresh bila QR belum berubah.');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [selectedDetail?.derived_status, selectedInstanceId]);

  useEffect(() => {
    const qrCode = selectedDetail?.runtime?.qr_code;

    if (!qrCode) {
      return;
    }

    let cancelled = false;

    const renderQrImage = async () => {
      try {
        const nextImageSrc = await QRCode.toDataURL(qrCode, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 320,
        });

        if (!cancelled) {
          setQrImage({ code: qrCode, src: nextImageSrc });
        }
      } catch {
        // Keep terminal output as a fallback when image generation fails.
      }
    };

    void renderQrImage();

    return () => {
      cancelled = true;
    };
  }, [selectedDetail?.runtime?.qr_code]);

  const qrImageSrc =
    qrImage && qrImage.code === selectedDetail?.runtime?.qr_code ? qrImage.src : null;

  const sortedInstances = useMemo(
    () =>
      [...overview.instances].sort((a, b) => {
        const statusRankDiff =
          getStatusPresentation(a.derived_status).rank - getStatusPresentation(b.derived_status).rank;

        if (statusRankDiff !== 0) {
          return statusRankDiff;
        }

        const backlogDiff = getPendingMessageCount(b) - getPendingMessageCount(a);
        if (backlogDiff !== 0) {
          return backlogDiff;
        }

        return Date.parse(getLastActivityAt(b) || '') - Date.parse(getLastActivityAt(a) || '');
      }),
    [overview.instances],
  );

  const filteredInstances = useMemo(() => {
    return sortedInstances.filter((instance) => {
      if (healthFilter === 'attention' && !isCriticalInstance(instance)) {
        return false;
      }

      if (healthFilter === 'queue' && !hasQueuePressure(instance)) {
        return false;
      }

      if (healthFilter === 'disabled' && instance.instance.is_enabled) {
        return false;
      }

      if (healthFilter === 'ready' && instance.derived_status !== 'ready') {
        return false;
      }

      if (!deferredInstanceSearch) {
        return true;
      }

      const haystack = [
        instance.instance.label,
        instance.instance.id,
        instance.instance.last_known_phone_number || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(deferredInstanceSearch);
    });
  }, [deferredInstanceSearch, healthFilter, sortedInstances]);

  const criticalInstances = useMemo(
    () => sortedInstances.filter((instance) => isCriticalInstance(instance)).slice(0, 4),
    [sortedInstances],
  );

  const groupedEvents = useMemo(() => groupEvents(events), [events]);
  const visibleEvents = showAllEvents ? groupedEvents : groupedEvents.slice(0, 6);

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
    overview.summary.queued_blast_messages +
    outbound.summary.retrying;

  const overviewNowMs = Date.parse(overviewUpdatedAt);
  const detailNowMs = Date.parse(detailUpdatedAt);
  const eventsNowMs = Date.parse(eventsUpdatedAt);
  const outboundNowMs = Date.parse(outboundUpdatedAt);
  const selectedInstanceName = selectedDetail?.instance.label || 'perangkat ini';

  const pushToast = (severity: AlertColor, message: string) => {
    setToast({ severity, message });
  };

  const refreshOverview = async (): Promise<WhatsappDashboardOverview> => {
    const nextOverview = await fetchJson<WhatsappDashboardOverview>('/api/admin/whatsapp/instances');
    const updatedAt = new Date().toISOString();
    const nextSelected = getPreferredSelectedInstance(nextOverview, activeSelectionRef.current);

    setOverview(nextOverview);
    setOverviewUpdatedAt(updatedAt);

    if (!nextSelected) {
      setSelectedInstance(null);
      setEvents([]);
      setEventsInstanceId(null);
      setContainerState(null);
      setShowQr(false);
      return nextOverview;
    }

    activeSelectionRef.current = nextSelected.instance.id;
    setSelectedInstanceId(nextSelected.instance.id);
    setSelectedDetail((current) => {
      if (current && current.instance.id === nextSelected.instance.id) {
        return current;
      }

      return nextSelected;
    });

    return nextOverview;
  };

  const refreshSelectedDetail = async (instanceId: string) => {
    const detailResponse = await fetchJson<WhatsappInstanceSummary>(`/api/admin/whatsapp/instances/${instanceId}`);
    setOverview((currentOverview) => updateOverviewWithDetail(currentOverview, detailResponse));

    if (activeSelectionRef.current === instanceId) {
      setSelectedDetail(detailResponse);
      setDetailUpdatedAt(new Date().toISOString());
    }

    return detailResponse;
  };

  const refreshEvents = async (instanceId: string) => {
    const eventsResponse = await fetchJson<{ instance_id: string; events: WhatsappInstanceEventRecord[] }>(
      `/api/admin/whatsapp/instances/${instanceId}/events`,
    );

    if (activeSelectionRef.current === instanceId) {
      setEvents(eventsResponse.events);
      setEventsInstanceId(instanceId);
      setEventsUpdatedAt(new Date().toISOString());
    }

    return eventsResponse.events;
  };

  const refreshOutbound = async () => {
    const nextOutbound = await fetchJson<OutboundResponse>('/api/admin/whatsapp/outbound');
    setOutbound(nextOutbound);
    setOutboundUpdatedAt(new Date().toISOString());
    return nextOutbound;
  };

  const refreshContainerState = async (instanceId: string) => {
    const nextContainerState = await fetchJson<WhatsappContainerState>(
      `/api/admin/whatsapp/instances/${instanceId}/container`,
    );

    if (activeSelectionRef.current === instanceId) {
      setContainerState(nextContainerState);
      setContainerUpdatedAt(new Date().toISOString());
    }

    return nextContainerState;
  };

  const loadSelectedWorkspace = async (instanceId: string) => {
    await Promise.all([
      refreshSelectedDetail(instanceId),
      refreshEvents(instanceId),
      refreshOutbound(),
      refreshContainerState(instanceId),
    ]);
  };

  const handleManualRefresh = async () => {
    try {
      setRefreshing(true);
      const nextOverview = await refreshOverview();
      const nextSelected = getPreferredSelectedInstance(nextOverview, activeSelectionRef.current);

      if (nextSelected) {
        await loadSelectedWorkspace(nextSelected.instance.id);
      } else {
        await refreshOutbound();
      }

      setErrorMessage(null);
      pushToast('success', 'Dashboard WhatsApp berhasil diperbarui.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memperbarui data dashboard.';
      setErrorMessage(message);
      pushToast('error', message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSelectInstance = (instanceSummary: WhatsappInstanceSummary) => {
    setSelectedInstance(instanceSummary);
    setEvents([]);
    setEventsInstanceId(null);
    setContainerState(null);
    setShowQr(['qr_required', 'auth_failed'].includes(instanceSummary.derived_status));
    setShowAllEvents(false);
    setDetailSection('overview');
    setErrorMessage(null);

    void loadSelectedWorkspace(instanceSummary.instance.id).catch((error) => {
      const message = error instanceof Error ? error.message : 'Gagal memuat detail perangkat.';
      setErrorMessage(message);
      pushToast('error', message);
    });
  };

  const openCreateDialog = () => {
    setEditorDialog({ mode: 'create', id: '', label: '' });
    setErrorMessage(null);
  };

  const openRenameDialog = () => {
    if (!selectedDetail) {
      return;
    }

    setEditorDialog({
      mode: 'rename',
      instanceId: selectedDetail.instance.id,
      label: selectedDetail.instance.label,
    });
    setErrorMessage(null);
  };

  const handleSaveEditorDialog = async () => {
    if (!editorDialog) {
      return;
    }

    try {
      if (editorDialog.mode === 'create') {
        const id = editorDialog.id.trim();
        const label = editorDialog.label.trim();

        if (!id || !label) {
          throw new Error('Instance ID dan nama perangkat wajib diisi.');
        }

        setBusyAction('create-instance');
        const createdInstance = await fetchJson<WhatsappInstanceSummary['instance']>('/api/admin/whatsapp/instances', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, label, is_enabled: true }),
        });

        setEditorDialog(null);
        const nextOverview = await refreshOverview();
        const createdOverviewItem = getPreferredSelectedInstance(nextOverview, createdInstance.id);

        activeSelectionRef.current = createdInstance.id;
        setSelectedInstanceId(createdInstance.id);
        if (createdOverviewItem) {
          setSelectedDetail(createdOverviewItem);
        }
        setShowQr(false);
        setShowAllEvents(false);
        await loadSelectedWorkspace(createdInstance.id);
        setErrorMessage(null);
        pushToast('success', `Instance ${label} berhasil ditambahkan.`);
        return;
      }

      const label = editorDialog.label.trim();
      if (!label) {
        throw new Error('Nama perangkat wajib diisi.');
      }

      setBusyAction('rename-instance');
      const updatedInstance = await fetchJson<WhatsappInstanceSummary['instance']>(
        `/api/admin/whatsapp/instances/${editorDialog.instanceId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ label }),
        },
      );

      setSelectedDetail((current) =>
        current && current.instance.id === editorDialog.instanceId
          ? { ...current, instance: updatedInstance }
          : current,
      );
      setOverview((currentOverview) => ({
        ...currentOverview,
        instances: currentOverview.instances.map((item) =>
          item.instance.id === editorDialog.instanceId
            ? { ...item, instance: updatedInstance }
            : item,
        ),
      }));
      setEditorDialog(null);
      setErrorMessage(null);
      pushToast('success', `Nama perangkat diperbarui menjadi ${label}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan perubahan perangkat.';
      setErrorMessage(message);
      pushToast('error', message);
    } finally {
      setBusyAction(null);
    }
  };

  const openToggleAssignmentDialog = () => {
    if (!selectedDetail) {
      return;
    }

    setConfirmInput('');
    setConfirmAction({
      kind: 'toggle-assignment',
      instanceId: selectedDetail.instance.id,
      instanceLabel: selectedDetail.instance.label,
      nextEnabled: !selectedDetail.instance.is_enabled,
    });
  };

  const openContainerActionDialog = (action: 'start' | 'stop' | 'restart') => {
    if (!selectedDetail) {
      return;
    }

    setConfirmInput('');
    setConfirmAction({
      kind: 'container',
      instanceId: selectedDetail.instance.id,
      instanceLabel: selectedDetail.instance.label,
      action,
    });
  };

  const openRetireDialog = (mode: DeleteWhatsappInstanceMode) => {
    if (!selectedDetail) {
      return;
    }

    setConfirmInput('');
    setConfirmAction({
      kind: 'retire',
      instanceId: selectedDetail.instance.id,
      instanceLabel: selectedDetail.instance.label,
      mode,
    });
  };

  const confirmDialogConfig = useMemo(() => {
    if (!confirmAction) {
      return null;
    }

    if (confirmAction.kind === 'toggle-assignment') {
      return confirmAction.nextEnabled
        ? {
            title: `Resume assignment untuk ${confirmAction.instanceLabel}?`,
            description:
              'Blast dan notifikasi API baru akan kembali diarahkan ke perangkat ini. Pesan tiket yang sudah ada tidak berubah.',
            confirmLabel: 'Resume assignment',
            color: 'primary' as const,
            requiresText: null,
          }
        : {
            title: `Pause assignment untuk ${confirmAction.instanceLabel}?`,
            description:
              'Blast dan notifikasi API baru tidak akan diarahkan ke perangkat ini. Antrean lama dan tiket yang sudah memakai instance ini tetap berjalan seperti biasa.',
            confirmLabel: 'Pause assignment',
            color: 'warning' as const,
            requiresText: null,
          };
    }

    if (confirmAction.kind === 'container') {
      const copy = {
        start: {
          title: `Start worker ${confirmAction.instanceLabel}?`,
          description: 'Sistem akan mencoba menyalakan worker container untuk instance ini.',
          confirmLabel: 'Start worker',
          color: 'primary' as const,
        },
        restart: {
          title: `Restart worker ${confirmAction.instanceLabel}?`,
          description:
            'Worker akan di-restart. Sesi auth tetap dipertahankan, tetapi mungkin ada jeda singkat pada pengiriman.',
          confirmLabel: 'Restart worker',
          color: 'warning' as const,
        },
        stop: {
          title: `Stop worker ${confirmAction.instanceLabel}?`,
          description:
            'Worker akan dihentikan. Assignment baru tidak otomatis dipause, jadi gunakan ini hanya bila Anda paham dampaknya.',
          confirmLabel: 'Stop worker',
          color: 'warning' as const,
        },
      };

      return { ...copy[confirmAction.action], requiresText: null };
    }

    const copy = {
      stop_only: {
        title: `Retire perangkat ${confirmAction.instanceLabel}?`,
        description:
          'Assignment baru akan dipause dan worker dihentikan. Data database serta auth volume tetap disimpan.',
        confirmLabel: 'Retire perangkat',
        color: 'warning' as const,
        requiresText: null,
      },
      remove_runtime_resources: {
        title: `Hapus runtime ${confirmAction.instanceLabel}?`,
        description:
          'Container dan auth volume akan dihapus, tetapi row database dan histori pengiriman tetap disimpan.',
        confirmLabel: 'Hapus runtime',
        color: 'error' as const,
        requiresText: null,
      },
      delete_db_row: {
        title: `Hapus permanen ${confirmAction.instanceLabel}?`,
        description:
          'Gunakan hanya untuk instance test yang belum dipakai. Row database akan dihapus permanen dan tidak bisa dipulihkan dari layar ini.',
        confirmLabel: 'Hapus permanen',
        color: 'error' as const,
        requiresText: confirmAction.instanceId,
      },
    };

    return copy[confirmAction.mode];
  }, [confirmAction]);

  const handleConfirmDialog = async () => {
    if (!confirmAction || !confirmDialogConfig) {
      return;
    }

    if (confirmDialogConfig.requiresText && confirmInput.trim() !== confirmDialogConfig.requiresText) {
      const message = `Ketik ${confirmDialogConfig.requiresText} dengan tepat untuk melanjutkan.`;
      setErrorMessage(message);
      pushToast('error', message);
      return;
    }

    try {
      if (confirmAction.kind === 'toggle-assignment') {
        setBusyAction('toggle-assignment');
        const updatedInstance = await fetchJson<WhatsappInstanceSummary['instance']>(
          `/api/admin/whatsapp/instances/${confirmAction.instanceId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ is_enabled: confirmAction.nextEnabled }),
          },
        );

        setSelectedDetail((current) =>
          current && current.instance.id === confirmAction.instanceId
            ? { ...current, instance: updatedInstance }
            : current,
        );
        setOverview((currentOverview) => ({
          ...currentOverview,
          instances: currentOverview.instances.map((item) =>
            item.instance.id === confirmAction.instanceId
              ? { ...item, instance: updatedInstance }
              : item,
          ),
        }));
        setConfirmAction(null);
        setConfirmInput('');
        setErrorMessage(null);
        pushToast(
          'success',
          confirmAction.nextEnabled
            ? 'Assignment baru kembali diarahkan ke perangkat ini.'
            : 'Assignment baru berhasil dipause untuk perangkat ini.',
        );
        return;
      }

      if (confirmAction.kind === 'container') {
        setBusyAction(`container-${confirmAction.action}`);
        const nextContainerState = await fetchJson<WhatsappContainerState>(
          `/api/admin/whatsapp/instances/${confirmAction.instanceId}/${confirmAction.action}`,
          { method: 'POST' },
        );

        if (activeSelectionRef.current === confirmAction.instanceId) {
          setContainerState(nextContainerState);
          setContainerUpdatedAt(new Date().toISOString());
        }

        await refreshSelectedDetail(confirmAction.instanceId);
        setConfirmAction(null);
        setConfirmInput('');
        setErrorMessage(null);
        pushToast('success', `Permintaan ${confirmDialogConfig.confirmLabel.toLowerCase()} berhasil dikirim.`);
        return;
      }

      setBusyAction(`retire-${confirmAction.mode}`);
      const response = await fetchJson<{ container: WhatsappContainerState }>(
        `/api/admin/whatsapp/instances/${confirmAction.instanceId}`,
        {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: confirmAction.mode }),
        },
      );

      if (activeSelectionRef.current === confirmAction.instanceId) {
        setContainerState(response.container);
        setContainerUpdatedAt(new Date().toISOString());
      }

      const nextOverview = await refreshOverview();
      const nextSelected = getPreferredSelectedInstance(nextOverview, confirmAction.instanceId);

      if (nextSelected) {
        await loadSelectedWorkspace(nextSelected.instance.id);
      } else {
        setEvents([]);
        setContainerState(null);
      }

      setConfirmAction(null);
      setConfirmInput('');
      setErrorMessage(null);

      const successMessage = {
        stop_only: 'Perangkat berhasil di-retire: assignment dipause dan worker dihentikan.',
        remove_runtime_resources: 'Runtime worker berhasil dibersihkan.',
        delete_db_row: 'Instance test berhasil dihapus permanen dari database.',
      }[confirmAction.mode];

      pushToast('success', successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Aksi perangkat WhatsApp gagal diproses.';
      setErrorMessage(message);
      pushToast('error', message);
    } finally {
      setBusyAction(null);
    }
  };

  const selectedStatus = selectedDetail ? getStatusPresentation(selectedDetail.derived_status) : null;
  const topPriorityInstance = criticalInstances[0] || null;
  const detailSections: Array<{ value: DetailSection; label: string }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'deliveries', label: 'Delivery' },
    { value: 'activity', label: 'Activity' },
    { value: 'technical', label: 'Technical' },
  ];

  return (
    <Stack spacing={1.25} sx={dashboardTypography}>
      <Paper elevation={0} sx={adminPanelSx}>
        <Stack spacing={1.25} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }}>
            <Box>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>
                WhatsApp Ops
              </Typography>
              <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
                WhatsApp Operations
              </Typography>
              <Typography sx={{ mt: 0.55, fontSize: '0.8rem', color: adminPalette.textMuted }}>
                Monitor device health, QR login needs, queues, and delivery issues from one operational workspace.
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', lg: 'auto' } }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshRoundedIcon />}
                onClick={() => void handleManualRefresh()}
                disabled={refreshing}
                sx={{ ...secondaryButtonSx, whiteSpace: 'nowrap' }}
              >
                {refreshing ? 'Refreshing...' : 'Refresh dashboard'}
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddRoundedIcon />}
                onClick={openCreateDialog}
                disabled={Boolean(busyAction)}
                sx={{ ...primaryButtonSx, whiteSpace: 'nowrap' }}
              >
                Add instance
              </Button>
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
              <MetricTile
                label="Healthy devices"
                value={`${numberFormatter.format(overview.summary.ready_instances)}/${numberFormatter.format(overview.summary.total_instances)}`}
                helper={`${numberFormatter.format(overview.summary.degraded_instances)} devices need attention`}
                tone={overview.summary.degraded_instances ? 'warning' : 'success'}
                onClick={() => {
                  setHealthFilter(overview.summary.degraded_instances ? 'attention' : 'ready');
                  setDetailSection('overview');
                }}
              />
              <MetricTile
                label="Need QR login"
                value={overview.summary.qr_required_instances}
                helper="Re-authenticate before devices receive work"
                tone={overview.summary.qr_required_instances ? 'warning' : 'default'}
                onClick={() => {
                  setHealthFilter('attention');
                  setDetailSection('overview');
                  const next = sortedInstances.find((instance) =>
                    ['qr_required', 'auth_failed'].includes(instance.derived_status),
                  );
                  if (next) {
                    handleSelectInstance(next);
                  }
                }}
              />
              <MetricTile
                label="Active queue"
                value={totalPendingMessages}
                helper={`Oldest queued ${formatAgeWithNow(overview.summary.oldest_queued_at, overviewNowMs)}`}
                tone={totalPendingMessages ? 'warning' : 'default'}
                onClick={() => {
                  setHealthFilter('queue');
                  setOutboundFilter(totalPendingMessages ? 'queued' : 'all');
                  setDetailSection('deliveries');
                }}
              />
              <MetricTile
                label="Failed or retrying"
                value={overview.summary.failed_or_retrying_messages}
                helper="Messages requiring stability review"
                tone={overview.summary.failed_or_retrying_messages ? 'error' : 'default'}
                onClick={() => {
                  setOutboundFilter(overview.summary.failed_or_retrying_messages ? 'failed' : 'all');
                  setDetailSection('deliveries');
                }}
              />
            </Stack>
            <Typography sx={{ fontSize: '0.76rem', color: adminPalette.textMuted }}>
              Updated {formatAgeWithNow(overviewUpdatedAt, overviewNowMs)}
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      {errorMessage ? (
        <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
          {errorMessage}
        </Alert>
      ) : null}

      {topPriorityInstance ? (
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: `1px solid ${adminPalette.warningBorder}`,
            background: `linear-gradient(90deg, ${adminPalette.warningBg} 0%, ${adminPalette.surface} 58%)`,
            px: { xs: 1.75, md: 2.5 },
            py: { xs: 1.5, md: 1.65 },
            boxShadow: 'none',
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
          >
            <Stack spacing={0.45}>
              <Typography sx={sectionLabelSx}>Priority queue</Typography>
              <Typography sx={{ ...dashboardTypography, fontSize: { xs: '1rem', md: '1.1rem' }, fontWeight: 800, color: adminPalette.textPrimary }}>
                {numberFormatter.format(criticalInstances.length)} device{criticalInstances.length !== 1 ? 's' : ''} need attention now
              </Typography>
              <Typography sx={{ fontSize: '0.86rem', lineHeight: 1.55, color: adminPalette.textSecondary }}>
                Recommended next action: <strong>{getRecommendedActionLabel(topPriorityInstance)}</strong> for <strong>{topPriorityInstance.instance.label}</strong>.{' '}
                {getStatusPresentation(topPriorityInstance.derived_status).shortAction}
              </Typography>
            </Stack>
            <Button
              variant="outlined"
              size="small"
              onClick={() => handleSelectInstance(topPriorityInstance)}
              sx={{ ...secondaryButtonSx, borderColor: adminPalette.warningBorder, color: adminPalette.warningText }}
            >
              Open priority device
            </Button>
          </Stack>
        </Paper>
      ) : null}

      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, xl: 4 }}>
          <Paper
            elevation={0}
            sx={{
              height: '100%',
              ...elevatedPanelSx,
              backgroundColor: adminPalette.surface,
              overflow: 'hidden',
              position: { xl: 'sticky' },
              top: { xl: 76 },
            }}
          >
            <Stack spacing={1.4} sx={{ p: { xs: 1.75, md: 2 } }}>
              <SectionHeading
                eyebrow="Registry"
                title="Device command list"
                description="Prioritized by attention state, queue pressure, and latest activity."
              />

              <TextField
                size="small"
                value={instanceSearch}
                onChange={(event) => setInstanceSearch(event.target.value)}
                placeholder="Search device, ID, or phone"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ color: adminPalette.textMuted }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2.5,
                    minHeight: 42,
                    backgroundColor: adminPalette.surfaceSoft,
                    '& fieldset': { borderColor: adminPalette.border },
                  },
                  '& .MuiInputBase-input': { py: 0.95, fontSize: '0.86rem', fontWeight: 600 },
                }}
              />

              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {HEALTH_FILTER_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={healthFilter === option.value ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => setHealthFilter(option.value)}
                    sx={{
                      minHeight: 32,
                      borderRadius: 999,
                      px: 1.25,
                      textTransform: 'none',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      boxShadow: 'none',
                      borderColor: adminPalette.borderStrong,
                      color: healthFilter === option.value ? '#ffffff' : adminPalette.textSecondary,
                      backgroundColor: healthFilter === option.value ? adminPalette.brand : adminPalette.surface,
                      '&:hover': {
                        boxShadow: 'none',
                        backgroundColor:
                          healthFilter === option.value ? adminPalette.brandDark : adminPalette.brandSoft,
                      },
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </Stack>
              <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textMuted }}>
                Showing {numberFormatter.format(filteredInstances.length)} of {numberFormatter.format(sortedInstances.length)} devices.
              </Typography>
            </Stack>

            {filteredInstances.length ? (
              <List disablePadding sx={{ display: 'grid', gap: 1, px: { xs: 1.25, md: 1.5 }, pb: { xs: 1.5, md: 1.75 } }}>
                {filteredInstances.map((instance) => {
                  const isSelected = selectedInstanceId === instance.instance.id;
                  const status = getStatusPresentation(instance.derived_status);

                  return (
                    <Box
                      key={instance.instance.id}
                      sx={{
                        borderRadius: 2.75,
                        border: `1px solid ${isSelected ? adminPalette.brandSoftStrong : adminPalette.border}`,
                        backgroundColor: isSelected ? adminPalette.brandSoft : adminPalette.surface,
                        boxShadow: 'none',
                        overflow: 'hidden',
                      }}
                    >
                      <ListItemButton
                        selected={isSelected}
                        onClick={() => handleSelectInstance(instance)}
                        sx={{
                          px: { xs: 1.35, md: 1.5 },
                          py: 1.25,
                          alignItems: 'flex-start',
                          borderLeft: isSelected ? `4px solid ${adminPalette.brand}` : '4px solid transparent',
                          '&.Mui-selected': { backgroundColor: 'transparent' },
                          '&.Mui-selected:hover': { backgroundColor: 'transparent' },
                          '&:hover': { backgroundColor: isSelected ? 'transparent' : adminPalette.surfaceSoft },
                        }}
                      >
                        <Stack spacing={0.9} sx={{ width: '100%' }}>
                          <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={1}
                            justifyContent="space-between"
                            alignItems={{ xs: 'flex-start', sm: 'center' }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ ...dashboardTypography, fontSize: '0.95rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                                {instance.instance.label}
                              </Typography>
                              <Typography sx={{ mt: 0.15, fontSize: '0.76rem', color: adminPalette.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {instance.instance.last_known_phone_number || instance.instance.id}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                              <Chip label={status.label} size="small" sx={getStatusChipSx(status.color)} />
                            </Stack>
                          </Stack>

                          <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.5, color: adminPalette.textSecondary }}>
                            {getInstanceOperationalNote(instance)}
                          </Typography>

                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography sx={{ fontSize: '0.74rem', color: adminPalette.textSecondary }}>
                              Last activity {formatAgeWithNow(getLastActivityAt(instance), overviewNowMs)}
                            </Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: adminPalette.textMuted }}>•</Typography>
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: getPendingMessageCount(instance) > 0 ? adminPalette.warningText : adminPalette.textSecondary }}>
                              {numberFormatter.format(getPendingMessageCount(instance))} messages queued
                            </Typography>
                            {!instance.instance.is_enabled ? (
                              <>
                                <Typography sx={{ fontSize: '0.72rem', color: adminPalette.textMuted }}>•</Typography>
                                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: adminPalette.textMuted }}>Paused</Typography>
                              </>
                            ) : null}
                          </Stack>
                        </Stack>
                      </ListItemButton>
                    </Box>
                  );
                })}
              </List>
            ) : (
              <Box sx={{ px: { xs: 1.5, md: 2 }, pb: { xs: 1.5, md: 2 } }}>
                <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                  No devices match current search or filter.
                </Alert>
              </Box>
            )}
          </Paper>
        </Grid>


        <Grid size={{ xs: 12, xl: 8 }}>
          {selectedDetail ? (
            <Stack spacing={2}>
              <Paper
                elevation={0}
                sx={{
                  ...elevatedPanelSx,
                  backgroundColor: adminPalette.surface,
                  overflow: 'hidden',
                }}
              >
                <Stack spacing={2} sx={{ p: { xs: 1.75, md: 2.25 } }}>
                  <Stack
                    direction={{ xs: 'column', lg: 'row' }}
                    spacing={2}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', lg: 'flex-start' }}
                  >
                    <Stack spacing={1} sx={{ minWidth: 0 }}>
                      <Box>
                        <Typography sx={sectionLabelSx}>Selected device</Typography>
                        <Typography sx={{ ...dashboardTypography, mt: 0.45, fontSize: { xs: '1.45rem', md: '1.65rem' }, fontWeight: 800, color: adminPalette.textPrimary, lineHeight: 1.1 }}>
                          {selectedDetail.instance.label}
                        </Typography>
                        <Typography sx={{ mt: 0.45, fontSize: '0.86rem', color: adminPalette.textSecondary }}>
                          {selectedDetail.instance.id} / Updated {formatAgeWithNow(detailUpdatedAt, detailNowMs)}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        {selectedStatus ? <Chip label={selectedStatus.label} size="small" sx={getStatusChipSx(selectedStatus.color)} /> : null}
                        <Chip
                          size="small"
                          label={selectedDetail.instance.is_enabled ? 'Active Assignment' : 'Assignment Paused'}
                          sx={getStatusChipSx(selectedDetail.instance.is_enabled ? 'success' : 'default')}
                        />
                        {selectedDetail.instance.last_known_phone_number ? (
                          <Chip size="small" label={selectedDetail.instance.last_known_phone_number} sx={getStatusChipSx('default')} />
                        ) : null}
                      </Stack>

                      <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.6, color: adminPalette.textSecondary, maxWidth: 720 }}>
                        {selectedStatus?.detail} Next best action: <strong>{getRecommendedActionLabel(selectedDetail)}</strong>.
                      </Typography>
                    </Stack>

                    <Stack direction={{ xs: 'column', sm: 'row', lg: 'column' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto', lg: 190 } }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RefreshRoundedIcon />}
                        disabled={Boolean(busyAction)}
                        onClick={() => {
                          void loadSelectedWorkspace(selectedDetail.instance.id)
                            .then(() => {
                              setErrorMessage(null);
                              pushToast('success', `Details for ${selectedInstanceName} updated.`);
                            })
                            .catch((error) => {
                              const message = error instanceof Error ? error.message : 'Failed to update device details.';
                              setErrorMessage(message);
                              pushToast('error', message);
                            });
                        }}
                        sx={{ ...secondaryButtonSx, whiteSpace: 'nowrap' }}
                      >
                        Refresh detail
                      </Button>
                      <Button
                        size="small"
                        component={Link}
                        href={`/ticket?instanceId=${selectedDetail.instance.id}`}
                        variant="outlined"
                        startIcon={<OpenInNewRoundedIcon />}
                        sx={{ ...secondaryButtonSx, whiteSpace: 'nowrap' }}
                      >
                        Open ticket
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<QrCode2RoundedIcon />}
                        onClick={() => setShowQr((current) => !current)}
                        disabled={
                          !selectedDetail.has_qr &&
                          selectedDetail.derived_status !== 'qr_required' &&
                          selectedDetail.derived_status !== 'auth_failed'
                        }
                        sx={{ ...primaryButtonSx, whiteSpace: 'nowrap' }}
                      >
                        {showQr ? 'Hide QR' : 'Show QR'}
                      </Button>
                    </Stack>
                  </Stack>

                  <Grid container spacing={1} sx={{ p: 1.2, borderRadius: 3, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <DetailStat
                        label="Last Heartbeat"
                        value={formatAgeWithNow(selectedDetail.runtime?.last_heartbeat_at || null, detailNowMs)}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <DetailStat
                        label="Active Queue"
                        value={numberFormatter.format(getPendingMessageCount(selectedDetail))}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <DetailStat
                        label="Active Tickets"
                        value={numberFormatter.format(selectedDetail.staff.active_ticket_count)}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <DetailStat
                        label="Retry / Failed"
                        value={`${numberFormatter.format(selectedDetail.queue.retrying_messages)} / ${numberFormatter.format(selectedDetail.queue.failed_messages)}`}
                      />
                    </Grid>
                  </Grid>
                </Stack>

                <Divider />

                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ p: { xs: 1.25, md: 1.5 }, backgroundColor: '#fbfdff' }}>
                  {detailSections.map((section) => (
                    <Button
                      key={section.value}
                      variant={detailSection === section.value ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setDetailSection(section.value)}
                      sx={{
                        minHeight: 34,
                        borderRadius: 999,
                        px: 1.45,
                        fontSize: '0.78rem',
                        textTransform: 'none',
                        fontWeight: 800,
                        boxShadow: 'none',
                        borderColor: adminPalette.borderStrong,
                        color: detailSection === section.value ? '#ffffff' : adminPalette.textSecondary,
                        backgroundColor: detailSection === section.value ? adminPalette.brand : adminPalette.surface,
                        '&:hover': {
                          boxShadow: 'none',
                          backgroundColor:
                            detailSection === section.value ? adminPalette.brandDark : adminPalette.brandSoft,
                        },
                      }}
                    >
                      {section.label}
                    </Button>
                  ))}
                </Stack>
              </Paper>

              {detailSection === 'overview' ? (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper elevation={0} sx={{ height: '100%', ...elevatedPanelSx, p: { xs: 1.75, md: 2 } }}>
                      <Stack spacing={1.45}>
                        <SectionHeading
                          eyebrow="Overview"
                          title="Operational summary"
                          description="The latest signals used to determine device health and routing safety."
                        />
                        <DetailStat
                          label="Last Activity"
                          value={formatAgeWithNow(getLastActivityAt(selectedDetail), detailNowMs)}
                          helper="Combined latest inbound, outbound, and heartbeat."
                        />
                        <DetailStat
                          label="Connected Number"
                          value={selectedDetail.instance.last_known_phone_number || '-'}
                          helper="Latest phone number reported by the device."
                        />
                        <DetailStat
                          label="Last Inbound Message"
                          value={formatAgeWithNow(selectedDetail.staff.latest_inbound_at, detailNowMs)}
                          helper={selectedDetail.staff.latest_inbound_preview || 'No recent inbound message preview available.'}
                        />

                        {!selectedDetail.runtime ? (
                          <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
                            Worker is not active for this device. Start worker or check orchestrator before waiting for QR or delivery.
                          </Alert>
                        ) : null}

                        {!selectedDetail.instance.is_enabled ? (
                          <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                            New assignments are paused. New blasts and API notifications will not be routed here, but old queues will continue.
                          </Alert>
                        ) : null}

                        {selectedDetail.runtime?.last_error || selectedDetail.instance.last_error ? (
                          <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
                            Last error: {selectedDetail.runtime?.last_error || selectedDetail.instance.last_error}
                          </Alert>
                        ) : null}
                      </Stack>
                    </Paper>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper elevation={0} sx={{ height: '100%', ...elevatedPanelSx, p: { xs: 1.75, md: 2 } }}>
                      <Stack spacing={1.45}>
                        <SectionHeading
                          eyebrow="Actions"
                          title="Common controls"
                          description="Frequent operational tasks stay here; high-risk runtime actions stay isolated under Technical."
                        />

                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                          <Button
                            variant="outlined"
                            color={selectedDetail.instance.is_enabled ? 'warning' : 'success'}
                            startIcon={selectedDetail.instance.is_enabled ? <PauseCircleOutlineRoundedIcon /> : <PlayCircleOutlineRoundedIcon />}
                            onClick={openToggleAssignmentDialog}
                            disabled={Boolean(busyAction)}
                            sx={{ ...secondaryButtonSx, minHeight: 38 }}
                          >
                            {selectedDetail.instance.is_enabled ? 'Pause new assignments' : 'Resume new assignments'}
                          </Button>
                          <Button
                            variant="outlined"
                            startIcon={<EditRoundedIcon />}
                            onClick={openRenameDialog}
                            disabled={Boolean(busyAction)}
                            sx={{ ...secondaryButtonSx, minHeight: 38 }}
                          >
                            Rename device
                          </Button>
                        </Stack>

                        <Divider />

                        <DetailStat
                          label="QR Available"
                          value={selectedDetail.has_qr ? 'Yes' : 'No'}
                          helper={`QR created ${formatDateTime(selectedDetail.runtime?.qr_generated_at || null)} and expires ${formatDateTime(selectedDetail.runtime?.qr_expires_at || null)}.`}
                        />
                        <DetailStat
                          label="Container Status"
                          value={containerState ? CONTAINER_STATUS_COPY[containerState.status].label : 'Not loaded'}
                          helper="Use the Technical tab to start, restart, stop, or cleanup the worker."
                        />
                      </Stack>
                    </Paper>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Collapse in={showQr}>
                      <Paper elevation={0} sx={{ ...elevatedPanelSx, p: { xs: 1.75, md: 2 } }}>
                        <Stack spacing={1.4}>
                          <SectionHeading
                            eyebrow="Authentication"
                            title="QR login"
                            description="Use only when the device needs re-login or the auth session failed to recover."
                          />

                          {qrImageSrc ? (
                            <Box
                              component="img"
                              alt={`QR login WhatsApp ${selectedDetail.instance.id}`}
                              src={qrImageSrc}
                              sx={{
                                width: '100%',
                                maxWidth: 280,
                                aspectRatio: '1 / 1',
                                display: 'block',
                                borderRadius: 2,
                                border: `1px solid ${adminPalette.border}`,
                                backgroundColor: '#fff',
                                imageRendering: 'pixelated',
                              }}
                            />
                          ) : selectedDetail.runtime?.qr_terminal ? (
                            <Box
                              component="pre"
                              sx={{
                                m: 0,
                                p: 1.5,
                                overflowX: 'auto',
                                borderRadius: 2,
                                backgroundColor: '#111827',
                                color: '#f8fafc',
                                fontSize: 7,
                                lineHeight: 1,
                                fontFamily: monoTypography,
                                whiteSpace: 'pre',
                              }}
                            >
                              {selectedDetail.runtime.qr_terminal}
                            </Box>
                          ) : (
                            <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                              QR not yet available for this device.
                            </Alert>
                          )}
                        </Stack>
                      </Paper>
                    </Collapse>
                  </Grid>
                </Grid>
              ) : null}

              {detailSection === 'deliveries' ? (
                <Stack spacing={2}>
                  <Grid container spacing={1.25}>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Paper elevation={0} sx={{ height: '100%', ...elevatedPanelSx, p: { xs: 1.5, md: 1.75 } }}>
                        <DetailStat
                          label="Total Queued"
                          value={numberFormatter.format(
                            selectedDetail.queue.queued_ticket_replies +
                              selectedDetail.queue.queued_api_notifications +
                              selectedDetail.queue.queued_blast_messages,
                          )}
                          helper={`Oldest queued ${formatAgeWithNow(selectedDetail.queue.oldest_queued_at, detailNowMs)}`}
                        />
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Paper elevation={0} sx={{ height: '100%', ...elevatedPanelSx, p: { xs: 1.5, md: 1.75 } }}>
                        <DetailStat
                          label="Retrying"
                          value={numberFormatter.format(selectedDetail.queue.retrying_messages)}
                          helper="Messages waiting for next attempt"
                        />
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Paper elevation={0} sx={{ height: '100%', ...elevatedPanelSx, p: { xs: 1.5, md: 1.75 } }}>
                        <DetailStat
                          label="Failed"
                          value={numberFormatter.format(selectedDetail.queue.failed_messages)}
                          helper="Check if this count increases continuously"
                        />
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Paper elevation={0} sx={{ height: '100%', ...elevatedPanelSx, p: { xs: 1.5, md: 1.75 } }}>
                        <DetailStat
                          label="Delivered"
                          value={numberFormatter.format(selectedDetail.queue.sent_messages)}
                          helper="Messages recorded as delivered"
                        />
                      </Paper>
                    </Grid>
                  </Grid>

                  <Paper
                    elevation={0}
                    sx={{
                      ...elevatedPanelSx,
                      backgroundColor: adminPalette.surface,
                      overflow: 'hidden',
                    }}
                  >
                    <Stack spacing={1.5} sx={{ p: { xs: 1.75, md: 2.25 } }}>
                      <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={1}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                      >
                        <SectionHeading
                          eyebrow="Delivery stream"
                          title="Recent deliveries"
                          description="Focus on statuses that need immediate follow-up."
                        />
                        <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textMuted }}>
                          Updated {formatAgeWithNow(outboundUpdatedAt, outboundNowMs)}
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        {(Object.keys(OUTBOUND_FILTER_COPY) as OutboundFilter[]).map((filterKey) => (
                          <Button
                            key={filterKey}
                            variant={outboundFilter === filterKey ? 'contained' : 'outlined'}
                            size="small"
                            onClick={() => setOutboundFilter(filterKey)}
                            sx={{
                              minHeight: 34,
                              borderRadius: 999,
                              px: 1.45,
                              textTransform: 'none',
                              fontWeight: 800,
                              boxShadow: 'none',
                              borderColor: adminPalette.borderStrong,
                              color: outboundFilter === filterKey ? '#ffffff' : adminPalette.textSecondary,
                              backgroundColor:
                                outboundFilter === filterKey
                                  ? OUTBOUND_FILTER_COPY[filterKey].color === 'error'
                                    ? adminPalette.dangerText
                                    : OUTBOUND_FILTER_COPY[filterKey].color === 'warning'
                                      ? adminPalette.warningText
                                      : OUTBOUND_FILTER_COPY[filterKey].color === 'success'
                                        ? adminPalette.successText
                                        : adminPalette.brand
                                  : adminPalette.surface,
                            }}
                          >
                            {OUTBOUND_FILTER_COPY[filterKey].label}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>

                    <TableContainer sx={{ overflowX: 'auto' }}>
                      <Table size="small" sx={{ minWidth: 840 }}>
                        <TableHead sx={{ backgroundColor: adminPalette.brand }}>
                          <TableRow>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Status</TableCell>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Recipient</TableCell>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Source</TableCell>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Reference</TableCell>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Ticket</TableCell>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Time</TableCell>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 800 }}>Latest Issue</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredOutboundItems.slice(0, 8).map((item) => (
                            <TableRow key={item.id} hover sx={{ '&:hover': { backgroundColor: adminPalette.brandSoft } }}>
                              <TableCell>
                                <Chip size="small" color={OUTBOUND_FILTER_COPY[item.delivery_status].color} label={OUTBOUND_FILTER_COPY[item.delivery_status].label} />
                              </TableCell>
                              <TableCell>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: adminPalette.textPrimary }}>
                                  {item.recipient_phone_number}
                                </Typography>
                                <Typography sx={{ mt: 0.2, fontSize: '0.75rem', color: adminPalette.textMuted }}>
                                  {item.instance_label || item.whatsapp_instance_id}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip size="small" variant="outlined" label={OUTBOUND_SOURCE_COPY[item.source_type].chipLabel} />
                              </TableCell>
                              <TableCell sx={{ color: adminPalette.textSecondary }}>{item.client_reference || '-'}</TableCell>
                              <TableCell>
                                {item.ticket_id ? (
                                  <Link href={`/ticket/${item.ticket_id}`} style={{ color: adminPalette.brandDark, fontWeight: 700 }}>
                                    {item.ticket_id}
                                  </Link>
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                              <TableCell>
                                <Typography sx={{ fontSize: '0.82rem', color: adminPalette.textPrimary }}>
                                  {formatDateTime(item.created_at)}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ maxWidth: 260 }}>
                                <Typography sx={{ fontSize: '0.8rem', lineHeight: 1.45, color: item.last_delivery_error ? adminPalette.dangerText : adminPalette.textMuted }}>
                                  {item.last_delivery_error || '-'}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}

                          {!filteredOutboundItems.length ? (
                            <TableRow>
                              <TableCell colSpan={7} sx={{ py: 5, textAlign: 'center' }}>
                                <Typography sx={{ fontWeight: 700, color: adminPalette.textPrimary }}>
                                  No deliveries found for this filter.
                                </Typography>
                                <Typography sx={{ mt: 0.5, color: adminPalette.textSecondary }}>
                                  Change status filter or select another device to see delivery activity.
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Stack>
              ) : null}

              {detailSection === 'activity' ? (
                <Paper
                  elevation={0}
                  sx={{
                    ...elevatedPanelSx,
                    backgroundColor: adminPalette.surface,
                    p: { xs: 1.75, md: 2.25 },
                  }}
                  >
                  <Stack spacing={1.75}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <Paper elevation={0} sx={{ height: '100%', borderRadius: 3, border: `1px solid ${adminPalette.border}`, p: { xs: 1.5, md: 1.75 }, backgroundColor: adminPalette.surfaceSoft }}>
                          <Stack spacing={1.35}>
                            <SectionHeading eyebrow="Activity" title="Message summary" />
                            <DetailStat
                              label="Last Inbound Message"
                              value={formatAgeWithNow(selectedDetail.staff.latest_inbound_at, detailNowMs)}
                            />
                            <DetailStat
                              label="Last Outbound Message"
                              value={formatAgeWithNow(selectedDetail.runtime?.last_outbound_at || null, detailNowMs)}
                            />
                            <DetailStat
                              label="Recent Ticket"
                              value={selectedDetail.staff.latest_ticket_subject || selectedDetail.staff.latest_ticket_id || '-'}
                            />
                          </Stack>
                        </Paper>
                      </Grid>

                      <Grid size={{ xs: 12, md: 8 }}>
                          <Stack spacing={1.35}>
                          <Stack
                            direction={{ xs: 'column', md: 'row' }}
                            spacing={1}
                            justifyContent="space-between"
                            alignItems={{ xs: 'flex-start', md: 'center' }}
                          >
                            <SectionHeading
                              eyebrow="Timeline"
                              title="Device event trail"
                              description="Grouped events make reconnect and login-failure patterns easier to scan."
                            />
                            <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textMuted }}>
                              Updated {formatAgeWithNow(eventsUpdatedAt, eventsNowMs)}
                            </Typography>
                          </Stack>

                          {eventsInstanceId !== selectedDetail.instance.id ? (
                            <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                              Latest activity is being loaded for the selected device.
                            </Alert>
                          ) : groupedEvents.length ? (
                            <List disablePadding sx={{ display: 'grid', gap: 0.75 }}>
                              {visibleEvents.map((event) => (
                                <Paper
                                  key={event.id}
                                  elevation={0}
                                  sx={{ borderRadius: 2.5, border: `1px solid ${adminPalette.border}`, boxShadow: 'none' }}
                                >
                                  <ListItemButton sx={{ px: 1.5, py: 1.2 }}>
                                    <Stack spacing={0.55} sx={{ width: '100%' }}>
                                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                                        <Typography sx={{ ...dashboardTypography, fontSize: '0.95rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                                          {event.title}
                                        </Typography>
                                        {event.count > 1 ? <Chip size="small" variant="outlined" label={`${event.count} times`} /> : null}
                                      </Stack>
                                      <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.45, color: adminPalette.textSecondary }}>
                                        {event.description}
                                      </Typography>
                                      <Typography sx={{ fontSize: '0.75rem', color: adminPalette.textMuted }}>
                                        {formatAgeWithNow(event.createdAt, eventsNowMs)} • {formatDateTime(event.createdAt)}
                                      </Typography>
                                    </Stack>
                                  </ListItemButton>
                                </Paper>
                              ))}
                            </List>
                          ) : (
                            <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                              No device activity recorded.
                            </Alert>
                          )}

                          {groupedEvents.length > 6 ? (
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => setShowAllEvents((current) => !current)}
                              sx={{ ...secondaryButtonSx, alignSelf: 'flex-start' }}
                            >
                              {showAllEvents ? 'Show less' : 'View all activity'}
                            </Button>
                          ) : null}
                        </Stack>
                      </Grid>
                    </Grid>
                  </Stack>
                </Paper>
              ) : null}

              {detailSection === 'technical' ? (
                <Stack spacing={2}>
                  <Paper
                    elevation={0}
                    sx={{
                      ...elevatedPanelSx,
                      backgroundColor: adminPalette.surface,
                      p: { xs: 1.75, md: 2.25 },
                    }}
                  >
                    <Stack spacing={1.75}>
                      <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={1}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                      >
                        <SectionHeading
                          eyebrow="Runtime"
                          title="Technical diagnostics"
                          description="Advanced worker controls and runtime details for deeper troubleshooting."
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<SettingsRoundedIcon />}
                          onClick={() => {
                            void refreshContainerState(selectedDetail.instance.id)
                              .then(() => {
                                setErrorMessage(null);
                                pushToast('success', `Status container ${selectedInstanceName} diperbarui.`);
                              })
                              .catch((error) => {
                                const message = error instanceof Error ? error.message : 'Gagal memuat status container.';
                                setErrorMessage(message);
                                pushToast('error', message);
                              });
                          }}
                          disabled={Boolean(busyAction)}
                          sx={{ ...secondaryButtonSx }}
                        >
                          Refresh diagnostics
                        </Button>
                      </Stack>

                      <Grid container spacing={1.5}>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Paper elevation={0} sx={{ height: '100%', borderRadius: 3, border: `1px solid ${adminPalette.border}`, p: { xs: 1.5, md: 1.75 }, backgroundColor: adminPalette.surfaceSoft }}>
                            <Stack spacing={0.85}>
                              <Typography sx={{ ...dashboardTypography, fontSize: '0.95rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                                Runtime metadata
                              </Typography>
                              <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textSecondary }}>
                                Worker ID: <strong>{selectedDetail.runtime?.worker_id || selectedDetail.instance.assigned_worker_id || '-'}</strong>
                              </Typography>
                              <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textSecondary }}>
                                Host: <strong>{selectedDetail.runtime?.worker_host || '-'}</strong>
                              </Typography>
                              <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textSecondary }}>
                                Worker version: <strong>{selectedDetail.runtime?.worker_version || '-'}</strong>
                              </Typography>
                              <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textSecondary }}>
                                Worker conflict: <strong>{selectedDetail.runtime?.has_worker_conflict ? 'Yes' : 'No'}</strong>
                              </Typography>
                              <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textSecondary }}>
                                Container status: <strong>{containerState ? CONTAINER_STATUS_COPY[containerState.status].label : '-'}</strong>
                              </Typography>
                              <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textSecondary }}>
                                Updated: <strong>{formatDateTime(containerUpdatedAt)}</strong>
                              </Typography>
                            </Stack>
                          </Paper>
                        </Grid>

                        <Grid size={{ xs: 12, md: 6 }}>
                          <Paper elevation={0} sx={{ height: '100%', borderRadius: 3, border: `1px solid ${adminPalette.border}`, p: { xs: 1.5, md: 1.75 }, backgroundColor: adminPalette.surfaceSoft }}>
                            <Stack spacing={1.1}>
                              <Typography sx={{ ...dashboardTypography, fontSize: '0.95rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                                Worker controls
                              </Typography>
                              <Typography sx={{ fontSize: '0.78rem', lineHeight: 1.45, color: adminPalette.textSecondary }}>
                                Use start, restart, or stop only when operational troubleshooting requires intervention.
                              </Typography>
                              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                <Button
                                  size="small"
                                  variant="contained"
                                  startIcon={<PlayCircleOutlineRoundedIcon />}
                                  onClick={() => openContainerActionDialog('start')}
                                  disabled={Boolean(busyAction) || containerState?.status === 'not_configured'}
                                  sx={{ ...primaryButtonSx, minHeight: 34 }}
                                >
                                  Start worker
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<RestartAltRoundedIcon />}
                                  onClick={() => openContainerActionDialog('restart')}
                                  disabled={Boolean(busyAction) || containerState?.status === 'not_configured'}
                                  sx={{ ...secondaryButtonSx, minHeight: 34 }}
                                >
                                  Restart worker
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  startIcon={<PauseCircleOutlineRoundedIcon />}
                                  onClick={() => openContainerActionDialog('stop')}
                                  disabled={Boolean(busyAction) || containerState?.status === 'not_configured'}
                                  sx={{ ...secondaryButtonSx, minHeight: 34 }}
                                >
                                  Stop worker
                                </Button>
                              </Stack>
                            </Stack>
                          </Paper>
                        </Grid>

                        <Grid size={{ xs: 12 }}>
                          <Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${adminPalette.border}`, p: { xs: 1.5, md: 1.75 }, backgroundColor: adminPalette.surfaceSoft }}>
                            <Stack spacing={0.85}>
                              <Typography sx={{ ...dashboardTypography, fontSize: '0.95rem', fontWeight: 800, color: adminPalette.textPrimary }}>
                                Manual worker environment
                              </Typography>
                              <Typography
                                component="pre"
                                sx={{
                                  m: 0,
                                  p: 1.25,
                                  borderRadius: 1.75,
                                  border: `1px solid ${adminPalette.border}`,
                                  backgroundColor: adminPalette.surface,
                                  color: adminPalette.textSecondary,
                                  fontSize: '0.77rem',
                                  lineHeight: 1.55,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  fontFamily: monoTypography,
                                }}
                              >
                                {`WHATSAPP_INSTANCE_ID=${selectedDetail.instance.id}\nWHATSAPP_INSTANCE_LABEL="${selectedDetail.instance.label}"\nWHATSAPP_WORKER_ID=${selectedDetail.instance.id}-worker`}
                              </Typography>
                            </Stack>
                          </Paper>
                        </Grid>
                      </Grid>

                      {containerState?.last_error ? (
                        <Alert severity={containerState.status === 'not_configured' ? 'info' : 'warning'} sx={{ borderRadius: 2.5 }}>
                          {containerState.last_error}
                        </Alert>
                      ) : null}
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      ...elevatedPanelSx,
                      borderColor: adminPalette.warningBorder,
                      backgroundColor: adminPalette.surface,
                      p: { xs: 1.75, md: 2.25 },
                    }}
                  >
                    <Stack spacing={1.4}>
                      <SectionHeading
                        eyebrow="Risk zone"
                        title="Destructive operations"
                        description="Use these only when retiring a device or cleaning up test runtime resources."
                      />
                      <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
                        Runtime cleanup removes the container and auth volume while preserving database history. Permanent delete is only for unused test instances.
                      </Alert>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Button
                          variant="outlined"
                          color="warning"
                          onClick={() => openRetireDialog('stop_only')}
                          disabled={Boolean(busyAction)}
                          sx={{ ...secondaryButtonSx }}
                        >
                          Retire device
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          onClick={() => openRetireDialog('remove_runtime_resources')}
                          disabled={Boolean(busyAction)}
                          sx={{ ...secondaryButtonSx }}
                        >
                          Remove worker runtime
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteOutlineRoundedIcon />}
                          onClick={() => openRetireDialog('delete_db_row')}
                          disabled={Boolean(busyAction) || selectedDetail.instance.id === 'default'}
                          sx={{ ...secondaryButtonSx }}
                        >
                          Permanently delete test instance
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                </Stack>
              ) : null}
            </Stack>
          ) : (
            <Paper
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: `1px solid ${adminPalette.border}`,
                backgroundColor: adminPalette.surface,
                p: { xs: 1.5, md: 2 },
              }}
            >
              <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                Belum ada perangkat WhatsApp yang dikonfigurasi. Tambahkan instance baru untuk mulai memantau worker dan antrean.
              </Alert>
            </Paper>
          )}
        </Grid>
      </Grid>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') {
            return;
          }

          setToast(null);
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity={toast?.severity || 'success'}
          variant="filled"
          sx={{ width: '100%' }}
          onClose={() => setToast(null)}
        >
          {toast?.message}
        </Alert>
      </Snackbar>

      <Dialog open={Boolean(editorDialog)} onClose={() => setEditorDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>
          {editorDialog?.mode === 'create' ? 'Tambah instance WhatsApp' : 'Ubah nama perangkat'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {editorDialog?.mode === 'create' ? (
              <TextField
                label="Instance ID"
                value={editorDialog.id}
                onChange={(event) =>
                  setEditorDialog((current) =>
                    current && current.mode === 'create'
                      ? { ...current, id: event.target.value }
                      : current,
                  )
                }
                helperText="Contoh: iom-wa-2"
                fullWidth
              />
            ) : null}

            <TextField
              label="Nama perangkat"
              value={editorDialog?.label || ''}
              onChange={(event) =>
                setEditorDialog((current) => (current ? { ...current, label: event.target.value } : current))
              }
              helperText="Nama ini tampil di dashboard dan riwayat pengiriman."
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setEditorDialog(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Batal
          </Button>
          <Button
            onClick={() => void handleSaveEditorDialog()}
            variant="contained"
            disabled={busyAction === 'create-instance' || busyAction === 'rename-instance'}
            sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}
          >
            {busyAction === 'create-instance' || busyAction === 'rename-instance'
              ? 'Menyimpan...'
              : 'Simpan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmAction)} onClose={() => setConfirmAction(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>
          {confirmDialogConfig?.title}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography sx={{ color: adminPalette.textSecondary }}>
              {confirmDialogConfig?.description}
            </Typography>

            {confirmDialogConfig?.requiresText ? (
              <TextField
                label={`Ketik ${confirmDialogConfig.requiresText}`}
                value={confirmInput}
                onChange={(event) => setConfirmInput(event.target.value)}
                fullWidth
              />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setConfirmAction(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Batal
          </Button>
          <Button
            onClick={() => void handleConfirmDialog()}
            variant="contained"
            color={confirmDialogConfig?.color || 'primary'}
            disabled={Boolean(busyAction)}
            sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}
          >
            {busyAction ? 'Memproses...' : confirmDialogConfig?.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
