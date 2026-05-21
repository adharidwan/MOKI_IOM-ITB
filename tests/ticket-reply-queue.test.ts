import { beforeEach, describe, expect, it, vi } from 'vitest';

const createTicketReplyOutboundMessage = vi.fn();
const insertedReplies: Array<Record<string, unknown>> = [];
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
  insertedReplies.length = 0;

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
            insertedReplies.push(payload);
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
    expect(insertedReplies[0]).toMatchObject({
      content: 'Support message',
      media_bucket: null,
      media_path: null,
      media_mime_type: null,
      media_file_name: null,
      media_size_bytes: null,
    });
    expect(createTicketReplyOutboundMessage).toHaveBeenCalledWith({
      replyId: 'reply-1',
      ticketId: 'ticket-1',
      whatsappInstanceId: 'default',
      recipientPhoneNumber: '6281234567890',
      recipientChatId: '6281234567890@c.us',
      content: 'Support message',
    });
  });

  it('stores and queues ticket reply image metadata', async () => {
    const { addReply } = await import('../app/lib/api');
    const media = {
      bucket: 'ticket-assets',
      path: '2026-05-21/image.png',
      mimeType: 'image/png',
      fileName: 'image.png',
      sizeBytes: 128,
    };

    await addReply('ticket-1', 'Admin', '', media);

    expect(insertedReplies[0]).toMatchObject({
      content: '',
      media_bucket: 'ticket-assets',
      media_path: '2026-05-21/image.png',
      media_mime_type: 'image/png',
      media_file_name: 'image.png',
      media_size_bytes: 128,
    });
    expect(createTicketReplyOutboundMessage).toHaveBeenCalledWith({
      replyId: 'reply-1',
      ticketId: 'ticket-1',
      whatsappInstanceId: 'default',
      recipientPhoneNumber: '6281234567890',
      recipientChatId: '6281234567890@c.us',
      content: '',
      media,
    });
  });
});
