'use server';

import { revalidatePath } from 'next/cache';

import { addReply } from '../../lib/api';

export interface ReplyActionState {
  error: string | null;
  success: boolean;
}

export async function submitTicketReply(
  ticketId: string,
  _prevState: ReplyActionState,
  formData: FormData,
): Promise<ReplyActionState> {
  const content = String(formData.get('content') || '').trim();

  if (!content) {
    return {
      error: 'Reply cannot be empty.',
      success: false,
    };
  }

  try {
    await addReply(ticketId, 'Admin', content);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to send reply.',
      success: false,
    };
  }

  revalidatePath('/ticket');
  revalidatePath(`/ticket/${ticketId}`);

  return {
    error: null,
    success: true,
  };
}
