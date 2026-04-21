import { beforeEach, describe, expect, it, vi } from 'vitest';

let fakeSupabase: any;
const insertedOutboundMessages: Array<Record<string, unknown>> = [];
const storedOutboundMessages = new Map<string, Record<string, unknown>>();

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

vi.mock('../app/lib/whatsapp-notification-utils', () => ({
  API_NOTIFICATION_PRIORITY: 100,
  BLAST_PRIORITY: 50,
  DEFAULT_WHATSAPP_INSTANCE_ID: 'default',
  DEFAULT_WHATSAPP_INSTANCE_LABEL: 'Primary WhatsApp',
  DEFAULT_DISPATCH_SETTINGS_ID: 'default',
  DEFAULT_GLOBAL_MESSAGES_PER_MINUTE: 24,
  TICKET_REPLY_PRIORITY: 10,
  buildApiNotificationSourceId: (clientId: string, idempotencyKey: string) =>
    `api:${clientId}:${idempotencyKey}`,
}));

beforeEach(() => {
  insertedOutboundMessages.length = 0;
  storedOutboundMessages.clear();

  fakeSupabase = {
    from(tableName: string) {
      if (tableName === 'csv_contacts') {
        return {
          select() {
            return {
              overlaps() {
                return {
                  order() {
                    return Promise.resolve({
                      data: [],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      if (tableName === 'outbound_messages') {
        return {
          insert(payload: Record<string, unknown>) {
            const existing = storedOutboundMessages.get(String(payload.source_id || ''));

            if (existing) {
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: null,
                        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                      };
                    },
                  };
                },
              };
            }

            insertedOutboundMessages.push(payload);
            storedOutboundMessages.set(String(payload.source_id || ''), payload);

            return {
              select() {
                return {
                  async single() {
                    return {
                      data: payload,
                      error: null,
                    };
                  },
                };
              },
            };
          },
          select() {
            return {
              eq(_column: string, _value: string) {
                return {
                  eq(_innerColumn: string, sourceId: string) {
                    return {
                      async maybeSingle() {
                        return {
                          data: storedOutboundMessages.get(sourceId) || null,
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              async eq(_column: string, id: string) {
                const entry = Array.from(storedOutboundMessages.values()).find((message) => message.id === id);

                if (entry) {
                  Object.assign(entry, payload);
                }

                return { error: null };
              },
            };
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
              overlaps(_column: string, groupNames: string[]) {
                return {
                  order() {
                    const normalizedGroups = groupNames.map((groupName) => groupName.toLowerCase());
                    return Promise.resolve({
                      data: normalizedGroups.includes('vip')
                        ? [
                            { no_telp: '628111111111' },
                            { no_telp: '628222222222' },
                          ]
                        : [],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      if (tableName === 'outbound_messages') {
        return {
          insert(payload: Record<string, unknown>) {
            insertedOutboundMessages.push(payload);
            storedOutboundMessages.set(String(payload.source_id || ''), payload);

            return {
              select() {
                return {
                  async single() {
                    return {
                      data: payload,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table access: ${tableName}`);
    };

    const { createGroupBlastOutboundMessages } = await import('../app/lib/whatsapp-notification-repository');

    const result = await createGroupBlastOutboundMessages({
      groupNames: ['vip'],
      content: 'Promo khusus VIP',
    });

    expect(result).toEqual({
      totalRecipients: 2,
      acceptedCount: 2,
      queuedCount: 2,
      alreadyAcceptedCount: 0,
      failedCount: 0,
      trackedMessageIds: expect.any(Array),
    });
    expect(insertedOutboundMessages).toHaveLength(2);
    expect(insertedOutboundMessages.map((message) => message.recipient_phone_number)).toEqual([
      '628111111111',
      '628222222222',
    ]);
    expect(insertedOutboundMessages.every((message) => message.source_type === 'blast')).toBe(true);
  });

  it('deduplicates retries for the same blast payload', async () => {
    fakeSupabase.from = (tableName: string) => {
      if (tableName === 'csv_contacts') {
        return {
          select() {
            return {
              overlaps() {
                return {
                  order() {
                    return Promise.resolve({
                      data: [{ no_telp: '628111111111' }],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      if (tableName === 'outbound_messages') {
        return {
          insert(payload: Record<string, unknown>) {
            const existing = storedOutboundMessages.get(String(payload.source_id || ''));

            if (existing) {
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: null,
                        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                      };
                    },
                  };
                },
              };
            }

            insertedOutboundMessages.push(payload);
            storedOutboundMessages.set(String(payload.source_id || ''), payload);

            return {
              select() {
                return {
                  async single() {
                    return {
                      data: payload,
                      error: null,
                    };
                  },
                };
              },
            };
          },
          select() {
            return {
              eq(_column: string, _value: string) {
                return {
                  eq(_innerColumn: string, sourceId: string) {
                    return {
                      async maybeSingle() {
                        return {
                          data: storedOutboundMessages.get(sourceId) || null,
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update() {
            return {
              async eq() {
                return { error: null };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table access: ${tableName}`);
    };

    const { createGroupBlastOutboundMessages } = await import('../app/lib/whatsapp-notification-repository');

    const first = await createGroupBlastOutboundMessages({
      groupNames: ['vip'],
      content: 'Promo khusus VIP',
    });
    const second = await createGroupBlastOutboundMessages({
      groupNames: ['vip'],
      content: 'Promo khusus VIP',
    });

    expect(first.acceptedCount).toBe(1);
    expect(second).toEqual({
      totalRecipients: 1,
      acceptedCount: 1,
      queuedCount: 0,
      alreadyAcceptedCount: 1,
      failedCount: 0,
      trackedMessageIds: expect.any(Array),
    });
    expect(insertedOutboundMessages).toHaveLength(1);
  });
});
