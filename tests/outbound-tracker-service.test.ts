import { describe, expect, it, vi } from 'vitest';

vi.mock('../app/lib/whatsapp-notification-utils', () => ({
  computeEffectiveMinGapMs: (globalMessagesPerMinute: number) =>
    Math.ceil(60000 / Math.max(1, globalMessagesPerMinute)),
}));

import { getOutboundTrackerResponse, type OutboundTrackerRepository } from '../app/lib/outbound-tracker-service';

class InMemoryOutboundTrackerRepository implements OutboundTrackerRepository {
  paused = false;

  async listOutboundByIds(ids: string[]) {
    return [
      {
        id: 'outbound-1',
        whatsapp_instance_id: 'default',
        instance_label: 'Primary WhatsApp',
        ticket_id: 'ticket-1',
        source_type: 'ticket_reply' as const,
        delivery_status: 'queued' as const,
        recipient_phone_number: '6281234567890',
        client_reference: null,
        created_at: '2026-04-21T10:00:00.000Z',
        delivered_at: null,
        last_delivery_error: null,
      },
      {
        id: 'outbound-2',
        whatsapp_instance_id: 'default',
        instance_label: 'Primary WhatsApp',
        ticket_id: null,
        source_type: 'blast' as const,
        delivery_status: 'retrying' as const,
        recipient_phone_number: '6282222222222',
        client_reference: null,
        created_at: '2026-04-21T10:01:00.000Z',
        delivered_at: null,
        last_delivery_error: 'Temporary error',
      },
      {
        id: 'outbound-3',
        whatsapp_instance_id: 'default',
        instance_label: 'Primary WhatsApp',
        ticket_id: null,
        source_type: 'api_notification' as const,
        delivery_status: 'failed' as const,
        recipient_phone_number: '6283333333333',
        client_reference: 'api-123',
        created_at: '2026-04-21T10:02:00.000Z',
        delivered_at: null,
        last_delivery_error: 'Invalid recipient',
      },
      {
        id: 'outbound-4',
        whatsapp_instance_id: 'default',
        instance_label: 'Primary WhatsApp',
        ticket_id: null,
        source_type: 'blast' as const,
        delivery_status: 'sent' as const,
        recipient_phone_number: '6284444444444',
        client_reference: null,
        created_at: '2026-04-21T10:03:00.000Z',
        delivered_at: '2026-04-21T10:04:00.000Z',
        last_delivery_error: null,
      },
    ].filter((item) => ids.includes(item.id));
  }

  async getDispatchSettings() {
    return {
      id: 'default',
      global_messages_per_minute: 30,
      api_notifications_paused: this.paused,
      updated_at: '2026-04-21T10:00:00.000Z',
    };
  }
}

describe('outbound tracker service', () => {
  it('builds a blast-aware tracker payload with ETA', async () => {
    const response = await getOutboundTrackerResponse(new InMemoryOutboundTrackerRepository(), [
      'outbound-1',
      'outbound-2',
      'outbound-3',
      'outbound-4',
    ]);

    expect(response.summary).toMatchObject({
      queued: 1,
      retrying: 1,
      failed: 1,
      sent: 1,
      active: 2,
      total: 4,
      ticket_reply: 1,
      api_notification: 1,
      blast: 2,
      queued_ticket_replies: 1,
      queued_api_notifications: 0,
      queued_blast_messages: 1,
      effective_min_gap_ms: 2000,
      api_notifications_paused: false,
      estimated_completion_seconds: 4,
    });
    expect(response.items).toHaveLength(4);
  });

  it('returns a null ETA when non-ticket outbound traffic is paused', async () => {
    const repository = new InMemoryOutboundTrackerRepository();
    repository.paused = true;

    const response = await getOutboundTrackerResponse(repository, ['outbound-2']);

    expect(response.summary.api_notifications_paused).toBe(true);
    expect(response.summary.estimated_completion_seconds).toBeNull();
  });
});
