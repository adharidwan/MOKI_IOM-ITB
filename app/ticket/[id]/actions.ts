'use server';

import { revalidatePath } from 'next/cache';

import { requireFeatureAccess } from '../../lib/access-control';
import { addReply, getTicketById, updateTicketStatus } from '../../lib/api';

export interface ReplyActionState {
  error: string | null;
  success: boolean;
}

export interface CloseTicketActionState {
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
    await requireFeatureAccess('ticket');
    const ticket = await getTicketById(ticketId);

    if (ticket.status === 'Closed') {
      return {
        error: 'Cannot reply to a closed ticket.',
        success: false,
      };
    }

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

export async function closeTicket(
  ticketId: string,
  _prevState: CloseTicketActionState,
  _formData: FormData,
): Promise<CloseTicketActionState> {
  void _prevState;
  void _formData;

  try {
    await requireFeatureAccess('ticket');
    const ticket = await getTicketById(ticketId);

    if (ticket.status === 'Closed') {
      return {
        error: 'Ticket is already closed.',
        success: false,
      };
    }

    await updateTicketStatus(ticketId, 'Closed');
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to close ticket.',
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
