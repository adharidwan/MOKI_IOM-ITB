import 'server-only';

import { FeatureKey } from './access-control';
import { getSupabaseAdminClient } from './supabase-server';

export type AdminNotificationEventType =
  | 'ticket_created'
  | 'ticket_customer_reply'
  | 'ticket_reply_failed'
  | 'outbound_failed'
  | 'scheduled_blast_partial'
  | 'scheduled_blast_failed'
  | 'whatsapp_instance_problem'
  | 'whatsapp_instance_ready';

export interface AdminNotificationEvent {
  id: string;
  type: AdminNotificationEventType;
  title: string;
  message: string;
  occurredAt: string;
  href: string;
  severity: 'info' | 'success' | 'warning' | 'error';
}

const DEFAULT_LOOKBACK_MS = 5 * 60 * 1000;
const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS_PER_KIND = 20;

function parseSince(value: string | null, nowMs: number): string {
  if (!value) {
    return new Date(nowMs - DEFAULT_LOOKBACK_MS).toISOString();
  }

  const parsedMs = Date.parse(value);

  if (!Number.isFinite(parsedMs)) {
    return new Date(nowMs - DEFAULT_LOOKBACK_MS).toISOString();
  }

  return new Date(Math.max(nowMs - MAX_LOOKBACK_MS, Math.min(parsedMs, nowMs))).toISOString();
}

function text(value: unknown, fallback: string): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function hasFeature(features: FeatureKey[], feature: FeatureKey): boolean {
  return features.includes(feature);
}

function compactEvents(values: Array<AdminNotificationEvent | null>): AdminNotificationEvent[] {
  return values.filter((event): event is AdminNotificationEvent => Boolean(event));
}

function logNotificationQueryError(scope: string, error: { message: string }): void {
  console.error(
    JSON.stringify({
      event: 'admin_notification_query_failed',
      scope,
      reason: error.message,
    }),
  );
}

export async function listAdminNotificationEvents(
  since: string | null,
  allowedFeatures: FeatureKey[],
  now = new Date(),
): Promise<{ events: AdminNotificationEvent[]; cursor: string }> {
  const supabase = getSupabaseAdminClient();
  const nowIso = now.toISOString();
  const sinceIso = parseSince(since, now.getTime());
  const eventGroups: AdminNotificationEvent[][] = [];

  if (hasFeature(allowedFeatures, 'ticket')) {
    const [tickets, customerReplies, failedTicketReplies] = await Promise.all([
      supabase
        .from('tickets')
        .select('id, subject, phone_number, user_email, channel, created_at')
        .gt('created_at', sinceIso)
        .lte('created_at', nowIso)
        .order('created_at', { ascending: true })
        .limit(MAX_EVENTS_PER_KIND),
      supabase
        .from('replies')
        .select('id, ticket_id, content, created_at, tickets(id, subject)')
        .eq('sender_type', 'customer')
        .gt('created_at', sinceIso)
        .lte('created_at', nowIso)
        .order('created_at', { ascending: true })
        .limit(MAX_EVENTS_PER_KIND),
      supabase
        .from('outbound_messages')
        .select('id, ticket_id, recipient_phone_number, updated_at, last_delivery_error')
        .eq('source_type', 'ticket_reply')
        .eq('delivery_status', 'failed')
        .gt('updated_at', sinceIso)
        .lte('updated_at', nowIso)
        .order('updated_at', { ascending: true })
        .limit(MAX_EVENTS_PER_KIND),
    ]);

    if (tickets.error) {
      logNotificationQueryError('ticket_created', tickets.error);
    } else {
      eventGroups.push((tickets.data || []).map((ticket) => {
        const ticketId = String(ticket.id);
        const contact = text(ticket.phone_number || ticket.user_email || ticket.channel, 'kontak tidak dikenal');

        return {
          id: `ticket_created:${ticketId}`,
          type: 'ticket_created',
          title: 'Tiket baru masuk',
          message: `${contact}: ${text(ticket.subject, 'Tiket tanpa judul')}`,
          occurredAt: String(ticket.created_at),
          href: `/ticket/${ticketId}`,
          severity: 'info',
        };
      }));
    }

    if (customerReplies.error) {
      logNotificationQueryError('ticket_customer_reply', customerReplies.error);
    } else {
      eventGroups.push((customerReplies.data || []).map((reply) => {
        const ticketId = String(reply.ticket_id);
        const joinedTicket = Array.isArray(reply.tickets) ? reply.tickets[0] : reply.tickets;

        return {
          id: `ticket_customer_reply:${reply.id}`,
          type: 'ticket_customer_reply',
          title: 'Balasan ticket baru',
          message: `${text(joinedTicket?.subject, `Tiket ${ticketId}`)}: ${text(reply.content, 'Pesan baru')}`,
          occurredAt: String(reply.created_at),
          href: `/ticket/${ticketId}`,
          severity: 'info',
        };
      }));
    }

    if (failedTicketReplies.error) {
      logNotificationQueryError('ticket_reply_failed', failedTicketReplies.error);
    } else {
      eventGroups.push((failedTicketReplies.data || []).map((message) => {
        const ticketId = String(message.ticket_id || '');

        return {
          id: `ticket_reply_failed:${message.id}:${message.updated_at}`,
          type: 'ticket_reply_failed',
          title: 'Balasan tiket gagal dikirim',
          message: `${text(message.recipient_phone_number, 'nomor tujuan')}: ${text(message.last_delivery_error, 'Pengiriman gagal')}`,
          occurredAt: String(message.updated_at),
          href: ticketId ? `/ticket/${ticketId}` : '/ticket',
          severity: 'error',
        };
      }));
    }
  }

  if (hasFeature(allowedFeatures, 'blast') || hasFeature(allowedFeatures, 'whatsapp')) {
    const { data, error } = await supabase
      .from('outbound_messages')
      .select('id, source_type, recipient_phone_number, client_reference, updated_at, last_delivery_error')
      .in('source_type', ['blast', 'api_notification'])
      .eq('delivery_status', 'failed')
      .gt('updated_at', sinceIso)
      .lte('updated_at', nowIso)
      .order('updated_at', { ascending: true })
      .limit(MAX_EVENTS_PER_KIND);

    if (error) {
      logNotificationQueryError('outbound_failed', error);
    } else {
      eventGroups.push(
        (data || []).map((message) => {
          const sourceLabel = message.source_type === 'blast' ? 'Blast' : 'API notification';

          return {
            id: `outbound_failed:${message.id}:${message.updated_at}`,
            type: 'outbound_failed',
            title: `${sourceLabel} gagal dikirim`,
            message: `${text(message.recipient_phone_number || message.client_reference, 'tujuan tidak dikenal')}: ${text(message.last_delivery_error, 'Pengiriman gagal')}`,
            occurredAt: String(message.updated_at),
            href: message.source_type === 'blast' ? '/blastmessage' : '/whatsapp',
            severity: 'error',
          };
        }),
      );
    }
  }

  if (hasFeature(allowedFeatures, 'blast')) {
    const { data, error } = await supabase
      .from('scheduled_blast_runs')
      .select('id, scheduled_blast_id, status, failed_count, total_recipients, error_message, finished_at, created_at, scheduled_blasts(id, name)')
      .in('status', ['partial', 'failed'])
      .gt('finished_at', sinceIso)
      .lte('finished_at', nowIso)
      .order('finished_at', { ascending: true })
      .limit(MAX_EVENTS_PER_KIND);

    if (error) {
      logNotificationQueryError('scheduled_blast', error);
    } else {
      eventGroups.push(
        (data || []).map((run) => {
          const schedule = Array.isArray(run.scheduled_blasts) ? run.scheduled_blasts[0] : run.scheduled_blasts;
          const failedCount = Number(run.failed_count || 0);
          const status = run.status === 'failed' ? 'failed' : 'partial';

          return {
            id: `scheduled_blast_${status}:${run.id}:${run.finished_at}`,
            type: status === 'failed' ? 'scheduled_blast_failed' : 'scheduled_blast_partial',
            title: status === 'failed' ? 'Scheduled blast gagal' : 'Scheduled blast sebagian gagal',
            message: `${text(schedule?.name, 'Scheduled blast')}: ${failedCount} dari ${Number(run.total_recipients || 0)} gagal. ${text(run.error_message, '')}`.trim(),
            occurredAt: String(run.finished_at || run.created_at),
            href: '/blastmessage',
            severity: status === 'failed' ? 'error' : 'warning',
          };
        }),
      );
    }
  }

  if (hasFeature(allowedFeatures, 'whatsapp')) {
    const [instanceEvents, qrInstances] = await Promise.all([
      supabase
        .from('whatsapp_instance_events')
        .select('id, whatsapp_instance_id, event_type, message, created_at')
        .in('event_type', ['ready', 'disconnected', 'auth_failed'])
        .gt('created_at', sinceIso)
        .lte('created_at', nowIso)
        .order('created_at', { ascending: true })
        .limit(MAX_EVENTS_PER_KIND),
      supabase
        .from('whatsapp_instances')
        .select('id, label, status, last_qr_at, updated_at, last_error')
        .eq('status', 'qr_required')
        .gt('last_qr_at', sinceIso)
        .lte('last_qr_at', nowIso)
        .order('last_qr_at', { ascending: true })
        .limit(MAX_EVENTS_PER_KIND),
    ]);

    if (instanceEvents.error) {
      logNotificationQueryError('whatsapp_instance_events', instanceEvents.error);
    } else {
      eventGroups.push(compactEvents(
        (instanceEvents.data || []).map((event) => {
          const isReady = event.event_type === 'ready';
          const instanceId = String(event.whatsapp_instance_id);

          return {
            id: `whatsapp_instance:${event.id}`,
            type: isReady ? 'whatsapp_instance_ready' : 'whatsapp_instance_problem',
            title: isReady ? 'WhatsApp instance siap kembali' : 'WhatsApp instance bermasalah',
            message: `${instanceId}: ${text(event.message, isReady ? 'Instance sudah ready' : String(event.event_type))}`,
            occurredAt: String(event.created_at),
            href: '/whatsapp',
            severity: isReady ? 'success' : 'error',
          };
        }),
      ));
    }

    if (qrInstances.error) {
      logNotificationQueryError('whatsapp_instance_qr', qrInstances.error);
    } else {
      eventGroups.push((qrInstances.data || []).map((instance) => ({
        id: `whatsapp_instance_qr:${instance.id}:${instance.last_qr_at}`,
        type: 'whatsapp_instance_problem',
        title: 'WhatsApp instance perlu QR',
        message: `${text(instance.label, String(instance.id))}: perlu scan QR ulang`,
        occurredAt: String(instance.last_qr_at || instance.updated_at),
        href: '/whatsapp',
        severity: 'warning',
      })));
    }
  }

  return {
    events: eventGroups
      .flat()
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    cursor: nowIso,
  };
}
