import { describe, expect, it } from 'vitest';

import { readWhatsappInstanceRuntime } from '../app/lib/whatsapp-ops-runtime';

describe('whatsapp ops runtime reader', () => {
  it('merges runtime state with live qr state', async () => {
    const values = new Map<string, string | null>([
      [
        'whatsapp:instance:default:runtime',
        JSON.stringify({
          status: 'qr_required',
          worker_id: 'worker-a',
          worker_host: 'bot-1',
          worker_version: '0.1.0',
          assigned_worker_id: 'worker-a',
          last_heartbeat_at: '2026-04-03T08:00:00.000Z',
          last_error: null,
          last_disconnect_at: null,
          reconnect_count_24h: 2,
          last_inbound_at: '2026-04-03T07:59:00.000Z',
          last_outbound_at: null,
        }),
      ],
      [
        'whatsapp:instance:default:qr',
        JSON.stringify({
          qr_code: 'raw-qr',
          qr_terminal: 'ASCII QR',
          generated_at: '2026-04-03T08:00:10.000Z',
        }),
      ],
    ]);

    const runtime = await readWhatsappInstanceRuntime('default', {
      get: async (key: string) => values.get(key) || null,
      ttl: async () => 45,
    });

    expect(runtime).toMatchObject({
      instance_id: 'default',
      status: 'qr_required',
      worker_id: 'worker-a',
      qr_code: 'raw-qr',
      qr_terminal: 'ASCII QR',
      reconnect_count_24h: 2,
    });
    expect(runtime?.qr_expires_at).not.toBeNull();
  });

  it('drops qr data when the qr key has expired', async () => {
    const values = new Map<string, string | null>([
      [
        'whatsapp:instance:default:runtime',
        JSON.stringify({
          status: 'ready',
          worker_id: 'worker-a',
          worker_host: 'bot-1',
          worker_version: '0.1.0',
          assigned_worker_id: 'worker-a',
          last_heartbeat_at: '2026-04-03T08:00:00.000Z',
          last_error: null,
          last_disconnect_at: null,
          reconnect_count_24h: 0,
          last_inbound_at: null,
          last_outbound_at: null,
        }),
      ],
    ]);

    const runtime = await readWhatsappInstanceRuntime('default', {
      get: async (key: string) => values.get(key) || null,
      ttl: async () => -2,
    });

    expect(runtime?.qr_code).toBeNull();
    expect(runtime?.qr_terminal).toBeNull();
    expect(runtime?.qr_expires_at).toBeNull();
  });
});
