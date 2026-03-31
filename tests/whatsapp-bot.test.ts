import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  getDispatchMinGapMs,
  loadDispatchSettingsWithFallback,
  processOutboundDispatchTick,
  summarizeDispatchSettingsLoadError,
} = require('../scripts/whatsapp-bot.js');

interface FakeOutboundMessageRecord {
  id: string;
  source_type: 'api_notification' | 'ticket_reply';
  source_id: string;
  ticket_id: string | null;
  priority: number;
  recipient_phone_number: string;
  recipient_chat_id: string | null;
  content: string;
  delivery_status: string;
  delivery_attempts: number;
  next_retry_at: string | null;
  created_at: string;
  updated_at?: string | null;
  last_delivery_error?: string | null;
  whatsapp_message_id?: string | null;
  delivered_at?: string | null;
}

function createFakeSupabase(records: FakeOutboundMessageRecord[]) {
  const replies = [
    {
      id: 'reply-1',
      delivery_status: 'queued',
      delivery_attempts: 0,
      next_retry_at: null,
      last_delivery_error: null,
      whatsapp_message_id: null,
      delivered_at: null,
    },
  ];
  const dispatchSettings = {
    id: 'default',
    global_messages_per_minute: 24,
    api_notifications_paused: false,
  };
  let dispatchSettingsError: { message: string } | null = null;
  let dispatchSettingsReadCount = 0;

  return {
    dispatchSettings,
    setDispatchSettingsError(error: { message: string } | null) {
      dispatchSettingsError = error;
    },
    getDispatchSettingsReadCount() {
      return dispatchSettingsReadCount;
    },
    replies,
    from(tableName: string) {
      if (tableName === 'bot_dispatch_settings') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => {
                    dispatchSettingsReadCount += 1;
                    return { data: dispatchSettingsError ? null : dispatchSettings, error: dispatchSettingsError };
                  },
                };
              },
            };
          },
        };
      }

      if (tableName === 'outbound_messages') {
        return {
          select() {
            const state = {
              eqFilters: [] as Array<{ column: string; value: string }>,
              inFilters: [] as Array<{ column: string; values: string[] }>,
              orderings: [] as Array<{ column: string; ascending: boolean }>,
              limitCount: 20,
            };

            const builder = {
              eq(column: string, value: string) {
                state.eqFilters.push({ column, value });
                return builder;
              },
              in(column: string, values: string[]) {
                state.inFilters.push({ column, values });
                return builder;
              },
              order(column: string, options: { ascending: boolean }) {
                state.orderings.push({ column, ascending: options.ascending });
                return builder;
              },
              limit(count: number) {
                state.limitCount = count;
                return builder;
              },
              then(resolve: (value: { data: FakeOutboundMessageRecord[]; error: null }) => void) {
                let result = [...records];

                for (const filter of state.eqFilters) {
                  result = result.filter(
                    (record) =>
                      String(record[filter.column as keyof FakeOutboundMessageRecord]) ===
                      filter.value,
                  );
                }

                for (const filter of state.inFilters) {
                  result = result.filter((record) =>
                    filter.values.includes(
                      String(record[filter.column as keyof FakeOutboundMessageRecord]),
                    ),
                  );
                }

                for (const ordering of state.orderings.slice().reverse()) {
                  result.sort((left, right) => {
                    const leftValue = left[ordering.column as keyof FakeOutboundMessageRecord];
                    const rightValue = right[ordering.column as keyof FakeOutboundMessageRecord];

                    if (leftValue === rightValue) {
                      return 0;
                    }

                    const comparison = leftValue < rightValue ? -1 : 1;
                    return ordering.ascending ? comparison : -comparison;
                  });
                }

                resolve({
                  data: result.slice(0, state.limitCount),
                  error: null,
                });
                return builder;
              },
            };

            return builder;
          },
          update(payload: Partial<FakeOutboundMessageRecord>) {
            return {
              eq: async (_column: string, id: string) => {
                const record = records.find((item) => item.id === id);

                if (!record) {
                  return { error: { message: 'Record not found.' } };
                }

                Object.assign(record, payload);
                return { error: null };
              },
            };
          },
        };
      }

      if (tableName === 'replies') {
        return {
          update(payload: Partial<(typeof replies)[number]>) {
            return {
              eq: async (_column: string, id: string) => {
                const reply = replies.find((item) => item.id === id);

                if (!reply) {
                  return { error: { message: 'Reply not found.' } };
                }

                Object.assign(reply, payload);
                return { error: null };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table access: ${tableName}`);
    },
  };
}

describe('processOutboundDispatchTick', () => {
  it('marks unresolved recipients as terminal failures', async () => {
    const records: FakeOutboundMessageRecord[] = [
      {
        id: 'outbound-1',
        source_type: 'api_notification',
        source_id: 'api:client-1:idem-1',
        ticket_id: null,
        priority: 100,
        recipient_phone_number: '6281234567890',
        recipient_chat_id: null,
        content: 'Transfer successful.',
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
        created_at: '2026-03-31T05:30:00.000Z',
      },
    ];
    const supabase = createFakeSupabase(records);
    const client = {
      getNumberId: vi.fn().mockResolvedValue(null),
      sendMessage: vi.fn(),
    };

    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await processOutboundDispatchTick(client, supabase, { nextDispatchAtMs: 0 }, 1_000_000);
    vi.restoreAllMocks();

    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(records[0].delivery_status).toBe('failed');
    expect(records[0].delivery_attempts).toBe(1);
    expect(records[0].next_retry_at).toBeNull();
    expect(records[0].last_delivery_error).toContain('not a registered WhatsApp user');
  });

  it('prioritizes ticket replies and skips paused api notifications', async () => {
    const records: FakeOutboundMessageRecord[] = [
      {
        id: 'outbound-api',
        source_type: 'api_notification',
        source_id: 'api:client-1:idem-1',
        ticket_id: null,
        priority: 100,
        recipient_phone_number: '6281234567890',
        recipient_chat_id: null,
        content: 'Transfer successful.',
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
        created_at: '2026-03-31T05:30:00.000Z',
      },
      {
        id: 'outbound-ticket',
        source_type: 'ticket_reply',
        source_id: 'reply-1',
        ticket_id: 'ticket-1',
        priority: 10,
        recipient_phone_number: '6289999999999',
        recipient_chat_id: '6289999999999@c.us',
        content: 'Support reply',
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
        created_at: '2026-03-31T05:31:00.000Z',
      },
    ];
    const supabase = createFakeSupabase(records);
    supabase.dispatchSettings.api_notifications_paused = true;
    const client = {
      getNumberId: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ id: { _serialized: 'wa-msg-1' } }),
    };

    vi.spyOn(Date, 'now').mockReturnValue(2_000_000);
    await processOutboundDispatchTick(client, supabase, { nextDispatchAtMs: 0 }, 2_000_000);
    vi.restoreAllMocks();

    expect(client.sendMessage).toHaveBeenCalledWith('6289999999999@c.us', 'Support reply');
    expect(records[0].delivery_status).toBe('queued');
    expect(records[1].delivery_status).toBe('sent');
    expect(supabase.replies[0].delivery_status).toBe('sent');
  });

  it('enforces the configured global dispatch spacing', async () => {
    const records: FakeOutboundMessageRecord[] = [
      {
        id: 'outbound-1',
        source_type: 'api_notification',
        source_id: 'api:client-1:idem-1',
        ticket_id: null,
        priority: 100,
        recipient_phone_number: '6281111111111',
        recipient_chat_id: '6281111111111@c.us',
        content: 'First notification',
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
        created_at: '2026-03-31T05:30:00.000Z',
      },
      {
        id: 'outbound-2',
        source_type: 'api_notification',
        source_id: 'api:client-1:idem-2',
        ticket_id: null,
        priority: 100,
        recipient_phone_number: '6282222222222',
        recipient_chat_id: '6282222222222@c.us',
        content: 'Second notification',
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
        created_at: '2026-03-31T05:31:00.000Z',
      },
    ];
    const supabase = createFakeSupabase(records);
    supabase.dispatchSettings.global_messages_per_minute = 30;
    const dispatchState = { nextDispatchAtMs: 0 };
    const client = {
      getNumberId: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ id: { _serialized: 'wa-msg' } }),
    };

    vi.spyOn(Date, 'now').mockReturnValue(3_000_000);
    await processOutboundDispatchTick(client, supabase, dispatchState, 3_000_000);
    expect(dispatchState.nextDispatchAtMs).toBe(3_002_000);

    vi.spyOn(Date, 'now').mockReturnValue(3_001_000);
    await processOutboundDispatchTick(client, supabase, dispatchState, 3_001_000);

    vi.spyOn(Date, 'now').mockReturnValue(3_002_000);
    await processOutboundDispatchTick(client, supabase, dispatchState, 3_002_000);
    vi.restoreAllMocks();

    expect(getDispatchMinGapMs(30)).toBe(2000);
    expect(client.sendMessage).toHaveBeenCalledTimes(2);
    expect(records[0].delivery_status).toBe('sent');
    expect(records[1].delivery_status).toBe('sent');
  });

  it('falls back to cached dispatch settings when the settings query fails', async () => {
    const records: FakeOutboundMessageRecord[] = [
      {
        id: 'outbound-1',
        source_type: 'api_notification',
        source_id: 'api:client-1:idem-1',
        ticket_id: null,
        priority: 100,
        recipient_phone_number: '6281111111111',
        recipient_chat_id: '6281111111111@c.us',
        content: 'First notification',
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
        created_at: '2026-03-31T05:30:00.000Z',
      },
    ];
    const supabase = createFakeSupabase(records);
    const dispatchState = {
      nextDispatchAtMs: 0,
      cachedDispatchSettings: {
        id: 'default',
        global_messages_per_minute: 30,
        api_notifications_paused: false,
      },
      cachedDispatchSettingsFreshUntilMs: 0,
    };
    const client = {
      getNumberId: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ id: { _serialized: 'wa-msg-1' } }),
    };

    supabase.setDispatchSettingsError({ message: '<!DOCTYPE html><title>502: Bad gateway</title>' });

    vi.spyOn(Date, 'now').mockReturnValue(4_000_000);
    await processOutboundDispatchTick(client, supabase, dispatchState, 4_000_000);
    vi.restoreAllMocks();

    expect(client.sendMessage).toHaveBeenCalledWith('6281111111111@c.us', 'First notification');
    expect(dispatchState.nextDispatchAtMs).toBe(4_002_000);
    expect(records[0].delivery_status).toBe('sent');
  });
});

describe('dispatch settings caching helpers', () => {
  it('reuses cached settings within the ttl window', async () => {
    const supabase = createFakeSupabase([]);
    const dispatchState = {
      nextDispatchAtMs: 0,
      cachedDispatchSettings: null,
      cachedDispatchSettingsFreshUntilMs: 0,
    };

    const first = await loadDispatchSettingsWithFallback(supabase, dispatchState, 5_000_000);
    const second = await loadDispatchSettingsWithFallback(supabase, dispatchState, 5_002_000);

    expect(first.global_messages_per_minute).toBe(24);
    expect(second.global_messages_per_minute).toBe(24);
    expect(supabase.getDispatchSettingsReadCount()).toBe(1);
  });

  it('summarizes html upstream failures without dumping the full page', () => {
    expect(
      summarizeDispatchSettingsLoadError(
        new Error('<!DOCTYPE html><html><body><span>Error code 502</span></body></html>'),
      ),
    ).toContain('HTML error page (502)');
  });
});
