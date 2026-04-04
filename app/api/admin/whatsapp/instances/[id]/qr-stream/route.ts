import { createWhatsappOpsRepository } from '../../../../../../lib/whatsapp-ops-repository';
import { getWhatsappInstanceDetail } from '../../../../../../lib/whatsapp-ops-service';

export const runtime = 'nodejs';

type Props = {
  params: Promise<{ id: string }>;
};

function toSseMessage(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(_request: Request, { params }: Props): Promise<Response> {
  const resolvedParams = await params;
  const repository = createWhatsappOpsRepository();
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let keepAliveId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const closed = false;
      let previousPayload = '';

      const sendDetail = async () => {
        if (closed) {
          return;
        }

        try {
          const detail = await getWhatsappInstanceDetail(resolvedParams.id, repository);
          const payload = JSON.stringify(detail);

          if (payload === previousPayload) {
            return;
          }

          previousPayload = payload;
          controller.enqueue(encoder.encode(toSseMessage({ detail })));
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              toSseMessage({
                error: error instanceof Error ? error.message : 'Gagal memuat pembaruan QR.',
              }),
            ),
          );
        }
      };

      void sendDetail();
      intervalId = setInterval(() => {
        void sendDetail();
      }, 2000);

      keepAliveId = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        }
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
