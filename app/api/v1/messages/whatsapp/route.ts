import { createSupabaseNotificationRepository } from '../../../../lib/whatsapp-notification-repository';
import { handleWhatsappNotificationRequest } from '../../../../lib/whatsapp-notification-service';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const repository = createSupabaseNotificationRepository();
  return handleWhatsappNotificationRequest(request, repository);
}
