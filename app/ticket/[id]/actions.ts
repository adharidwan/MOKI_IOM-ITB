'use server';

import { revalidatePath } from 'next/cache';

import { requireFeatureAccess } from '../../lib/access-control';
import { addReply, getTicketById, updateTicketStatus } from '../../lib/api';
import { uploadTicketImage } from '../../lib/ticket-media';

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
  const image = formData.get('image');
  const hasImage = image instanceof File && image.size > 0;

  if (!content && !hasImage) {
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

    const media = hasImage ? await uploadTicketImage(image) : null;
    await addReply(ticketId, 'Admin', content, media);
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
