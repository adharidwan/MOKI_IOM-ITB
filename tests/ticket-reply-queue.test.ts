import { beforeEach, describe, expect, it, vi } from 'vitest';

const createTicketReplyOutboundMessage = vi.fn();
let fakeSupabase: {
  from: (tableName: string) => {
    select?: () => {
      eq: (_column: string, _value: string) => {
        single: () => Promise<{ data: unknown; error: null }>;
      };
    };
    insert?: (payload: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{ data: Record<string, unknown>; error: null }>;
      };
    };
    update?: (_payload: Record<string, unknown>) => {
      eq: (_column: string, _value: string) => Promise<{ error: null }>;
    };
  };
};

vi.mock('../app/lib/whatsapp-notification-repository', () => ({
  createTicketReplyOutboundMessage,
}));

vi.mock('server-only', () => ({}));

vi.mock('../app/lib/supabase-server', () => ({
  getSupabaseServerClient: vi.fn(),
  getSupabaseAdminClient: vi.fn(() => fakeSupabase),
}));

beforeEach(() => {
  createTicketReplyOutboundMessage.mockReset();
  createTicketReplyOutboundMessage.mockResolvedValue({ id: 'outbound-1' });

  fakeSupabase = {
    from(tableName: string) {
      if (tableName === 'tickets') {
        return {
          select() {
            return {
              eq() {
                return {
                  async single() {
                    return {
                      data: {
                        id: 'ticket-1',
                        channel: 'whatsapp',
                        whatsapp_chat_id: '6281234567890@c.us',
                        phone_number: '6281234567890',
                      },
                      error: null,
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

      if (tableName === 'replies') {
        return {
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: 'reply-1',
                        ...payload,
                      },
                      error: null,
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
    },
  };
});

describe('addReply', () => {
  it('creates the reply history row and enqueues a unified outbound message', async () => {
    const { addReply } = await import('../app/lib/api');

    const reply = await addReply('ticket-1', 'Admin', 'Support message');

    expect(reply.id).toBe('reply-1');
    expect(createTicketReplyOutboundMessage).toHaveBeenCalledWith({
      replyId: 'reply-1',
      ticketId: 'ticket-1',
      whatsappInstanceId: 'default',
      recipientPhoneNumber: '6281234567890',
      recipientChatId: '6281234567890@c.us',
      content: 'Support message',
    });
  });
});
