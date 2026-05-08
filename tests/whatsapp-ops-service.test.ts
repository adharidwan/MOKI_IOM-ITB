import { describe, expect, it } from 'vitest';

import {
  deriveWhatsappInstanceStatus,
  getWhatsappDashboardOverview,
  handleGetWhatsappInstanceContainerRequest,
  handleGetWhatsappOutboundRequest,
  handleWhatsappInstanceContainerActionRequest,
  type WhatsappOpsRepository,
} from '../app/lib/whatsapp-ops-service';
import { WhatsappOrchestratorError, type WhatsappOrchestratorClient } from '../app/lib/whatsapp-orchestrator';
import type {
  WhatsappContainerState,
  WhatsappInstanceEventRecord,
  WhatsappInstanceRecord,
  WhatsappInstanceRuntime,
  WhatsappInstanceStaffSummary,
  WhatsappOutboundListItem,
} from '../app/lib/whatsapp-notification-utils';

class InMemoryWhatsappOpsRepository implements WhatsappOpsRepository {
  nowIso = new Date().toISOString();

  instances: WhatsappInstanceRecord[] = [
    {
      id: 'default',
      label: 'Primary WhatsApp',
      is_enabled: true,
      status: 'ready',
      last_known_phone_number: '6281234567890',
      last_known_chat_id: '6281234567890@c.us',
      last_ready_at: '2026-04-03T08:00:00.000Z',
      last_qr_at: null,
      last_disconnect_at: null,
      last_error: null,
      assigned_worker_id: 'worker-a',
      retired_at: null,
      updated_at: '2026-04-03T08:00:00.000Z',
    },
    {
      id: 'backup',
      label: 'Backup WhatsApp',
      is_enabled: true,
      status: 'qr_required',
      last_known_phone_number: null,
      last_known_chat_id: null,
      last_ready_at: null,
      last_qr_at: '2026-04-03T08:05:00.000Z',
      last_disconnect_at: null,
      last_error: null,
      assigned_worker_id: 'worker-b',
      retired_at: null,
      updated_at: '2026-04-03T08:05:00.000Z',
    },
  ];

  runtimes: Record<string, WhatsappInstanceRuntime | null> = {
    default: {
      instance_id: 'default',
      status: 'ready',
      worker_id: 'worker-a',
      worker_host: 'bot-1',
      worker_version: '0.1.0',
      assigned_worker_id: 'worker-a',
      last_heartbeat_at: this.nowIso,
      qr_code: null,
      qr_terminal: null,
      qr_generated_at: null,
      qr_expires_at: null,
      last_error: null,
      last_disconnect_at: null,
      reconnect_count_24h: 1,
      last_inbound_at: '2026-04-03T08:07:00.000Z',
      last_outbound_at: '2026-04-03T08:08:00.000Z',
      has_worker_conflict: false,
    },
    backup: {
      instance_id: 'backup',
      status: 'qr_required',
      worker_id: 'worker-b',
      worker_host: 'bot-2',
      worker_version: '0.1.0',
      assigned_worker_id: 'worker-b',
      last_heartbeat_at: this.nowIso,
      qr_code: 'qr-value',
      qr_terminal: 'ASCII QR',
      qr_generated_at: '2026-04-03T08:05:00.000Z',
      qr_expires_at: '2026-04-03T08:06:00.000Z',
      last_error: null,
      last_disconnect_at: null,
      reconnect_count_24h: 0,
      last_inbound_at: null,
      last_outbound_at: null,
      has_worker_conflict: false,
    },
  };

  async listInstances(): Promise<WhatsappInstanceRecord[]> {
    return this.instances;
  }

  async createInstance(input: { id: string; label: string; is_enabled?: boolean }): Promise<WhatsappInstanceRecord> {
    const instance: WhatsappInstanceRecord = {
      id: input.id,
      label: input.label,
      is_enabled: input.is_enabled ?? true,
      status: 'starting',
      last_known_phone_number: null,
      last_known_chat_id: null,
      last_ready_at: null,
      last_qr_at: null,
      last_disconnect_at: null,
      last_error: null,
      assigned_worker_id: null,
      retired_at: null,
      updated_at: this.nowIso,
    };

    this.instances.push(instance);
    return instance;
  }

  async updateInstance(instanceId: string, input: { label?: string; is_enabled?: boolean; retired_at?: string | null }): Promise<WhatsappInstanceRecord> {
    const instance = this.instances.find((item) => item.id === instanceId);

    if (!instance) {
      throw new Error('WhatsApp instance not found.');
    }

    if (input.label !== undefined) {
      instance.label = input.label;
    }

    if (input.is_enabled !== undefined) {
      instance.is_enabled = input.is_enabled;
    }

    if (input.retired_at !== undefined) {
      instance.retired_at = input.retired_at;
    }

    return instance;
  }

  async assertInstanceCanBeDeleted(): Promise<void> {}

  async deleteInstance(instanceId: string): Promise<void> {
    this.instances = this.instances.filter((instance) => instance.id !== instanceId);
  }

  async getInstanceRuntime(instanceId: string): Promise<WhatsappInstanceRuntime | null> {
    return this.runtimes[instanceId] || null;
  }

  async getInstanceQueueSummary(instanceId: string) {
    if (instanceId === 'default') {
      return {
        queued_ticket_replies: 2,
        queued_api_notifications: 3,
        queued_blast_messages: 4,
        retrying_messages: 1,
        failed_messages: 1,
        sent_messages: 10,
        oldest_queued_at: '2026-04-03T08:01:00.000Z',
      };
    }

    return {
      queued_ticket_replies: 0,
      queued_api_notifications: 0,
      queued_blast_messages: 0,
      retrying_messages: 0,
      failed_messages: 0,
      sent_messages: 0,
      oldest_queued_at: null,
    };
  }

  async getInstanceStaffSummary(instanceId: string): Promise<WhatsappInstanceStaffSummary> {
    return {
      active_ticket_count: instanceId === 'default' ? 2 : 0,
      latest_ticket_id: instanceId === 'default' ? 'ticket-1' : null,
      latest_ticket_subject: instanceId === 'default' ? 'Reset password' : null,
      latest_ticket_updated_at: instanceId === 'default' ? '2026-04-03T08:07:00.000Z' : null,
      latest_inbound_preview: instanceId === 'default' ? 'Halo, saya butuh bantuan' : null,
      latest_inbound_at: instanceId === 'default' ? '2026-04-03T08:07:00.000Z' : null,
      latest_outbound_reply_status: instanceId === 'default' ? 'sent' : null,
    };
  }

  async listInstanceEvents(instanceId: string, limit: number): Promise<WhatsappInstanceEventRecord[]> {
    void limit;
    return [
      {
        id: `event-${instanceId}`,
        whatsapp_instance_id: instanceId,
        event_type: 'ready',
        message: 'WhatsApp session ready.',
        metadata: null,
        created_at: '2026-04-03T08:00:00.000Z',
      },
    ];
  }

  async getGlobalQueueCounts() {
    return {
      queued_ticket_replies: 2,
      queued_api_notifications: 3,
      queued_blast_messages: 4,
    };
  }

  async getGlobalFailedRetryingCount(): Promise<number> {
    return 2;
  }

  async getGlobalOldestQueuedAt(): Promise<string | null> {
    return '2026-04-03T08:01:00.000Z';
  }

  async listRecentOutbound(limit: number): Promise<WhatsappOutboundListItem[]> {
    void limit;
    return [
      {
        id: 'outbound-1',
        whatsapp_instance_id: 'default',
        instance_label: 'Primary WhatsApp',
        ticket_id: 'ticket-1',
        source_type: 'ticket_reply',
        delivery_status: 'queued',
        recipient_phone_number: '6281234567890',
        client_reference: null,
        created_at: '2026-04-03T08:01:00.000Z',
        delivered_at: null,
        last_delivery_error: null,
      },
    ];
  }

  async listOutboundByIds(ids: string[]): Promise<WhatsappOutboundListItem[]> {
    const items = await this.listRecentOutbound(ids.length || 1);
    return items.filter((item) => ids.includes(item.id));
  }

  async getOutboundSummary() {
    return {
      queued: 1,
      retrying: 1,
      failed: 1,
      sent: 10,
      ticket_reply: 5,
      api_notification: 8,
      blast: 4,
    };
  }
}

class NotConfiguredWhatsappOrchestrator implements WhatsappOrchestratorClient {
  async getContainer(instanceId: string): Promise<WhatsappContainerState> {
    return {
      instance_id: instanceId,
      status: 'not_configured',
      container_name: null,
      image: null,
      created_at: null,
      started_at: null,
      last_error: 'WhatsApp Docker orchestrator is not configured.',
    };
  }

  async startInstance(): Promise<WhatsappContainerState> {
    throw new WhatsappOrchestratorError(
      503,
      'orchestrator_not_configured',
      'WhatsApp Docker orchestrator is not configured.',
    );
  }

  async stopInstance(): Promise<WhatsappContainerState> {
    throw new WhatsappOrchestratorError(
      503,
      'orchestrator_not_configured',
      'WhatsApp Docker orchestrator is not configured.',
    );
  }

  async restartInstance(): Promise<WhatsappContainerState> {
    throw new WhatsappOrchestratorError(
      503,
      'orchestrator_not_configured',
      'WhatsApp Docker orchestrator is not configured.',
    );
  }

  async removeInstance(): Promise<WhatsappContainerState> {
    throw new WhatsappOrchestratorError(
      503,
      'orchestrator_not_configured',
      'WhatsApp Docker orchestrator is not configured.',
    );
  }
}

describe('whatsapp ops service', () => {
  it('marks ready instances as degraded when heartbeat is stale', () => {
    const instance: WhatsappInstanceRecord = {
      id: 'default',
      label: 'Primary WhatsApp',
      is_enabled: true,
      status: 'ready',
      last_known_phone_number: null,
      last_known_chat_id: null,
      last_ready_at: null,
      last_qr_at: null,
      last_disconnect_at: null,
      last_error: null,
      assigned_worker_id: 'worker-a',
      retired_at: null,
      updated_at: '2026-04-03T08:00:00.000Z',
    };

    const runtime: WhatsappInstanceRuntime = {
      instance_id: 'default',
      status: 'ready',
      worker_id: 'worker-a',
      worker_host: 'bot-1',
      worker_version: '0.1.0',
      assigned_worker_id: 'worker-a',
      last_heartbeat_at: '2026-04-03T08:00:00.000Z',
      qr_code: null,
      qr_terminal: null,
      qr_generated_at: null,
      qr_expires_at: null,
      last_error: null,
      last_disconnect_at: null,
      reconnect_count_24h: 0,
      last_inbound_at: null,
      last_outbound_at: null,
      has_worker_conflict: false,
    };

    expect(
      deriveWhatsappInstanceStatus(instance, runtime, Date.parse('2026-04-03T08:01:00.000Z')),
    ).toBe('degraded');
  });

  it('aggregates hybrid dashboard data across instances', async () => {
    const response = await getWhatsappDashboardOverview(new InMemoryWhatsappOpsRepository());

    expect(response.summary).toEqual({
      total_instances: 2,
      ready_instances: 1,
      qr_required_instances: 1,
      degraded_instances: 0,
      queued_ticket_replies: 2,
      queued_api_notifications: 3,
      queued_blast_messages: 4,
      oldest_queued_at: '2026-04-03T08:01:00.000Z',
      failed_or_retrying_messages: 2,
    });
    expect(response.instances[0].staff.latest_ticket_id).toBe('ticket-1');
    expect(response.instances[1].has_qr).toBe(true);
  });

  it('returns outbound visibility payloads for the dashboard', async () => {
    const response = await handleGetWhatsappOutboundRequest(new InMemoryWhatsappOpsRepository());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      summary: {
        queued: 1,
        retrying: 1,
        failed: 1,
        sent: 10,
        ticket_reply: 5,
        api_notification: 8,
        blast: 4,
      },
      items: [
        {
          id: 'outbound-1',
          whatsapp_instance_id: 'default',
          instance_label: 'Primary WhatsApp',
          ticket_id: 'ticket-1',
          source_type: 'ticket_reply',
          delivery_status: 'queued',
          recipient_phone_number: '6281234567890',
          client_reference: null,
          created_at: '2026-04-03T08:01:00.000Z',
          delivered_at: null,
          last_delivery_error: null,
        },
      ],
    });
  });

  it('returns safe container state when orchestrator is unavailable', async () => {
    const response = await handleGetWhatsappInstanceContainerRequest(
      'default',
      new InMemoryWhatsappOpsRepository(),
      new NotConfiguredWhatsappOrchestrator(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      instance_id: 'default',
      status: 'not_configured',
    });
  });

  it('blocks lifecycle actions when orchestrator is unavailable', async () => {
    const response = await handleWhatsappInstanceContainerActionRequest(
      'start',
      'default',
      new InMemoryWhatsappOpsRepository(),
      new NotConfiguredWhatsappOrchestrator(),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'orchestrator_not_configured',
        message: 'WhatsApp Docker orchestrator is not configured.',
      },
    });
  });
});
