import type {
  WhatsappContainerState,
  WhatsappInstanceRecord,
} from './whatsapp-notification-utils';

export interface WhatsappOrchestratorClient {
  getContainer(instanceId: string): Promise<WhatsappContainerState>;
  startInstance(instance: WhatsappInstanceRecord): Promise<WhatsappContainerState>;
  stopInstance(instanceId: string): Promise<WhatsappContainerState>;
  restartInstance(instance: WhatsappInstanceRecord): Promise<WhatsappContainerState>;
  removeInstance(instanceId: string): Promise<WhatsappContainerState>;
}

export class WhatsappOrchestratorError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function buildNotConfiguredState(instanceId: string): WhatsappContainerState {
  return {
    instance_id: instanceId,
    status: 'not_configured',
    container_name: null,
    image: null,
    created_at: null,
    started_at: null,
    last_error: 'WhatsApp Docker orchestrator is not configured.',
  };
}

function isEnabled(): boolean {
  return process.env.WHATSAPP_ORCHESTRATOR_ENABLED === 'true';
}

function getBaseUrl(): string | null {
  const value = process.env.WHATSAPP_ORCHESTRATOR_BASE_URL?.trim();
  return value || null;
}

function getToken(): string | null {
  const value = process.env.WHATSAPP_ORCHESTRATOR_TOKEN?.trim();
  return value || null;
}

async function requestContainerState(
  path: string,
  init: RequestInit,
): Promise<WhatsappContainerState> {
  const baseUrl = getBaseUrl();
  const token = getToken();

  if (!isEnabled() || !baseUrl || !token) {
    throw new WhatsappOrchestratorError(
      503,
      'orchestrator_not_configured',
      'WhatsApp Docker orchestrator is not configured with base URL and token.',
    );
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
    cache: 'no-store',
  });

  const body = await response.json().catch(() => null) as
    | (Partial<WhatsappContainerState> & { error?: { code?: string; message?: string } })
    | null;

  if (!response.ok) {
    throw new WhatsappOrchestratorError(
      response.status,
      body?.error?.code ||
        (body?.status === 'not_configured' ? 'orchestrator_not_configured' : 'orchestrator_request_failed'),
      body?.error?.message || body?.last_error || 'WhatsApp Docker orchestrator request failed.',
    );
  }

  return body as WhatsappContainerState;
}

export function createWhatsappOrchestratorClient(): WhatsappOrchestratorClient {
  return {
    async getContainer(instanceId: string): Promise<WhatsappContainerState> {
      if (!isEnabled() || !getBaseUrl() || !getToken()) {
        return buildNotConfiguredState(instanceId);
      }

      return requestContainerState(`/instances/${instanceId}/container`, { method: 'GET' });
    },

    async startInstance(instance: WhatsappInstanceRecord): Promise<WhatsappContainerState> {
      return requestContainerState(`/instances/${instance.id}/start`, {
        method: 'POST',
        body: JSON.stringify({
          id: instance.id,
          label: instance.label,
        }),
      });
    },

    async stopInstance(instanceId: string): Promise<WhatsappContainerState> {
      return requestContainerState(`/instances/${instanceId}/stop`, { method: 'POST' });
    },

    async restartInstance(instance: WhatsappInstanceRecord): Promise<WhatsappContainerState> {
      return requestContainerState(`/instances/${instance.id}/restart`, {
        method: 'POST',
        body: JSON.stringify({
          id: instance.id,
          label: instance.label,
        }),
      });
    },

    async removeInstance(instanceId: string): Promise<WhatsappContainerState> {
      return requestContainerState(`/instances/${instanceId}/remove`, { method: 'POST' });
    },
  };
}
