import { describe, expect, it } from 'vitest';

import {
  FAILED_BATCH_TTL_MS,
  SENT_BATCH_TTL_MS,
  collectTrackedIds,
  deriveBatchSummaries,
  normalizeTrackedBatches,
  reconcileTrackedBatches,
  registerTrackedBatch,
} from '../app/lib/outbound-tracker-session';

describe('outbound tracker session helpers', () => {
  it('normalizes and registers tracked batches with display ids', () => {
    const first = registerTrackedBatch([], {
      id: 'request-1111',
      label: 'Blast manual',
      source_type: 'blast',
      created_at: '2026-04-21T10:00:00.000Z',
      tracked_ids: ['one', 'two', 'two'],
      total_count: 3,
      resolved_at: null,
    });

    const next = registerTrackedBatch(first, {
      id: 'request-2222',
      label: 'Blast grup',
      source_type: 'blast',
      created_at: '2026-04-21T10:00:00.000Z',
      tracked_ids: ['three'],
      total_count: 1,
      resolved_at: null,
    });

    expect(next).toHaveLength(2);
    expect(next[0]?.id).toMatch(/^Blast - .* #2222$/);
    expect(next[0]?.label).toBe(next[0]?.id);
    expect(next[1]?.id).toMatch(/^Blast - /);
    expect(collectTrackedIds(next)).toEqual(['three', 'one', 'two']);
  });

  it('derives batch summaries from outbound items', () => {
    const batches = normalizeTrackedBatches([
      {
        id: 'batch-1',
        label: 'Blast manual',
        source_type: 'blast',
        created_at: '2026-04-21T10:00:00.000Z',
        tracked_ids: ['one', 'two'],
        total_count: 2,
        resolved_at: null,
      },
    ]);

    const summaries = deriveBatchSummaries(batches, [
      {
        id: 'one',
        whatsapp_instance_id: 'default',
        instance_label: 'Primary',
        ticket_id: null,
        source_type: 'blast',
        delivery_status: 'queued',
        recipient_phone_number: '6281',
        client_reference: null,
        created_at: '2026-04-21T10:00:00.000Z',
        delivered_at: null,
        last_delivery_error: null,
      },
      {
        id: 'two',
        whatsapp_instance_id: 'default',
        instance_label: 'Primary',
        ticket_id: null,
        source_type: 'blast',
        delivery_status: 'sent',
        recipient_phone_number: '6282',
        client_reference: null,
        created_at: '2026-04-21T10:00:00.000Z',
        delivered_at: '2026-04-21T10:01:00.000Z',
        last_delivery_error: null,
      },
    ]);

    expect(summaries[0]).toMatchObject({
      queued: 1,
      retrying: 0,
      failed: 0,
      sent: 1,
      active: 1,
    });
  });

  it('keeps unfinished batches, but prunes old resolved ones', () => {
    const nowMs = Date.parse('2026-04-21T11:00:00.000Z');
    const batches = normalizeTrackedBatches([
      {
        id: 'sent-batch',
        label: 'Blast sent',
        source_type: 'blast',
        created_at: '2026-04-21T10:00:00.000Z',
        tracked_ids: ['sent-1'],
        total_count: 1,
        resolved_at: new Date(nowMs - SENT_BATCH_TTL_MS - 1000).toISOString(),
      },
      {
        id: 'failed-batch',
        label: 'Blast failed',
        source_type: 'blast',
        created_at: '2026-04-21T10:00:00.000Z',
        tracked_ids: ['failed-1'],
        total_count: 1,
        resolved_at: new Date(nowMs - FAILED_BATCH_TTL_MS - 1000).toISOString(),
      },
      {
        id: 'active-batch',
        label: 'Blast active',
        source_type: 'blast',
        created_at: '2026-04-21T10:30:00.000Z',
        tracked_ids: ['active-1'],
        total_count: 1,
        resolved_at: null,
      },
    ]);

    const next = reconcileTrackedBatches(
      batches,
      [
        {
          id: 'sent-1',
          whatsapp_instance_id: 'default',
          instance_label: 'Primary',
          ticket_id: null,
          source_type: 'blast',
          delivery_status: 'sent',
          recipient_phone_number: '6281',
          client_reference: null,
          created_at: '2026-04-21T10:00:00.000Z',
          delivered_at: '2026-04-21T10:01:00.000Z',
          last_delivery_error: null,
        },
        {
          id: 'failed-1',
          whatsapp_instance_id: 'default',
          instance_label: 'Primary',
          ticket_id: null,
          source_type: 'blast',
          delivery_status: 'failed',
          recipient_phone_number: '6282',
          client_reference: null,
          created_at: '2026-04-21T10:00:00.000Z',
          delivered_at: null,
          last_delivery_error: 'Failed',
        },
        {
          id: 'active-1',
          whatsapp_instance_id: 'default',
          instance_label: 'Primary',
          ticket_id: null,
          source_type: 'blast',
          delivery_status: 'queued',
          recipient_phone_number: '6283',
          client_reference: null,
          created_at: '2026-04-21T10:30:00.000Z',
          delivered_at: null,
          last_delivery_error: null,
        },
      ],
      nowMs,
    );

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('active-batch');
  });
});
