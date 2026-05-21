import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from './db/client';
import { readWhatsappInstanceRuntime } from './whatsapp-ops-runtime';
import type {
  CreateWhatsappInstanceInput,
  UpdateWhatsappInstanceInput,
  WhatsappOpsRepository,
} from './whatsapp-ops-service';
import {
  type OutboundMessageStatus,
  type WhatsappInstanceEventRecord,
  type WhatsappInstanceQueueSummary,
  type WhatsappInstanceRecord,
  type WhatsappInstanceStaffSummary,
  type WhatsappOutboundListItem,
  type WhatsappOutboundSummary,
} from './whatsapp-notification-utils';
import {
  getOrCreateDefaultWhatsappInstance,
} from './whatsapp-notification-repository';

const ACTIVE_WHATSAPP_TICKET_STATUSES = ['Open', 'In Progress'];
const QUEUED_OUTBOUND_STATUSES: OutboundMessageStatus[] = ['queued', 'retrying'];

type OutboundCountFilters = {
  whatsappInstanceId?: string;
  sourceType?: 'api_notification' | 'ticket_reply' | 'blast';
  deliveryStatus?: OutboundMessageStatus;
  deliveryStatuses?: OutboundMessageStatus[];
};

function rowsFromResult<T>(result: { rows?: unknown[] }): T[] {
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}

function firstRowFromResult<T>(result: { rows?: unknown[] }): T | null {
  return rowsFromResult<T>(result)[0] ?? null;
}

async function countOutboundMessages(filters: OutboundCountFilters): Promise<number> {
  const result = await db.execute(sql`
    select count(*)::integer as count
    from public.outbound_messages
    where (${filters.whatsappInstanceId ?? null}::text is null or whatsapp_instance_id = ${filters.whatsappInstanceId ?? null})
      and (${filters.sourceType ?? null}::text is null or source_type = ${filters.sourceType ?? null})
      and (${filters.deliveryStatus ?? null}::text is null or delivery_status = ${filters.deliveryStatus ?? null})
      and (${filters.deliveryStatuses ?? null}::text[] is null or delivery_status = any(${filters.deliveryStatuses ?? null}::text[]))
  `);

  return Number(firstRowFromResult<{ count: number }>(result)?.count || 0);
}

async function getOldestQueuedAt(whatsappInstanceId?: string): Promise<string | null> {
  const result = await db.execute(sql`
    select created_at::text
    from public.outbound_messages
    where delivery_status = any(${QUEUED_OUTBOUND_STATUSES}::text[])
      and (${whatsappInstanceId ?? null}::text is null or whatsapp_instance_id = ${whatsappInstanceId ?? null})
    order by created_at asc
    limit 1
  `);

  return firstRowFromResult<{ created_at: string | null }>(result)?.created_at || null;
}

async function getInstanceLabels(): Promise<Map<string, string>> {
  const result = await db.execute(sql`select id, label from public.whatsapp_instances`);
  const labelById = new Map<string, string>();
  rowsFromResult<{ id: string; label: string }>(result).forEach((instance) => {
    labelById.set(instance.id, instance.label);
  });
  return labelById;
}

function withInstanceLabels(
  rows: Omit<WhatsappOutboundListItem, 'instance_label'>[],
  labelById: Map<string, string>,
): WhatsappOutboundListItem[] {
  return rows.map((item) => ({
    ...item,
    instance_label: labelById.get(item.whatsapp_instance_id) || null,
  }));
}

export function createWhatsappOpsRepository(): WhatsappOpsRepository {
  return {
    async listInstances(): Promise<WhatsappInstanceRecord[]> {
      await getOrCreateDefaultWhatsappInstance();
      const result = await db.execute(sql`
        select *
        from public.whatsapp_instances
        where retired_at is null
        order by label asc
      `);

      return rowsFromResult<WhatsappInstanceRecord>(result);
    },

    async createInstance(input: CreateWhatsappInstanceInput): Promise<WhatsappInstanceRecord> {
      try {
        const now = new Date().toISOString();
        const result = await db.execute(sql`
          insert into public.whatsapp_instances (id, label, is_enabled, status, updated_at)
          values (${input.id}, ${input.label}, ${input.is_enabled ?? true}, 'starting', ${now})
          returning *
        `);

        return firstRowFromResult<WhatsappInstanceRecord>(result)!;
      } catch (error) {
        if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
          throw new Error('WhatsApp instance already exists.');
        }
        throw error;
      }
    },

    async updateInstance(
      instanceId: string,
      input: UpdateWhatsappInstanceInput,
    ): Promise<WhatsappInstanceRecord> {
      const currentResult = await db.execute(sql`
        select * from public.whatsapp_instances where id = ${instanceId} limit 1
      `);
      const current = firstRowFromResult<WhatsappInstanceRecord>(currentResult);

      if (!current) {
        throw new Error('WhatsApp instance not found.');
      }

      const nextLabel = input.label !== undefined ? input.label : current.label;
      const nextIsEnabled = input.is_enabled !== undefined ? input.is_enabled : current.is_enabled;
      const nextRetiredAt = input.is_enabled ? null : input.retired_at !== undefined ? input.retired_at : current.retired_at;
      const result = await db.execute(sql`
        update public.whatsapp_instances
        set
          label = ${nextLabel},
          is_enabled = ${nextIsEnabled},
          retired_at = ${nextRetiredAt},
          updated_at = ${new Date().toISOString()}
        where id = ${instanceId}
        returning *
      `);

      return firstRowFromResult<WhatsappInstanceRecord>(result)!;
    },

    async deleteInstance(instanceId: string): Promise<void> {
      const outboundMessageCount = await countOutboundMessages({ whatsappInstanceId: instanceId });

      if (outboundMessageCount > 0) {
        throw new Error('WhatsApp instance still has related delivery history and cannot be removed completely.');
      }

      await db.execute(sql`delete from public.whatsapp_instances where id = ${instanceId}`);
    },

    async assertInstanceCanBeDeleted(instanceId: string): Promise<void> {
      const outboundMessageCount = await countOutboundMessages({ whatsappInstanceId: instanceId });

      if (outboundMessageCount > 0) {
        throw new Error('WhatsApp instance still has related delivery history and cannot be removed completely.');
      }
    },

    async getInstanceRuntime(instanceId: string) {
      return readWhatsappInstanceRuntime(instanceId);
    },

    async getInstanceQueueSummary(instanceId: string): Promise<WhatsappInstanceQueueSummary> {
      const [
        queuedTicketReplies,
        queuedApiNotifications,
        queuedBlastMessages,
        retryingMessages,
        failedMessages,
        sentMessages,
        oldestQueuedAt,
      ] = await Promise.all([
        countOutboundMessages({ whatsappInstanceId: instanceId, sourceType: 'ticket_reply', deliveryStatuses: QUEUED_OUTBOUND_STATUSES }),
        countOutboundMessages({ whatsappInstanceId: instanceId, sourceType: 'api_notification', deliveryStatuses: QUEUED_OUTBOUND_STATUSES }),
        countOutboundMessages({ whatsappInstanceId: instanceId, sourceType: 'blast', deliveryStatuses: QUEUED_OUTBOUND_STATUSES }),
        countOutboundMessages({ whatsappInstanceId: instanceId, deliveryStatus: 'retrying' }),
        countOutboundMessages({ whatsappInstanceId: instanceId, deliveryStatus: 'failed' }),
        countOutboundMessages({ whatsappInstanceId: instanceId, deliveryStatus: 'sent' }),
        getOldestQueuedAt(instanceId),
      ]);

      return {
        queued_ticket_replies: queuedTicketReplies,
        queued_api_notifications: queuedApiNotifications,
        queued_blast_messages: queuedBlastMessages,
        retrying_messages: retryingMessages,
        failed_messages: failedMessages,
        sent_messages: sentMessages,
        oldest_queued_at: oldestQueuedAt,
      };
    },

    async getInstanceStaffSummary(instanceId: string): Promise<WhatsappInstanceStaffSummary> {
      const result = await db.execute(sql`
        select
          (
            select count(*)::integer
            from public.tickets
            where channel = 'whatsapp'
              and whatsapp_instance_id = ${instanceId}
              and status = any(${ACTIVE_WHATSAPP_TICKET_STATUSES}::text[])
          ) as active_ticket_count,
          latest_ticket.id as latest_ticket_id,
          latest_ticket.subject as latest_ticket_subject,
          latest_ticket.updated_at::text as latest_ticket_updated_at,
          latest_contact.last_message_preview as latest_inbound_preview,
          latest_contact.last_inbound_at::text as latest_inbound_at,
          latest_outbound.delivery_status as latest_outbound_reply_status
        from (select 1) seed
        left join lateral (
          select id, subject, updated_at
          from public.tickets
          where channel = 'whatsapp'
            and whatsapp_instance_id = ${instanceId}
          order by updated_at desc
          limit 1
        ) latest_ticket on true
        left join lateral (
          select last_message_preview, last_inbound_at
          from public.whatsapp_contacts
          where whatsapp_instance_id = ${instanceId}
          order by last_inbound_at desc
          limit 1
        ) latest_contact on true
        left join lateral (
          select delivery_status
          from public.outbound_messages
          where whatsapp_instance_id = ${instanceId}
            and source_type = 'ticket_reply'
          order by created_at desc
          limit 1
        ) latest_outbound on true
      `);

      const row = firstRowFromResult<WhatsappInstanceStaffSummary>(result);
      return {
        active_ticket_count: Number(row?.active_ticket_count || 0),
        latest_ticket_id: row?.latest_ticket_id || null,
        latest_ticket_subject: row?.latest_ticket_subject || null,
        latest_ticket_updated_at: row?.latest_ticket_updated_at || null,
        latest_inbound_preview: row?.latest_inbound_preview || null,
        latest_inbound_at: row?.latest_inbound_at || null,
        latest_outbound_reply_status: row?.latest_outbound_reply_status || null,
      };
    },

    async listInstanceEvents(instanceId: string, limit: number): Promise<WhatsappInstanceEventRecord[]> {
      const result = await db.execute(sql`
        select *
        from public.whatsapp_instance_events
        where whatsapp_instance_id = ${instanceId}
        order by created_at desc
        limit ${limit}
      `);

      return rowsFromResult<WhatsappInstanceEventRecord>(result);
    },

    async getGlobalQueueCounts() {
      const [queuedTicketReplies, queuedApiNotifications, queuedBlastMessages] = await Promise.all([
        countOutboundMessages({ sourceType: 'ticket_reply', deliveryStatuses: QUEUED_OUTBOUND_STATUSES }),
        countOutboundMessages({ sourceType: 'api_notification', deliveryStatuses: QUEUED_OUTBOUND_STATUSES }),
        countOutboundMessages({ sourceType: 'blast', deliveryStatuses: QUEUED_OUTBOUND_STATUSES }),
      ]);

      return {
        queued_ticket_replies: queuedTicketReplies,
        queued_api_notifications: queuedApiNotifications,
        queued_blast_messages: queuedBlastMessages,
      };
    },

    async getGlobalFailedRetryingCount(): Promise<number> {
      const [failedCount, retryingCount] = await Promise.all([
        countOutboundMessages({ deliveryStatus: 'failed' }),
        countOutboundMessages({ deliveryStatus: 'retrying' }),
      ]);

      return failedCount + retryingCount;
    },

    async getGlobalOldestQueuedAt(): Promise<string | null> {
      return getOldestQueuedAt();
    },

    async listRecentOutbound(limit: number): Promise<WhatsappOutboundListItem[]> {
      const [messages, labelById] = await Promise.all([
        db.execute(sql`
          select id, whatsapp_instance_id, ticket_id, source_type, delivery_status, recipient_phone_number, client_reference, created_at::text, delivered_at::text, last_delivery_error
          from public.outbound_messages
          order by created_at desc
          limit ${limit}
        `),
        getInstanceLabels(),
      ]);

      return withInstanceLabels(rowsFromResult<Omit<WhatsappOutboundListItem, 'instance_label'>>(messages), labelById);
    },

    async listOutboundByIds(ids: string[]): Promise<WhatsappOutboundListItem[]> {
      const normalizedIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));

      if (!normalizedIds.length) {
        return [];
      }

      const [messages, labelById] = await Promise.all([
        db.execute(sql`
          select id, whatsapp_instance_id, ticket_id, source_type, delivery_status, recipient_phone_number, client_reference, created_at::text, delivered_at::text, last_delivery_error
          from public.outbound_messages
          where id = any(${normalizedIds}::uuid[])
          order by created_at desc
        `),
        getInstanceLabels(),
      ]);

      return withInstanceLabels(rowsFromResult<Omit<WhatsappOutboundListItem, 'instance_label'>>(messages), labelById);
    },

    async getOutboundSummary(): Promise<WhatsappOutboundSummary> {
      const [queued, retrying, failed, sent, ticketReply, apiNotification, blast] = await Promise.all([
        countOutboundMessages({ deliveryStatus: 'queued' }),
        countOutboundMessages({ deliveryStatus: 'retrying' }),
        countOutboundMessages({ deliveryStatus: 'failed' }),
        countOutboundMessages({ deliveryStatus: 'sent' }),
        countOutboundMessages({ sourceType: 'ticket_reply' }),
        countOutboundMessages({ sourceType: 'api_notification' }),
        countOutboundMessages({ sourceType: 'blast' }),
      ]);

      return {
        queued,
        retrying,
        failed,
        sent,
        ticket_reply: ticketReply,
        api_notification: apiNotification,
        blast,
      };
    },
  };
}
