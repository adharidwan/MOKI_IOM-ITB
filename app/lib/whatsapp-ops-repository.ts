import 'server-only';

import { getSupabaseAdminClient } from './supabase-server';
import { readWhatsappInstanceRuntime } from './whatsapp-ops-runtime';
import type { WhatsappOpsRepository } from './whatsapp-ops-service';
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

async function countOutboundMessages(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  filters: {
    whatsappInstanceId?: string;
    sourceType?: 'api_notification' | 'ticket_reply' | 'blast';
    deliveryStatus?: OutboundMessageStatus;
    deliveryStatuses?: OutboundMessageStatus[];
  },
): Promise<number> {
  let query = supabase.from('outbound_messages').select('id', { count: 'exact', head: true });

  if (filters.whatsappInstanceId) {
    query = query.eq('whatsapp_instance_id', filters.whatsappInstanceId);
  }

  if (filters.sourceType) {
    query = query.eq('source_type', filters.sourceType);
  }

  if (filters.deliveryStatus) {
    query = query.eq('delivery_status', filters.deliveryStatus);
  }

  if (filters.deliveryStatuses) {
    query = query.in('delivery_status', filters.deliveryStatuses);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to count outbound messages: ${error.message}`);
  }

  return count || 0;
}

async function getOldestQueuedAt(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  whatsappInstanceId?: string,
): Promise<string | null> {
  let query = supabase
    .from('outbound_messages')
    .select('created_at')
    .in('delivery_status', QUEUED_OUTBOUND_STATUSES)
    .order('created_at', { ascending: true })
    .limit(1);

  if (whatsappInstanceId) {
    query = query.eq('whatsapp_instance_id', whatsappInstanceId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch oldest queued outbound message: ${error.message}`);
  }

  return data?.created_at || null;
}

export function createWhatsappOpsRepository(): WhatsappOpsRepository {
  const supabase = getSupabaseAdminClient();

  return {
    async listInstances(): Promise<WhatsappInstanceRecord[]> {
      await getOrCreateDefaultWhatsappInstance();
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .order('label', { ascending: true });

      if (error) {
        throw new Error(`Failed to load WhatsApp instances: ${error.message}`);
      }

      return (data as WhatsappInstanceRecord[]) || [];
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
        countOutboundMessages(supabase, {
          whatsappInstanceId: instanceId,
          sourceType: 'ticket_reply',
          deliveryStatuses: QUEUED_OUTBOUND_STATUSES,
        }),
        countOutboundMessages(supabase, {
          whatsappInstanceId: instanceId,
          sourceType: 'api_notification',
          deliveryStatuses: QUEUED_OUTBOUND_STATUSES,
        }),
        countOutboundMessages(supabase, {
          whatsappInstanceId: instanceId,
          sourceType: 'blast',
          deliveryStatuses: QUEUED_OUTBOUND_STATUSES,
        }),
        countOutboundMessages(supabase, {
          whatsappInstanceId: instanceId,
          deliveryStatus: 'retrying',
        }),
        countOutboundMessages(supabase, {
          whatsappInstanceId: instanceId,
          deliveryStatus: 'failed',
        }),
        countOutboundMessages(supabase, {
          whatsappInstanceId: instanceId,
          deliveryStatus: 'sent',
        }),
        getOldestQueuedAt(supabase, instanceId),
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
      const [{ count: activeTicketCount, error: activeTicketError }, latestTicketResult, latestContactResult, latestOutboundReplyResult] =
        await Promise.all([
          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('channel', 'whatsapp')
            .eq('whatsapp_instance_id', instanceId)
            .in('status', ACTIVE_WHATSAPP_TICKET_STATUSES),
          supabase
            .from('tickets')
            .select('id, subject, updated_at')
            .eq('channel', 'whatsapp')
            .eq('whatsapp_instance_id', instanceId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('whatsapp_contacts')
            .select('last_message_preview, last_inbound_at')
            .eq('whatsapp_instance_id', instanceId)
            .order('last_inbound_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('outbound_messages')
            .select('delivery_status')
            .eq('whatsapp_instance_id', instanceId)
            .eq('source_type', 'ticket_reply')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (activeTicketError) {
        throw new Error(`Failed to count active WhatsApp tickets: ${activeTicketError.message}`);
      }

      if (latestTicketResult.error) {
        throw new Error(`Failed to load latest WhatsApp ticket: ${latestTicketResult.error.message}`);
      }

      if (latestContactResult.error) {
        throw new Error(`Failed to load latest WhatsApp contact activity: ${latestContactResult.error.message}`);
      }

      if (latestOutboundReplyResult.error) {
        throw new Error(
          `Failed to load latest WhatsApp outbound reply state: ${latestOutboundReplyResult.error.message}`,
        );
      }

      return {
        active_ticket_count: activeTicketCount || 0,
        latest_ticket_id: latestTicketResult.data?.id || null,
        latest_ticket_subject: latestTicketResult.data?.subject || null,
        latest_ticket_updated_at: latestTicketResult.data?.updated_at || null,
        latest_inbound_preview: latestContactResult.data?.last_message_preview || null,
        latest_inbound_at: latestContactResult.data?.last_inbound_at || null,
        latest_outbound_reply_status: latestOutboundReplyResult.data?.delivery_status || null,
      };
    },

    async listInstanceEvents(instanceId: string, limit: number): Promise<WhatsappInstanceEventRecord[]> {
      const { data, error } = await supabase
        .from('whatsapp_instance_events')
        .select('*')
        .eq('whatsapp_instance_id', instanceId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to load WhatsApp instance events: ${error.message}`);
      }

      return (data as WhatsappInstanceEventRecord[]) || [];
    },

    async getGlobalQueueCounts() {
      const [queuedTicketReplies, queuedApiNotifications, queuedBlastMessages] = await Promise.all([
        countOutboundMessages(supabase, {
          sourceType: 'ticket_reply',
          deliveryStatuses: QUEUED_OUTBOUND_STATUSES,
        }),
        countOutboundMessages(supabase, {
          sourceType: 'api_notification',
          deliveryStatuses: QUEUED_OUTBOUND_STATUSES,
        }),
        countOutboundMessages(supabase, {
          sourceType: 'blast',
          deliveryStatuses: QUEUED_OUTBOUND_STATUSES,
        }),
      ]);

      return {
        queued_ticket_replies: queuedTicketReplies,
        queued_api_notifications: queuedApiNotifications,
        queued_blast_messages: queuedBlastMessages,
      };
    },

    async getGlobalFailedRetryingCount(): Promise<number> {
      const [failedCount, retryingCount] = await Promise.all([
        countOutboundMessages(supabase, { deliveryStatus: 'failed' }),
        countOutboundMessages(supabase, { deliveryStatus: 'retrying' }),
      ]);

      return failedCount + retryingCount;
    },

    async getGlobalOldestQueuedAt(): Promise<string | null> {
      return getOldestQueuedAt(supabase);
    },

    async listRecentOutbound(limit: number): Promise<WhatsappOutboundListItem[]> {
      const [{ data, error }, instances] = await Promise.all([
        supabase
          .from('outbound_messages')
          .select(
            'id, whatsapp_instance_id, ticket_id, source_type, delivery_status, recipient_phone_number, client_reference, created_at, delivered_at, last_delivery_error',
          )
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase.from('whatsapp_instances').select('id, label'),
      ]);

      if (error) {
        throw new Error(`Failed to load recent WhatsApp outbound messages: ${error.message}`);
      }

      if (instances.error) {
        throw new Error(`Failed to load WhatsApp instance labels: ${instances.error.message}`);
      }

      const labelById = new Map<string, string>();
      (instances.data || []).forEach((instance) => {
        labelById.set(instance.id as string, instance.label as string);
      });

      return ((data as Omit<WhatsappOutboundListItem, 'instance_label'>[]) || []).map((item) => ({
        ...item,
        instance_label: labelById.get(item.whatsapp_instance_id) || null,
      }));
    },

    async listOutboundByIds(ids: string[]): Promise<WhatsappOutboundListItem[]> {
      const normalizedIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));

      if (!normalizedIds.length) {
        return [];
      }

      const [{ data, error }, instances] = await Promise.all([
        supabase
          .from('outbound_messages')
          .select(
            'id, whatsapp_instance_id, ticket_id, source_type, delivery_status, recipient_phone_number, client_reference, created_at, delivered_at, last_delivery_error',
          )
          .in('id', normalizedIds)
          .order('created_at', { ascending: false }),
        supabase.from('whatsapp_instances').select('id, label'),
      ]);

      if (error) {
        throw new Error(`Failed to load tracked outbound messages: ${error.message}`);
      }

      if (instances.error) {
        throw new Error(`Failed to load WhatsApp instance labels: ${instances.error.message}`);
      }

      const labelById = new Map<string, string>();
      (instances.data || []).forEach((instance) => {
        labelById.set(instance.id as string, instance.label as string);
      });

      return ((data as Omit<WhatsappOutboundListItem, 'instance_label'>[]) || []).map((item) => ({
        ...item,
        instance_label: labelById.get(item.whatsapp_instance_id) || null,
      }));
    },

    async getOutboundSummary(): Promise<WhatsappOutboundSummary> {
      const [queued, retrying, failed, sent, ticketReply, apiNotification, blast] = await Promise.all([
        countOutboundMessages(supabase, { deliveryStatus: 'queued' }),
        countOutboundMessages(supabase, { deliveryStatus: 'retrying' }),
        countOutboundMessages(supabase, { deliveryStatus: 'failed' }),
        countOutboundMessages(supabase, { deliveryStatus: 'sent' }),
        countOutboundMessages(supabase, { sourceType: 'ticket_reply' }),
        countOutboundMessages(supabase, { sourceType: 'api_notification' }),
        countOutboundMessages(supabase, { sourceType: 'blast' }),
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
