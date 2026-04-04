import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getSupabaseAdminClient = vi.fn();
const readWhatsappInstanceRuntime = vi.fn();
const getOrCreateDefaultWhatsappInstance = vi.fn();
const countQueuedOutboundMessagesBySource = vi.fn();

vi.mock('../app/lib/supabase-server', () => ({
  getSupabaseAdminClient,
}));

vi.mock('../app/lib/whatsapp-ops-runtime', () => ({
  readWhatsappInstanceRuntime,
}));

vi.mock('../app/lib/whatsapp-notification-repository', () => ({
  getOrCreateDefaultWhatsappInstance,
  countQueuedOutboundMessagesBySource,
}));

type OutboundMessageRow = {
  source_type: 'ticket_reply' | 'api_notification';
  delivery_status: 'queued' | 'retrying' | 'sent' | 'failed';
};

function createCountQuery(rows: OutboundMessageRow[]) {
  const filters: {
    sourceType?: string;
    deliveryStatuses?: string[];
  } = {};

  const builder = {
    eq(column: string, value: string) {
      if (column === 'source_type') {
        filters.sourceType = value;
      }
      return builder;
    },
    in(column: string, values: string[]) {
      if (column === 'delivery_status') {
        filters.deliveryStatuses = values;
      }
      return builder;
    },
    then(resolve: (value: { count: number; error: null }) => void) {
      const filteredRows = rows.filter((row) => {
        if (filters.sourceType && row.source_type !== filters.sourceType) {
          return false;
        }

        if (
          filters.deliveryStatuses &&
          !filters.deliveryStatuses.includes(row.delivery_status)
        ) {
          return false;
        }

        return true;
      });

      resolve({ count: filteredRows.length, error: null });
    },
  };

  return builder;
}

function createFakeSupabase(rows: OutboundMessageRow[]) {
  return {
    from(tableName: string) {
      if (tableName !== 'outbound_messages') {
        throw new Error(`Unexpected table access: ${tableName}`);
      }

      return {
        select(_columns: string, options?: { count?: string; head?: boolean }) {
          if (options?.count === 'exact' && options.head === true) {
            return createCountQuery(rows);
          }

          throw new Error('Unexpected select options for outbound_messages.');
        },
      };
    },
  };
}

describe('whatsapp ops repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives global queue counts from outbound_messages rows instead of redis counters', async () => {
    getSupabaseAdminClient.mockReturnValue(
      createFakeSupabase([
        { source_type: 'ticket_reply', delivery_status: 'queued' },
        { source_type: 'ticket_reply', delivery_status: 'retrying' },
        { source_type: 'ticket_reply', delivery_status: 'sent' },
        { source_type: 'api_notification', delivery_status: 'queued' },
        { source_type: 'api_notification', delivery_status: 'retrying' },
        { source_type: 'api_notification', delivery_status: 'failed' },
      ]),
    );
    countQueuedOutboundMessagesBySource.mockResolvedValue(0);

    const { createWhatsappOpsRepository } = await import('../app/lib/whatsapp-ops-repository');

    const repository = createWhatsappOpsRepository();

    await expect(repository.getGlobalQueueCounts()).resolves.toEqual({
      queued_ticket_replies: 2,
      queued_api_notifications: 2,
    });
    expect(countQueuedOutboundMessagesBySource).not.toHaveBeenCalled();
  });
});
