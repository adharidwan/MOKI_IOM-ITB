import { z } from 'zod';

import {
  DispatchSettingsRecord,
  computeEffectiveMinGapMs,
} from './whatsapp-notification-utils';

interface DispatchControlRepository {
  getDispatchSettings(): Promise<DispatchSettingsRecord>;
  updateDispatchSettings(patch: {
    global_messages_per_minute?: number;
    api_notifications_paused?: boolean;
  }): Promise<DispatchSettingsRecord>;
  countQueuedOutboundMessagesBySource(
    sourceType: 'api_notification' | 'ticket_reply' | 'blast',
  ): Promise<number>;
}

class DispatchControlError extends Error {
  status: number;
  code: string;
  details?: string[];

  constructor(status: number, code: string, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const patchDispatchSettingsSchema = z
  .object({
    global_messages_per_minute: z.number().int().min(1).max(600).optional(),
    api_notifications_paused: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.global_messages_per_minute !== undefined ||
      value.api_notifications_paused !== undefined,
    {
      message:
        'At least one of `global_messages_per_minute` or `api_notifications_paused` must be provided.',
    },
  );

export async function handleGetOutboundDispatchSettingsRequest(
  repository: DispatchControlRepository,
): Promise<Response> {
  const settings = await repository.getDispatchSettings();
  return Response.json(await buildDispatchSettingsResponse(settings, repository));
}

export async function handlePatchOutboundDispatchSettingsRequest(
  request: Request,
  repository: DispatchControlRepository,
): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type');

    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      throw new DispatchControlError(
        415,
        'unsupported_media_type',
        'Content-Type must be application/json.',
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new DispatchControlError(422, 'invalid_json', 'Request body must be valid JSON.');
    }

    const parsedBody = patchDispatchSettingsSchema.safeParse(body);

    if (!parsedBody.success) {
      throw new DispatchControlError(
        422,
        'invalid_request_body',
        'Dispatch settings payload validation failed.',
        parsedBody.error.issues.map((issue) => issue.message),
      );
    }

    const updatedSettings = await repository.updateDispatchSettings(parsedBody.data);
    const responseBody = await buildDispatchSettingsResponse(updatedSettings, repository);

    console.log(
      JSON.stringify({
        event: 'dispatch_settings_updated',
        global_messages_per_minute: updatedSettings.global_messages_per_minute,
        api_notifications_paused: updatedSettings.api_notifications_paused,
      }),
    );

    return Response.json(responseBody);
  } catch (error) {
    if (error instanceof DispatchControlError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details ?? [],
          },
        },
        { status: error.status },
      );
    }

    throw error;
  }
}

async function buildDispatchSettingsResponse(
  settings: DispatchSettingsRecord,
  repository: DispatchControlRepository,
): Promise<{
  global_messages_per_minute: number;
  api_notifications_paused: boolean;
  effective_min_gap_ms: number;
  queued_ticket_replies: number;
  queued_api_notifications: number;
  queued_blast_messages: number;
  updated_at: string;
}> {
  const [queuedTicketReplies, queuedApiNotifications, queuedBlastMessages] = await Promise.all([
    repository.countQueuedOutboundMessagesBySource('ticket_reply'),
    repository.countQueuedOutboundMessagesBySource('api_notification'),
    repository.countQueuedOutboundMessagesBySource('blast'),
  ]);

  return {
    global_messages_per_minute: settings.global_messages_per_minute,
    api_notifications_paused: settings.api_notifications_paused,
    effective_min_gap_ms: computeEffectiveMinGapMs(settings.global_messages_per_minute),
    queued_ticket_replies: queuedTicketReplies,
    queued_api_notifications: queuedApiNotifications,
    queued_blast_messages: queuedBlastMessages,
    updated_at: settings.updated_at,
  };
}
