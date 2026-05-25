import 'server-only';

import { sql } from 'drizzle-orm';

import type { FeatureKey } from './access-control';
import { db } from './db/client';

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

function rowsFromResult<T>(result: { rows?: unknown[] }): T[] {
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}

function logNotificationQueryError(scope: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event: 'admin_notification_query_failed',
      scope,
      reason: error instanceof Error ? error.message : String(error),
    }),
  );
}

export async function listAdminNotificationEvents(
  since: string | null,
  allowedFeatures: FeatureKey[],
  now = new Date(),
): Promise<{ events: AdminNotificationEvent[]; cursor: string }> {
  const nowIso = now.toISOString();
  const sinceIso = parseSince(since, now.getTime());
  const eventGroups: AdminNotificationEvent[][] = [];

  if (hasFeature(allowedFeatures, 'ticket')) {
    try {
      const tickets = await db.execute(sql`
        select id, subject, phone_number, user_email, channel, created_at::text
        from public.tickets
        where created_at > ${sinceIso}::timestamptz
          and created_at <= ${nowIso}::timestamptz
        order by created_at asc
        limit ${MAX_EVENTS_PER_KIND}
      `);

      eventGroups.push(rowsFromResult<{
        id: unknown;
        subject: unknown;
        phone_number: unknown;
        user_email: unknown;
        channel: unknown;
        created_at: unknown;
      }>(tickets).map((ticket) => {
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
    } catch (error) {
      logNotificationQueryError('ticket_created', error);
    }

    try {
      const customerReplies = await db.execute(sql`
        select replies.id, replies.ticket_id, replies.content, replies.created_at::text, tickets.subject as ticket_subject
        from public.replies
        left join public.tickets on tickets.id = replies.ticket_id
        where replies.sender_type = 'customer'
          and replies.created_at > ${sinceIso}::timestamptz
          and replies.created_at <= ${nowIso}::timestamptz
        order by replies.created_at asc
        limit ${MAX_EVENTS_PER_KIND}
      `);

      eventGroups.push(rowsFromResult<{
        id: unknown;
        ticket_id: unknown;
        content: unknown;
        created_at: unknown;
        ticket_subject: unknown;
      }>(customerReplies).map((reply) => {
        const ticketId = String(reply.ticket_id);

        return {
          id: `ticket_customer_reply:${reply.id}`,
          type: 'ticket_customer_reply',
          title: 'Balasan ticket baru',
          message: `${text(reply.ticket_subject, `Tiket ${ticketId}`)}: ${text(reply.content, 'Pesan baru')}`,
          occurredAt: String(reply.created_at),
          href: `/ticket/${ticketId}`,
          severity: 'info',
        };
      }));
    } catch (error) {
      logNotificationQueryError('ticket_customer_reply', error);
    }

    try {
      const failedTicketReplies = await db.execute(sql`
        select id, ticket_id, recipient_phone_number, updated_at::text, last_delivery_error
        from public.outbound_messages
        where source_type = 'ticket_reply'
          and delivery_status = 'failed'
          and updated_at > ${sinceIso}::timestamptz
          and updated_at <= ${nowIso}::timestamptz
        order by updated_at asc
        limit ${MAX_EVENTS_PER_KIND}
      `);

      eventGroups.push(rowsFromResult<{
        id: unknown;
        ticket_id: unknown;
        recipient_phone_number: unknown;
        updated_at: unknown;
        last_delivery_error: unknown;
      }>(failedTicketReplies).map((message) => {
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
    } catch (error) {
      logNotificationQueryError('ticket_reply_failed', error);
    }
  }

  if (hasFeature(allowedFeatures, 'blast') || hasFeature(allowedFeatures, 'whatsapp')) {
    try {
      const result = await db.execute(sql`
        select id, source_type, recipient_phone_number, client_reference, updated_at::text, last_delivery_error
        from public.outbound_messages
        where source_type in ('blast', 'api_notification')
          and delivery_status = 'failed'
          and updated_at > ${sinceIso}::timestamptz
          and updated_at <= ${nowIso}::timestamptz
        order by updated_at asc
        limit ${MAX_EVENTS_PER_KIND}
      `);

      eventGroups.push(
        rowsFromResult<{
          id: unknown;
          source_type: unknown;
          recipient_phone_number: unknown;
          client_reference: unknown;
          updated_at: unknown;
          last_delivery_error: unknown;
        }>(result).map((message) => {
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
    } catch (error) {
      logNotificationQueryError('outbound_failed', error);
    }
  }

  if (hasFeature(allowedFeatures, 'blast')) {
    try {
      const result = await db.execute(sql`
        select
          scheduled_blast_runs.id,
          scheduled_blast_runs.scheduled_blast_id,
          scheduled_blast_runs.status,
          scheduled_blast_runs.failed_count,
          scheduled_blast_runs.total_recipients,
          scheduled_blast_runs.error_message,
          scheduled_blast_runs.finished_at::text,
          scheduled_blast_runs.created_at::text,
          scheduled_blasts.name as scheduled_blast_name
        from public.scheduled_blast_runs
        left join public.scheduled_blasts on scheduled_blasts.id = scheduled_blast_runs.scheduled_blast_id
        where scheduled_blast_runs.status in ('partial', 'failed')
          and scheduled_blast_runs.finished_at > ${sinceIso}::timestamptz
          and scheduled_blast_runs.finished_at <= ${nowIso}::timestamptz
        order by scheduled_blast_runs.finished_at asc
        limit ${MAX_EVENTS_PER_KIND}
      `);

      eventGroups.push(
        rowsFromResult<{
          id: unknown;
          status: unknown;
          failed_count: unknown;
          total_recipients: unknown;
          error_message: unknown;
          finished_at: unknown;
          created_at: unknown;
          scheduled_blast_name: unknown;
        }>(result).map((run) => {
          const failedCount = Number(run.failed_count || 0);
          const status = run.status === 'failed' ? 'failed' : 'partial';

          return {
            id: `scheduled_blast_${status}:${run.id}:${run.finished_at}`,
            type: status === 'failed' ? 'scheduled_blast_failed' : 'scheduled_blast_partial',
            title: status === 'failed' ? 'Scheduled blast gagal' : 'Scheduled blast sebagian gagal',
            message: `${text(run.scheduled_blast_name, 'Scheduled blast')}: ${failedCount} dari ${Number(run.total_recipients || 0)} gagal. ${text(run.error_message, '')}`.trim(),
            occurredAt: String(run.finished_at || run.created_at),
            href: '/blastmessage',
            severity: status === 'failed' ? 'error' : 'warning',
          };
        }),
      );
    } catch (error) {
      logNotificationQueryError('scheduled_blast', error);
    }
  }

  if (hasFeature(allowedFeatures, 'whatsapp')) {
    try {
      const instanceEvents = await db.execute(sql`
        select id, whatsapp_instance_id, event_type, message, created_at::text
        from public.whatsapp_instance_events
        where event_type in ('ready', 'disconnected', 'auth_failed')
          and created_at > ${sinceIso}::timestamptz
          and created_at <= ${nowIso}::timestamptz
        order by created_at asc
        limit ${MAX_EVENTS_PER_KIND}
      `);

      eventGroups.push(compactEvents(
        rowsFromResult<{
          id: unknown;
          whatsapp_instance_id: unknown;
          event_type: unknown;
          message: unknown;
          created_at: unknown;
        }>(instanceEvents).map((event) => {
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
    } catch (error) {
      logNotificationQueryError('whatsapp_instance_events', error);
    }

    try {
      const qrInstances = await db.execute(sql`
        select id, label, status, last_qr_at::text, updated_at::text, last_error
        from public.whatsapp_instances
        where status = 'qr_required'
          and last_qr_at > ${sinceIso}::timestamptz
          and last_qr_at <= ${nowIso}::timestamptz
        order by last_qr_at asc
        limit ${MAX_EVENTS_PER_KIND}
      `);

      eventGroups.push(rowsFromResult<{
        id: unknown;
        label: unknown;
        last_qr_at: unknown;
        updated_at: unknown;
      }>(qrInstances).map((instance) => ({
        id: `whatsapp_instance_qr:${instance.id}:${instance.last_qr_at}`,
        type: 'whatsapp_instance_problem',
        title: 'WhatsApp instance perlu QR',
        message: `${text(instance.label, String(instance.id))}: perlu scan QR ulang`,
        occurredAt: String(instance.last_qr_at || instance.updated_at),
        href: '/whatsapp',
        severity: 'warning',
      })));
    } catch (error) {
      logNotificationQueryError('whatsapp_instance_qr', error);
    }
  }

  return {
    events: eventGroups
      .flat()
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    cursor: nowIso,
  };
}
