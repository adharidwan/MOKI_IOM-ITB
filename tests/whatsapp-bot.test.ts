import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  outboundMessages: [] as FakeOutboundMessageRecord[],
  replies: [] as Array<{
    id: string;
    delivery_status: string;
    delivery_attempts: number;
    next_retry_at: string | null;
    last_delivery_error: string | null;
    whatsapp_message_id: string | null;
    delivered_at: string | null;
  }>,
  dispatchSettings: {
    id: 'default',
    global_messages_per_minute: 24,
    api_notifications_paused: false,
  },
  dispatchSettingsError: null as { message: string } | null,
  dispatchSettingsReadCount: 0,
}));

function applyUpdate(target: Record<string, unknown>, statement: string, params: unknown[]): void {
  const setClause = statement.match(/set\s+([\s\S]+?)\s+where/i)?.[1] || '';
  setClause
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part, index) => {
      const column = part.match(/^([a-z_]+)/i)?.[1];
      if (column) {
        target[column] = params[index + 1];
      }
    });
}

const require = createRequire(import.meta.url);
const {
  DelayedError,
} = require('bullmq');
const {
  getDispatchMinGapMs,
  loadDispatchSettingsWithFallback,
  processOutboundDispatchJob,
  setTestAdapters,
  summarizeDispatchSettingsLoadError,
} = require('../scripts/whatsapp-bot.js');

const downloadObjectBufferMock = vi.fn(async () => Buffer.from('image-bytes'));

async function fakeQuery(statement: string, params: unknown[] = []) {
  if (statement.includes('from public.bot_dispatch_settings')) {
    mockDb.dispatchSettingsReadCount += 1;
    if (mockDb.dispatchSettingsError) {
      throw new Error(mockDb.dispatchSettingsError.message);
    }
    return { rows: [mockDb.dispatchSettings] };
  }

  if (statement.includes('update public.outbound_messages')) {
    const record = mockDb.outboundMessages.find((item) => item.id === params[0]);
    if (!record) {
      throw new Error('Record not found.');
    }
    applyUpdate(record as unknown as Record<string, unknown>, statement, params);
    return { rows: [] };
  }

  if (statement.includes('update public.replies')) {
    const reply = mockDb.replies.find((item) => item.id === params[0]);
    if (!reply) {
      throw new Error('Reply not found.');
    }
    applyUpdate(reply as unknown as Record<string, unknown>, statement, params);
    return { rows: [] };
  }

  throw new Error(`Unexpected query: ${statement}`);
}

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

function createFakeDatabase(records: FakeOutboundMessageRecord[]) {
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
  mockDb.outboundMessages = records;
  mockDb.replies = replies;
  mockDb.dispatchSettings = {
    id: 'default',
    global_messages_per_minute: 24,
    api_notifications_paused: false,
  };
  mockDb.dispatchSettingsError = null;
  mockDb.dispatchSettingsReadCount = 0;
  downloadObjectBufferMock.mockClear();
  setTestAdapters({
    query: fakeQuery,
    downloadObjectBuffer: downloadObjectBufferMock,
  });

  return {
    dispatchSettings: mockDb.dispatchSettings,
    replies,
    setDispatchSettingsError(error: { message: string } | null) {
      mockDb.dispatchSettingsError = error;
    },
    getDispatchSettingsReadCount() {
      return mockDb.dispatchSettingsReadCount;
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

function createFakeRuntimeRedis() {
  const multi = {
    set: vi.fn(),
    exec: vi.fn().mockResolvedValue([]),
  };
  multi.set.mockReturnValue(multi);

  return {
    get: vi.fn().mockResolvedValue('0'),
    multi: vi.fn(() => multi),
  };
}

function createFakeInstanceContext(instanceId: string) {
  return {
    instanceId,
    runtimeRedis: createFakeRuntimeRedis(),
    lastStatus: 'ready',
    lastError: null,
    lastDisconnectAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastKnownPhoneNumber: null,
    lastKnownChatId: null,
    workerId: 'worker-a',
    workerHost: 'bot-1',
    workerVersion: '0.1.0',
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
    createFakeDatabase(records);
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
    const db = createFakeDatabase([]);
    db.dispatchSettings.api_notifications_paused = true;
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
        redis,
        { nextDispatchAtMs: 0, cachedDispatchSettings: null, cachedDispatchSettingsFreshUntilMs: 0 },
        2_000_000,
      ),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledWith(2_001_000, 'job-token');
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('re-delays jobs owned by a different whatsapp instance without mutating delivery state', async () => {
    const records: FakeOutboundMessageRecord[] = [
      {
        id: 'outbound-foreign',
        recipient_chat_id: '6281111111111@c.us',
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
      },
    ];
    const db = createFakeDatabase(records);

    const redis = createFakeRedis();
    const client = {
      getNumberId: vi.fn(),
      sendMessage: vi.fn(),
    };
    const job = createFakeJob({
      outbound_message_id: 'outbound-foreign',
      source_type: 'ticket_reply',
      source_id: 'reply-1',
      whatsapp_instance_id: 'backup',
      recipient_phone_number: '6281111111111',
      recipient_chat_id: '6281111111111@c.us',
      content: 'Support reply',
      attempt_number: 0,
      client_id: null,
    });

    await expect(
      processOutboundDispatchJob(
        job,
        'job-token',
        client,
        redis,
        { nextDispatchAtMs: 0, cachedDispatchSettings: null, cachedDispatchSettingsFreshUntilMs: 0 },
        2_500_000,
        createFakeInstanceContext('default'),
      ),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(job.updateData).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalledWith(2_501_000, 'job-token');
    expect(records[0].delivery_status).toBe('queued');
    expect(db.replies[0].delivery_status).toBe('queued');
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('also delays blast traffic when non-ticket dispatch is paused', async () => {
    const db = createFakeDatabase([]);
    db.dispatchSettings.api_notifications_paused = true;
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
    createFakeDatabase([]);
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
    const db = createFakeDatabase(records);
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
      whatsapp_instance_id: 'default',
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
      redis,
      dispatchState,
      2_000_000,
      createFakeInstanceContext('default'),
    );
    vi.restoreAllMocks();

    expect(client.sendMessage).toHaveBeenCalledWith('6289999999999@c.us', 'Support reply');
    expect(records[0].delivery_status).toBe('sent');
    expect(db.replies[0].delivery_status).toBe('sent');
    expect(dispatchState.nextDispatchAtMs).toBe(2_002_500);
  });

  it('sends ticket reply media with the text content as caption', async () => {
    const records: FakeOutboundMessageRecord[] = [
      {
        id: 'outbound-ticket-media',
        recipient_chat_id: '6289999999999@c.us',
        delivery_status: 'queued',
        delivery_attempts: 0,
        next_retry_at: null,
      },
    ];
    createFakeDatabase(records);
    const redis = createFakeRedis();
    const client = {
      getNumberId: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ id: { _serialized: 'wa-msg-1' } }),
    };
    const job = createFakeJob({
      outbound_message_id: 'outbound-ticket-media',
      source_type: 'ticket_reply',
      source_id: 'reply-1',
      whatsapp_instance_id: 'default',
      recipient_phone_number: '6289999999999',
      recipient_chat_id: '6289999999999@c.us',
      content: 'Support reply',
      media_bucket: 'ticket-assets',
      media_path: '2026-05-21/reply.png',
      media_mime_type: 'image/png',
      media_file_name: 'reply.png',
      attempt_number: 0,
      client_id: null,
    });

    await processOutboundDispatchJob(
      job,
      'job-token',
      client,
      redis,
      { nextDispatchAtMs: 0, cachedDispatchSettings: null, cachedDispatchSettingsFreshUntilMs: 0 },
      2_000_000,
      createFakeInstanceContext('default'),
    );

    const [, media, options] = client.sendMessage.mock.calls[0];
    expect(media.mimetype).toBe('image/png');
    expect(media.filename).toBe('reply.png');
    expect(options).toEqual({ caption: 'Support reply' });
    expect(downloadObjectBufferMock).toHaveBeenCalledWith('ticket-assets', '2026-05-21/reply.png');
    expect(records[0].delivery_status).toBe('sent');
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
    createFakeDatabase(records);
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
    const db = createFakeDatabase([]);
    const dispatchState = {
      nextDispatchAtMs: 0,
      cachedDispatchSettings: null,
      cachedDispatchSettingsFreshUntilMs: 0,
    };

    const first = await loadDispatchSettingsWithFallback(dispatchState, 5_000_000);
    const second = await loadDispatchSettingsWithFallback(dispatchState, 5_002_000);

    expect(first.global_messages_per_minute).toBe(24);
    expect(second.global_messages_per_minute).toBe(24);
    expect(db.getDispatchSettingsReadCount()).toBe(1);
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
