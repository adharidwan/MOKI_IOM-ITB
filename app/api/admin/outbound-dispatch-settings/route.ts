import {
  countQueuedOutboundMessagesBySource,
  createSupabaseNotificationRepository,
  getDispatchSettings,
  updateDispatchSettings,
} from '../../../lib/whatsapp-notification-repository';
import {
  handleGetOutboundDispatchSettingsRequest,
  handlePatchOutboundDispatchSettingsRequest,
} from '../../../lib/outbound-dispatch-service';

export const runtime = 'nodejs';

function createDispatchControlRepository() {
  const notificationRepository = createSupabaseNotificationRepository();

  return {
    ...notificationRepository,
    getDispatchSettings,
    updateDispatchSettings,
    countQueuedOutboundMessagesBySource,
  };
}

export async function GET(): Promise<Response> {
  return handleGetOutboundDispatchSettingsRequest(createDispatchControlRepository());
}

export async function PATCH(request: Request): Promise<Response> {
  return handlePatchOutboundDispatchSettingsRequest(
    request,
    createDispatchControlRepository(),
  );
}
