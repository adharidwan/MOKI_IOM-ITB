import { describe, expect, it } from 'vitest';

import {
  handleGetOutboundDispatchSettingsRequest,
  handlePatchOutboundDispatchSettingsRequest,
} from '../app/lib/outbound-dispatch-service';
import type { DispatchSettingsRecord } from '../app/lib/whatsapp-notification-utils';

class InMemoryDispatchControlRepository {
  settings: DispatchSettingsRecord = {
    id: 'default',
    global_messages_per_minute: 24,
    api_notifications_paused: false,
    updated_at: '2026-03-31T05:30:00.000Z',
  };
  queuedApiNotifications = 3;
  queuedTicketReplies = 1;

  async getDispatchSettings(): Promise<DispatchSettingsRecord> {
    return this.settings;
  }

  async updateDispatchSettings(patch: {
    global_messages_per_minute?: number;
    api_notifications_paused?: boolean;
  }): Promise<DispatchSettingsRecord> {
    this.settings = {
      ...this.settings,
      ...patch,
      updated_at: '2026-03-31T05:35:00.000Z',
    };

    return this.settings;
  }

  async countQueuedOutboundMessagesBySource(
    sourceType: 'api_notification' | 'ticket_reply',
  ): Promise<number> {
    return sourceType === 'api_notification'
      ? this.queuedApiNotifications
      : this.queuedTicketReplies;
  }
}

describe('outbound dispatch settings service', () => {
  it('returns current settings with live queue summary', async () => {
    const repository = new InMemoryDispatchControlRepository();
    const response = await handleGetOutboundDispatchSettingsRequest(repository);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      global_messages_per_minute: 24,
      api_notifications_paused: false,
      effective_min_gap_ms: 2500,
      queued_ticket_replies: 1,
      queued_api_notifications: 3,
      updated_at: '2026-03-31T05:30:00.000Z',
    });
  });

  it('updates the dispatch settings through PATCH', async () => {
    const repository = new InMemoryDispatchControlRepository();
    const response = await handlePatchOutboundDispatchSettingsRequest(
      new Request('http://localhost/api/admin/outbound-dispatch-settings', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          global_messages_per_minute: 30,
          api_notifications_paused: true,
        }),
      }),
      repository,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      global_messages_per_minute: 30,
      api_notifications_paused: true,
      effective_min_gap_ms: 2000,
      queued_ticket_replies: 1,
      queued_api_notifications: 3,
      updated_at: '2026-03-31T05:35:00.000Z',
    });
  });
});
