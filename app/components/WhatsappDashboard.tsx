'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import type {
  WhatsappDashboardOverview,
  WhatsappInstanceEventRecord,
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
}

const statusChipColorMap: Record<
  WhatsappInstanceSummary['derived_status'],
  'default' | 'success' | 'warning' | 'error' | 'info'
> = {
  starting: 'default',
  qr_required: 'warning',
  connecting: 'info',
  ready: 'success',
  degraded: 'warning',
  disconnected: 'error',
  auth_failed: 'error',
};

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
  timeZoneName: 'short',
});

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

function formatAge(value: string | null): string {
  if (!value) {
    return '-';
  }

  const diffMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return formatDateTime(value);
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
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
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <Card elevation={2} sx={{ height: '100%' }}>
      <CardContent>
        <Typography color="text.secondary" variant="body2">
          {label}
        </Typography>
        <Typography sx={{ fontSize: 28, fontWeight: 700 }}>{value}</Typography>
        {helper ? (
          <Typography color="text.secondary" variant="caption">
            {helper}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function WhatsappDashboard({
  initialOverview,
  initialOutbound,
  initialEvents,
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

  useEffect(() => {
    let cancelled = false;

    const refreshOverview = async () => {
      try {
        const [nextOverview, nextOutbound] = await Promise.all([
          fetchJson<WhatsappDashboardOverview>('/api/admin/whatsapp/instances'),
          fetchJson<OutboundResponse>('/api/admin/whatsapp/outbound'),
        ]);

        if (cancelled) {
          return;
        }

        setOverview(nextOverview);
        setOutbound(nextOutbound);
        const selectedStillExists = nextOverview.instances.some(
          (instance) => instance.instance.id === selectedInstanceId,
        );

        if (!selectedStillExists) {
          setSelectedInstanceId(nextOverview.instances[0]?.instance.id || null);
          setSelectedDetail(nextOverview.instances[0] || null);
          setEvents([]);
        }

        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh WhatsApp dashboard.');
        }
      }
    };

    const intervalId = window.setInterval(refreshOverview, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedInstanceId]);

  useEffect(() => {
    if (!selectedInstanceId) {
      return;
    }

    let cancelled = false;

    const refreshDetail = async () => {
      try {
        const [detailResponse, eventsResponse] = await Promise.all([
          fetchJson<WhatsappInstanceSummary>(`/api/admin/whatsapp/instances/${selectedInstanceId}`),
          fetchJson<{ instance_id: string; events: WhatsappInstanceEventRecord[] }>(
            `/api/admin/whatsapp/instances/${selectedInstanceId}/events`,
          ),
        ]);

        if (cancelled) {
          return;
        }

        setSelectedDetail(detailResponse);
        setEvents(eventsResponse.events);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh WhatsApp instance detail.');
        }
      }
    };

    void refreshDetail();
    const intervalMs = selectedDetail?.derived_status === 'qr_required' ? 2000 : 5000;
    const intervalId = window.setInterval(refreshDetail, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedDetail?.derived_status, selectedInstanceId]);

  return (
    <Stack spacing={3} sx={{ p: 4 }}>
      <Box>
        <Typography variant="h4" gutterBottom>
          WhatsApp Dashboard
        </Typography>
        <Typography color="text.secondary">
          Hybrid ops and staff view for QR onboarding, queue health, and outbound visibility.
        </Typography>
      </Box>

      {errorMessage ? <Alert severity="warning">{errorMessage}</Alert> : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Instances" value={overview.summary.total_instances} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Ready" value={overview.summary.ready_instances} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Need QR" value={overview.summary.qr_required_instances} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Degraded / Down" value={overview.summary.degraded_instances} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <SummaryCard label="Queued Ticket Replies" value={overview.summary.queued_ticket_replies} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <SummaryCard label="Queued API Notifications" value={overview.summary.queued_api_notifications} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <SummaryCard
            label="Failed or Retrying"
            value={overview.summary.failed_or_retrying_messages}
            helper={`Oldest queued: ${formatAge(overview.summary.oldest_queued_at)}`}
          />
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Fleet
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Instance</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Number</TableCell>
                <TableCell>Worker</TableCell>
                <TableCell>Heartbeat</TableCell>
                <TableCell>QR</TableCell>
                <TableCell>Ticket Queue</TableCell>
                <TableCell>API Queue</TableCell>
                <TableCell>Oldest Queue</TableCell>
                <TableCell>Inbound</TableCell>
                <TableCell>Outbound</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {overview.instances.map((instanceSummary) => (
                <TableRow
                  hover
                  key={instanceSummary.instance.id}
                  onClick={() => {
                    setSelectedInstanceId(instanceSummary.instance.id);
                    setSelectedDetail(instanceSummary);
                  }}
                  selected={selectedInstanceId === instanceSummary.instance.id}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Stack spacing={0.5}>
                      <Typography fontWeight={600}>{instanceSummary.instance.label}</Typography>
                      <Typography color="text.secondary" variant="caption">
                        <Link href={`/ticket?instanceId=${instanceSummary.instance.id}`}>Open related tickets</Link>
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={instanceSummary.derived_status}
                      color={statusChipColorMap[instanceSummary.derived_status]}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{instanceSummary.instance.last_known_phone_number || '-'}</TableCell>
                  <TableCell>{instanceSummary.runtime?.worker_id || instanceSummary.instance.assigned_worker_id || '-'}</TableCell>
                  <TableCell>{formatAge(instanceSummary.runtime?.last_heartbeat_at || null)}</TableCell>
                  <TableCell>{instanceSummary.has_qr ? 'Available' : '-'}</TableCell>
                  <TableCell>{instanceSummary.queue.queued_ticket_replies}</TableCell>
                  <TableCell>{instanceSummary.queue.queued_api_notifications}</TableCell>
                  <TableCell>{formatAge(instanceSummary.queue.oldest_queued_at)}</TableCell>
                  <TableCell>{formatAge(instanceSummary.staff.latest_inbound_at)}</TableCell>
                  <TableCell>{formatAge(instanceSummary.runtime?.last_outbound_at || null)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {selectedDetail ? (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  QR and Connection
                </Typography>
                {selectedDetail.runtime?.qr_terminal ? (
                  <Box
                    component="pre"
                    sx={{
                      p: 1.5,
                      overflowX: 'auto',
                      borderRadius: 1,
                      backgroundColor: '#111',
                      color: '#f4f4f4',
                      fontSize: 7,
                      lineHeight: 0.8,
                    }}
                  >
                    {selectedDetail.runtime.qr_terminal}
                  </Box>
                ) : (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    No live QR is available for this instance.
                  </Alert>
                )}
                <Stack spacing={1}>
                  <Typography variant="body2">
                    Status: <strong>{selectedDetail.derived_status}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Number: <strong>{selectedDetail.instance.last_known_phone_number || '-'}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Chat ID: <strong>{selectedDetail.instance.last_known_chat_id || '-'}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Ready since: <strong>{formatDateTime(selectedDetail.instance.last_ready_at)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    QR generated: <strong>{formatDateTime(selectedDetail.runtime?.qr_generated_at || null)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    QR expires: <strong>{formatDateTime(selectedDetail.runtime?.qr_expires_at || null)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Last disconnect: <strong>{formatDateTime(selectedDetail.instance.last_disconnect_at)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Last error: <strong>{selectedDetail.runtime?.last_error || selectedDetail.instance.last_error || '-'}</strong>
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Worker and Staff Context
                </Typography>
                <Stack spacing={1.2}>
                  <Typography variant="body2">
                    Worker ID: <strong>{selectedDetail.runtime?.worker_id || '-'}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Host: <strong>{selectedDetail.runtime?.worker_host || '-'}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Version: <strong>{selectedDetail.runtime?.worker_version || '-'}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Heartbeat: <strong>{formatDateTime(selectedDetail.runtime?.last_heartbeat_at || null)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Conflict: <strong>{selectedDetail.runtime?.has_worker_conflict ? 'Yes' : 'No'}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Active tickets: <strong>{selectedDetail.staff.active_ticket_count}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Latest inbound: <strong>{formatDateTime(selectedDetail.staff.latest_inbound_at)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Latest outbound reply: <strong>{selectedDetail.staff.latest_outbound_reply_status || '-'}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Latest ticket:{' '}
                    {selectedDetail.staff.latest_ticket_id ? (
                      <Link href={`/ticket/${selectedDetail.staff.latest_ticket_id}`}>
                        {selectedDetail.staff.latest_ticket_subject || selectedDetail.staff.latest_ticket_id}
                      </Link>
                    ) : (
                      '-'
                    )}
                  </Typography>
                  <Typography variant="body2">
                    Inbound preview: <strong>{selectedDetail.staff.latest_inbound_preview || '-'}</strong>
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Outbound Visibility
                </Typography>
                <Stack spacing={1.2}>
                  <Typography variant="body2">
                    Ticket queue: <strong>{selectedDetail.queue.queued_ticket_replies}</strong>
                  </Typography>
                  <Typography variant="body2">
                    API queue: <strong>{selectedDetail.queue.queued_api_notifications}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Retrying: <strong>{selectedDetail.queue.retrying_messages}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Failed: <strong>{selectedDetail.queue.failed_messages}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Sent: <strong>{selectedDetail.queue.sent_messages}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Oldest queued: <strong>{formatDateTime(selectedDetail.queue.oldest_queued_at)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Reconnects 24h: <strong>{selectedDetail.runtime?.reconnect_count_24h || 0}</strong>
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Recent Events
                </Typography>
                <List dense disablePadding>
                  {events.map((event) => (
                    <ListItem key={event.id} disableGutters divider>
                      <ListItemText
                        primary={`${event.event_type} • ${formatAge(event.created_at)}`}
                        secondary={event.message || formatDateTime(event.created_at)}
                      />
                    </ListItem>
                  ))}
                  {!events.length ? (
                    <ListItem disableGutters>
                      <ListItemText primary="No events yet." />
                    </ListItem>
                  ) : null}
                </List>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Recent Outbound Activity
                </Typography>
                <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
                  <Chip label={`Queued ${outbound.summary.queued}`} size="small" />
                  <Chip label={`Retrying ${outbound.summary.retrying}`} size="small" color="warning" />
                  <Chip label={`Failed ${outbound.summary.failed}`} size="small" color="error" />
                  <Chip label={`Sent ${outbound.summary.sent}`} size="small" color="success" />
                  <Chip label={`Ticket ${outbound.summary.ticket_reply}`} size="small" variant="outlined" />
                  <Chip label={`API ${outbound.summary.api_notification}`} size="small" variant="outlined" />
                </Stack>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Instance</TableCell>
                        <TableCell>Source</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Recipient</TableCell>
                        <TableCell>Reference</TableCell>
                        <TableCell>Ticket</TableCell>
                        <TableCell>Created</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {outbound.items
                        .filter((item) => item.whatsapp_instance_id === selectedDetail.instance.id)
                        .map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.instance_label || item.whatsapp_instance_id}</TableCell>
                            <TableCell>{item.source_type}</TableCell>
                            <TableCell>{item.delivery_status}</TableCell>
                            <TableCell>{item.recipient_phone_number}</TableCell>
                            <TableCell>{item.client_reference || '-'}</TableCell>
                            <TableCell>
                              {item.ticket_id ? <Link href={`/ticket/${item.ticket_id}`}>{item.ticket_id}</Link> : '-'}
                            </TableCell>
                            <TableCell title={item.created_at}>{formatDateTime(item.created_at)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : (
        <Alert severity="info">No WhatsApp instances are configured yet.</Alert>
      )}
    </Stack>
  );
}
