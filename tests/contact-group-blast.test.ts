import { beforeEach, describe, expect, it, vi } from 'vitest';

let fakeSupabase: any;
const insertedOutboundMessages: Array<Record<string, unknown>> = [];

vi.mock('server-only', () => ({}));

vi.mock('../app/lib/outbound-dispatch-queue', () => ({
  enqueueOutboundDispatchJob: vi.fn(async () => undefined),
  getOutboundDispatchQueue: vi.fn(),
}));

vi.mock('../app/lib/outbound-dispatch-redis', () => ({
  incrementPendingOutboundCounts: vi.fn(async () => undefined),
}));

vi.mock('../app/lib/supabase-server', () => ({
  getSupabaseAdminClient: vi.fn(() => fakeSupabase),
}));

beforeEach(() => {
  insertedOutboundMessages.length = 0;

  fakeSupabase = {
    from(tableName: string) {
      if (tableName === 'csv_contacts') {
        return {
          select() {
            return {
              order() {
                return {
                  async single() {
                    return { data: null, error: null };
                  },
                  async then() {
                    return undefined;
                  },
                };
              },
              async then() {
                return undefined;
              },
            };
          },
          order() {
            return {
              async then() {
                return undefined;
              },
            };
          },
        };
      }

      if (tableName === 'outbound_messages') {
        return {
          insert(payload: Record<string, unknown>) {
            insertedOutboundMessages.push(payload);
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table access: ${tableName}`);
    },
  };
});

describe('contact group blast', () => {
  it('queues blast messages for contacts in any selected group', async () => {
    fakeSupabase.from = (tableName: string) => {
      if (tableName === 'csv_contacts') {
        return {
          select() {
            return {
              order() {
                return Promise.resolve({
                  data: [
                    { no_telp: '628111111111', group_names: ['VIP', 'Sales'] },
                    { no_telp: '628222222222', group_name: 'VIP' },
                    { no_telp: '628333333333', group_names: ['Ops'] },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      }

      if (tableName === 'outbound_messages') {
        return {
          insert(payload: Record<string, unknown>) {
            insertedOutboundMessages.push(payload);
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table access: ${tableName}`);
    };

    const { createGroupBlastOutboundMessages } = await import('../app/lib/whatsapp-notification-repository');

    const queuedCount = await createGroupBlastOutboundMessages({
      groupNames: ['vip'],
      content: 'Promo khusus VIP',
    });

    expect(queuedCount).toBe(2);
    expect(insertedOutboundMessages).toHaveLength(2);
    expect(insertedOutboundMessages.map((message) => message.recipient_phone_number)).toEqual([
      '628111111111',
      '628222222222',
    ]);
    expect(insertedOutboundMessages.every((message) => message.source_type === 'blast')).toBe(true);
  });
});