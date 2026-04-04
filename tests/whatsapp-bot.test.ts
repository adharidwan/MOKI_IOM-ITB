import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  DelayedError,
} = require('bullmq');
const {
  getDispatchMinGapMs,
  loadDispatchSettingsWithFallback,
  processOutboundDispatchJob,
  summarizeDispatchSettingsLoadError,
} = require('../scripts/whatsapp-bot.js');

interface FakeOutboundMessageRecord {
  id: string;
  recipient_chat_id: string | null;
  delivery_status: string;
  delivery_attempts: number;
  next_retry_at: string | null;
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
    replies,
    setDispatchSettingsError(error: { message: string } | null) {
      dispatchSettingsError = error;
    },
    getDispatchSettingsReadCount() {
      return dispatchSettingsReadCount;
    },
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

function createFakeJob(data: Record<string, unknown>) {
  return {
    data,
    token: 'job-token',
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
    updateData: vi.fn().mockResolvedValue(undefined),
  };
}

function createFakeRedis() {
  return {
    eval: vi.fn().mockResolvedValue(0),
  };
}

describe('processOutboundDispatchJob', () => {
  it('marks unresolved recipients as terminal failures and releases pending counts', async () => {
    const records: FakeOutboundMessageRecord[] = [
      {
        id: 'outbound-1',
        recipient_chat_id: null,
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
      },
    ];
    const supabase = createFakeSupabase(records);
    const redis = createFakeRedis();
    const client = {
      getNumberId: vi.fn().mockResolvedValue(null),
      sendMessage: vi.fn(),
    };
    const job = createFakeJob({
      outbound_message_id: 'outbound-1',
      source_type: 'api_notification',
      source_id: 'api:client-1:idem-1',
      recipient_phone_number: '6281234567890',
      recipient_chat_id: null,
      content: 'Transfer successful.',
      attempt_number: 0,
      client_id: 'client-1',
    });

    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await processOutboundDispatchJob(
      job,
      'job-token',
      client,
      supabase,
      redis,
      { nextDispatchAtMs: 0, cachedDispatchSettings: null, cachedDispatchSettingsFreshUntilMs: 0 },
      1_000_000,
    );
    vi.restoreAllMocks();

    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(records[0].delivery_status).toBe('failed');
    expect(records[0].delivery_attempts).toBe(1);
    expect(records[0].next_retry_at).toBeNull();
    expect(records[0].last_delivery_error).toContain('not a registered WhatsApp user');
    expect(redis.eval).toHaveBeenCalledTimes(2);
  });

  it('delays paused api notifications without sending them', async () => {
    const supabase = createFakeSupabase([]);
    supabase.dispatchSettings.api_notifications_paused = true;
    const redis = createFakeRedis();
    const client = {
      getNumberId: vi.fn(),
      sendMessage: vi.fn(),
    };
    const job = createFakeJob({
      outbound_message_id: 'outbound-api',
      source_type: 'api_notification',
      source_id: 'api:client-1:idem-1',
      recipient_phone_number: '6281234567890',
      recipient_chat_id: null,
      content: 'Transfer successful.',
      attempt_number: 0,
      client_id: 'client-1',
    });

    await expect(
      processOutboundDispatchJob(
        job,
        'job-token',
        client,
        supabase,
        redis,
        { nextDispatchAtMs: 0, cachedDispatchSettings: null, cachedDispatchSettingsFreshUntilMs: 0 },
        2_000_000,
      ),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledWith(2_001_000, 'job-token');
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('also delays blast traffic when non-ticket dispatch is paused', async () => {
    const supabase = createFakeSupabase([]);
    supabase.dispatchSettings.api_notifications_paused = true;
    const redis = createFakeRedis();
    const client = {
      getNumberId: vi.fn(),
      sendMessage: vi.fn(),
    };
    const job = createFakeJob({
      outbound_message_id: 'outbound-blast',
      source_type: 'blast',
      source_id: 'blast:req-1:6281234567890',
      recipient_phone_number: '6281234567890',
      recipient_chat_id: null,
      content: 'Promo blast',
      attempt_number: 0,
      client_id: null,
    });

    await expect(
      processOutboundDispatchJob(
        job,
        'job-token',
        client,
        supabase,
        redis,
        { nextDispatchAtMs: 0, cachedDispatchSettings: null, cachedDispatchSettingsFreshUntilMs: 0 },
        2_500_000,
      ),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledWith(2_501_000, 'job-token');
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('delays work until the configured global dispatch gap has elapsed', async () => {
    const supabase = createFakeSupabase([]);
    const redis = createFakeRedis();
    const client = {
      getNumberId: vi.fn(),
      sendMessage: vi.fn(),
    };
    const dispatchState = {
      nextDispatchAtMs: 3_002_000,
      cachedDispatchSettings: {
        id: 'default',
        global_messages_per_minute: 30,
        api_notifications_paused: false,
      },
      cachedDispatchSettingsFreshUntilMs: 3_010_000,
    };
    const job = createFakeJob({
      outbound_message_id: 'outbound-1',
      source_type: 'api_notification',
      source_id: 'api:client-1:idem-1',
      recipient_phone_number: '6281111111111',
      recipient_chat_id: '6281111111111@c.us',
      content: 'First notification',
      attempt_number: 0,
      client_id: 'client-1',
    });

    await expect(
      processOutboundDispatchJob(
        job,
        'job-token',
        client,
        supabase,
        redis,
        dispatchState,
        3_001_000,
      ),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledWith(3_002_000, 'job-token');
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('sends a ticket reply and mirrors delivery state back to the reply row', async () => {
    const records: FakeOutboundMessageRecord[] = [
      {
        id: 'outbound-ticket',
        recipient_chat_id: '6289999999999@c.us',
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
      },
    ];
    const supabase = createFakeSupabase(records);
    const redis = createFakeRedis();
    const client = {
      getNumberId: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ id: { _serialized: 'wa-msg-1' } }),
    };
    const dispatchState = {
      nextDispatchAtMs: 0,
      cachedDispatchSettings: null,
      cachedDispatchSettingsFreshUntilMs: 0,
    };
    const job = createFakeJob({
      outbound_message_id: 'outbound-ticket',
      source_type: 'ticket_reply',
      source_id: 'reply-1',
      recipient_phone_number: '6289999999999',
      recipient_chat_id: '6289999999999@c.us',
      content: 'Support reply',
      attempt_number: 0,
      client_id: null,
    });

    vi.spyOn(Date, 'now').mockReturnValue(2_000_000);
    await processOutboundDispatchJob(
      job,
      'job-token',
      client,
      supabase,
      redis,
      dispatchState,
      2_000_000,
    );
    vi.restoreAllMocks();

    expect(client.sendMessage).toHaveBeenCalledWith('6289999999999@c.us', 'Support reply');
    expect(records[0].delivery_status).toBe('sent');
    expect(supabase.replies[0].delivery_status).toBe('sent');
    expect(dispatchState.nextDispatchAtMs).toBe(2_002_500);
  });

  it('retries transient send failures by delaying the same job with updated attempt data', async () => {
    const records: FakeOutboundMessageRecord[] = [
      {
        id: 'outbound-1',
        recipient_chat_id: null,
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
      },
    ];
    const supabase = createFakeSupabase(records);
    const redis = createFakeRedis();
    const client = {
      getNumberId: vi.fn().mockResolvedValue({ _serialized: '6281111111111@c.us' }),
      sendMessage: vi.fn().mockRejectedValue(new Error('Temporary outage')),
    };
    const job = createFakeJob({
      outbound_message_id: 'outbound-1',
      source_type: 'api_notification',
      source_id: 'api:client-1:idem-1',
      recipient_phone_number: '6281111111111',
      recipient_chat_id: null,
      content: 'First notification',
      attempt_number: 0,
      client_id: 'client-1',
    });

    vi.spyOn(Date, 'now').mockReturnValue(3_000_000);
    await expect(
      processOutboundDispatchJob(
        job,
        'job-token',
        client,
        supabase,
        redis,
        { nextDispatchAtMs: 0, cachedDispatchSettings: null, cachedDispatchSettingsFreshUntilMs: 0 },
        3_000_000,
      ),
    ).rejects.toBeInstanceOf(DelayedError);
    vi.restoreAllMocks();

    expect(records[0].delivery_status).toBe('retrying');
    expect(records[0].delivery_attempts).toBe(1);
    expect(job.updateData).toHaveBeenCalledWith({
      ...job.data,
      recipient_chat_id: '6281111111111@c.us',
      attempt_number: 1,
    });
    expect(job.moveToDelayed).toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
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

  it('computes the current min gap from the runtime dispatch setting', () => {
    expect(getDispatchMinGapMs(30)).toBe(2000);
  });
});
