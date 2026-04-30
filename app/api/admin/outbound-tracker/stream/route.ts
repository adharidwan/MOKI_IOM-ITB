import { getDispatchSettings } from '@/app/lib/whatsapp-notification-repository';
import { createWhatsappOpsRepository } from '@/app/lib/whatsapp-ops-repository';
import { getOutboundTrackerResponse } from '@/app/lib/outbound-tracker-service';

export const runtime = 'nodejs';

function toSseMessage(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function parseTrackedIds(request: Request): string[] {
  const { searchParams } = new URL(request.url);

  return Array.from(
    new Set(
      searchParams
        .getAll('id')
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0),
    ),
  );
}

export async function GET(request: Request): Promise<Response> {
  const repository = createWhatsappOpsRepository();
  const encoder = new TextEncoder();
  const trackedIds = parseTrackedIds(request);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let keepAliveId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let previousPayload = '';

      const enqueue = (message: string) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(message));
        } catch {
          closed = true;
        }
      };

      const sendUpdate = async () => {
        if (closed) {
          return;
        }

        try {
          const payload = await getOutboundTrackerResponse(
            {
              ...repository,
              getDispatchSettings,
            },
            trackedIds,
          );
          const serializedPayload = JSON.stringify(payload);

          if (serializedPayload === previousPayload) {
            return;
          }

          previousPayload = serializedPayload;
          enqueue(toSseMessage(payload));
        } catch (error) {
          enqueue(toSseMessage({
            error: error instanceof Error ? error.message : 'Gagal memuat pembaruan tracker outbound.',
          }));
        }
      };

      void sendUpdate();
      intervalId = setInterval(() => {
        void sendUpdate();
      }, 2500);

      keepAliveId = setInterval(() => {
        enqueue(': keep-alive\n\n');
      }, 15000);
    },
    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
      }

      if (keepAliveId) {
        clearInterval(keepAliveId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
