import {
  WHATSAPP_RUNTIME_TTL_SECONDS,
} from './whatsapp-ops-runtime';
import type { WhatsappOrchestratorClient } from './whatsapp-orchestrator';
import { WhatsappOrchestratorError } from './whatsapp-orchestrator';
import { DEFAULT_WHATSAPP_INSTANCE_ID, WHATSAPP_INSTANCE_ID_PATTERN } from './whatsapp-notification-utils';
import type {
  WhatsappDashboardOverview,
  WhatsappDashboardSummary,
  WhatsappInstanceEventRecord,
  WhatsappInstanceQueueSummary,
  WhatsappInstanceRecord,
  WhatsappInstanceRuntime,
  WhatsappInstanceStaffSummary,
  WhatsappInstanceStatus,
  WhatsappInstanceSummary,
  WhatsappOutboundListItem,
  WhatsappOutboundSummary,
  WhatsappContainerState,
} from './whatsapp-notification-utils';

export interface CreateWhatsappInstanceInput {
  id: string;
  label: string;
  is_enabled?: boolean;
}

export interface UpdateWhatsappInstanceInput {
  label?: string;
  is_enabled?: boolean;
  retired_at?: string | null;
}

export interface WhatsappOpsRepository {
  listInstances(): Promise<WhatsappInstanceRecord[]>;
  getInstanceRuntime(instanceId: string): Promise<WhatsappInstanceRuntime | null>;
  getInstanceQueueSummary(instanceId: string): Promise<WhatsappInstanceQueueSummary>;
  getInstanceStaffSummary(instanceId: string): Promise<WhatsappInstanceStaffSummary>;
  listInstanceEvents(instanceId: string, limit: number): Promise<WhatsappInstanceEventRecord[]>;
  getGlobalQueueCounts(): Promise<{
    queued_ticket_replies: number;
    queued_api_notifications: number;
    queued_blast_messages: number;
  }>;
  getGlobalFailedRetryingCount(): Promise<number>;
  getGlobalOldestQueuedAt(): Promise<string | null>;
  listRecentOutbound(limit: number): Promise<WhatsappOutboundListItem[]>;
  listOutboundByIds(ids: string[]): Promise<WhatsappOutboundListItem[]>;
  getOutboundSummary(): Promise<WhatsappOutboundSummary>;
  createInstance(input: CreateWhatsappInstanceInput): Promise<WhatsappInstanceRecord>;
  updateInstance(instanceId: string, input: UpdateWhatsappInstanceInput): Promise<WhatsappInstanceRecord>;
  assertInstanceCanBeDeleted(instanceId: string): Promise<void>;
  deleteInstance(instanceId: string): Promise<void>;
}

type DeleteWhatsappInstanceMode = 'stop_only' | 'remove_runtime_resources' | 'delete_db_row';

class WhatsappOpsError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isHeartbeatStale(lastHeartbeatAt: string | null, nowMs = Date.now()): boolean {
  if (!lastHeartbeatAt) {
    return false;
  }

  const lastHeartbeatMs = Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(lastHeartbeatMs)) {
    return false;
  }

  return nowMs - lastHeartbeatMs > WHATSAPP_RUNTIME_TTL_SECONDS * 1000;
}

export function deriveWhatsappInstanceStatus(
  instance: WhatsappInstanceRecord,
  runtime: WhatsappInstanceRuntime | null,
  nowMs = Date.now(),
): WhatsappInstanceStatus {
  if (!runtime) {
    return instance.status;
  }

  if (runtime.has_worker_conflict) {
    return 'degraded';
  }

  if (isHeartbeatStale(runtime.last_heartbeat_at, nowMs)) {
    if (runtime.status === 'ready' || runtime.status === 'connecting') {
      return 'degraded';
    }
  }

  return runtime.status || instance.status;
}

export function buildWhatsappDashboardSummary(
  instances: WhatsappInstanceSummary[],
  globalQueueCounts: {
    queued_ticket_replies: number;
    queued_api_notifications: number;
    queued_blast_messages: number;
  },
  oldestQueuedAt: string | null,
  failedRetryingCount: number,
): WhatsappDashboardSummary {
  return {
    total_instances: instances.length,
    ready_instances: instances.filter((item) => item.derived_status === 'ready').length,
    qr_required_instances: instances.filter((item) => item.derived_status === 'qr_required').length,
    degraded_instances: instances.filter((item) =>
      ['degraded', 'disconnected', 'auth_failed'].includes(item.derived_status),
    ).length,
    queued_ticket_replies: globalQueueCounts.queued_ticket_replies,
    queued_api_notifications: globalQueueCounts.queued_api_notifications,
    queued_blast_messages: globalQueueCounts.queued_blast_messages,
    oldest_queued_at: oldestQueuedAt,
    failed_or_retrying_messages: failedRetryingCount,
  };
}

async function buildInstanceSummary(
  instance: WhatsappInstanceRecord,
  repository: WhatsappOpsRepository,
): Promise<WhatsappInstanceSummary> {
  const [runtime, queue, staff] = await Promise.all([
    repository.getInstanceRuntime(instance.id),
    repository.getInstanceQueueSummary(instance.id),
    repository.getInstanceStaffSummary(instance.id),
  ]);

  return {
    instance,
    runtime,
    derived_status: deriveWhatsappInstanceStatus(instance, runtime),
    has_qr: Boolean(runtime?.qr_code),
    queue,
    staff,
  };
}

export async function getWhatsappDashboardOverview(
  repository: WhatsappOpsRepository,
): Promise<WhatsappDashboardOverview> {
  const instances = await repository.listInstances();
  const summaries = await Promise.all(instances.map((instance) => buildInstanceSummary(instance, repository)));
  const [globalQueueCounts, oldestQueuedAt, failedRetryingCount] = await Promise.all([
    repository.getGlobalQueueCounts(),
    repository.getGlobalOldestQueuedAt(),
    repository.getGlobalFailedRetryingCount(),
  ]);

  return {
    summary: buildWhatsappDashboardSummary(
      summaries,
      globalQueueCounts,
      oldestQueuedAt,
      failedRetryingCount,
    ),
    instances: summaries,
  };
}

export async function getWhatsappInstanceDetail(
  instanceId: string,
  repository: WhatsappOpsRepository,
): Promise<WhatsappInstanceSummary> {
  const instance = (await repository.listInstances()).find((item) => item.id === instanceId);

  if (!instance) {
    throw new WhatsappOpsError(404, 'instance_not_found', 'WhatsApp instance not found.');
  }

  return buildInstanceSummary(instance, repository);
}

export async function handleGetWhatsappInstancesRequest(
  repository: WhatsappOpsRepository,
): Promise<Response> {
  return Response.json(await getWhatsappDashboardOverview(repository));
}

export async function handleGetWhatsappInstanceRequest(
  instanceId: string,
  repository: WhatsappOpsRepository,
): Promise<Response> {
  try {
    return Response.json(await getWhatsappInstanceDetail(instanceId, repository));
  } catch (error) {
    if (error instanceof WhatsappOpsError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.status },
      );
    }

    throw error;
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WhatsappOpsError(422, 'invalid_request_body', 'Request body must be a JSON object.');
  }

  return value as Record<string, unknown>;
}

function validateInstanceId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';

  if (!id) {
    throw new WhatsappOpsError(422, 'invalid_instance_id', 'Instance ID is required.');
  }

  if (!WHATSAPP_INSTANCE_ID_PATTERN.test(id)) {
    throw new WhatsappOpsError(
      422,
      'invalid_instance_id',
      'Instance ID may only contain lowercase letters, numbers, hyphen, and underscore.',
    );
  }

  return id;
}

function validateInstanceLabel(value: unknown, required: boolean): string | undefined {
  const label = typeof value === 'string' ? value.trim() : '';

  if (!label) {
    if (required) {
      throw new WhatsappOpsError(422, 'invalid_instance_label', 'Instance label is required.');
    }

    return undefined;
  }

  return label;
}

function validateOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new WhatsappOpsError(422, 'invalid_request_body', `${fieldName} must be a boolean.`);
  }

  return value;
}

function validateDeleteMode(value: unknown): DeleteWhatsappInstanceMode {
  if (value === undefined) {
    return 'stop_only';
  }

  if (value === 'remove_completely') {
    return 'delete_db_row';
  }

  if (value === 'stop_only' || value === 'remove_runtime_resources' || value === 'delete_db_row') {
    return value;
  }

  throw new WhatsappOpsError(
    422,
    'invalid_delete_mode',
    'Delete mode must be stop_only, remove_runtime_resources, or delete_db_row.',
  );
}

function toWhatsappOpsErrorResponse(error: WhatsappOpsError): Response {
  return Response.json(
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    { status: error.status },
  );
}

export async function handleCreateWhatsappInstanceRequest(
  request: Request,
  repository: WhatsappOpsRepository,
): Promise<Response> {
  try {
    const body = parseJsonObject(await request.json());
    const id = validateInstanceId(body.id);

    if ((await repository.listInstances()).some((instance) => instance.id === id)) {
      throw new WhatsappOpsError(409, 'instance_already_exists', 'WhatsApp instance already exists.');
    }

    const instance = await repository.createInstance({
      id,
      label: validateInstanceLabel(body.label, true)!,
      is_enabled: validateOptionalBoolean(body.is_enabled, 'is_enabled') ?? true,
    });

    return Response.json(instance, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return toWhatsappOpsErrorResponse(
        new WhatsappOpsError(422, 'invalid_json', 'Request body must be valid JSON.'),
      );
    }

    if (error instanceof WhatsappOpsError) {
      return toWhatsappOpsErrorResponse(error);
    }

    throw error;
  }
}

export async function handleUpdateWhatsappInstanceRequest(
  instanceId: string,
  request: Request,
  repository: WhatsappOpsRepository,
): Promise<Response> {
  try {
    const body = parseJsonObject(await request.json());
    const id = validateInstanceId(instanceId);
    const label = validateInstanceLabel(body.label, false);
    const isEnabled = validateOptionalBoolean(body.is_enabled, 'is_enabled');

    if (label === undefined && isEnabled === undefined) {
      throw new WhatsappOpsError(
        422,
        'invalid_request_body',
        'Request body must include label or is_enabled.',
      );
    }

    if (!(await repository.listInstances()).some((instance) => instance.id === id)) {
      throw new WhatsappOpsError(404, 'instance_not_found', 'WhatsApp instance not found.');
    }

    return Response.json(
      await repository.updateInstance(id, {
        label,
        is_enabled: isEnabled,
      }),
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return toWhatsappOpsErrorResponse(
        new WhatsappOpsError(422, 'invalid_json', 'Request body must be valid JSON.'),
      );
    }

    if (error instanceof WhatsappOpsError) {
      return toWhatsappOpsErrorResponse(error);
    }

    throw error;
  }
}

async function getRequiredWhatsappInstance(
  instanceId: string,
  repository: WhatsappOpsRepository,
): Promise<WhatsappInstanceRecord> {
  const id = validateInstanceId(instanceId);
  const instance = (await repository.listInstances()).find((item) => item.id === id);

  if (!instance) {
    throw new WhatsappOpsError(404, 'instance_not_found', 'WhatsApp instance not found.');
  }

  return instance;
}

function toOrchestratorErrorResponse(error: WhatsappOrchestratorError): Response {
  return Response.json(
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    { status: error.status },
  );
}

export async function handleGetWhatsappInstanceContainerRequest(
  instanceId: string,
  repository: WhatsappOpsRepository,
  orchestrator: WhatsappOrchestratorClient,
): Promise<Response> {
  try {
    const instance = await getRequiredWhatsappInstance(instanceId, repository);
    return Response.json(await orchestrator.getContainer(instance.id));
  } catch (error) {
    if (error instanceof WhatsappOpsError) {
      return toWhatsappOpsErrorResponse(error);
    }

    if (error instanceof WhatsappOrchestratorError) {
      return toOrchestratorErrorResponse(error);
    }

    if (error instanceof Error && error.message.includes('related delivery history')) {
      return toWhatsappOpsErrorResponse(
        new WhatsappOpsError(409, 'instance_has_delivery_history', error.message),
      );
    }

    throw error;
  }
}

export async function handleWhatsappInstanceContainerActionRequest(
  action: 'start' | 'stop' | 'restart',
  instanceId: string,
  repository: WhatsappOpsRepository,
  orchestrator: WhatsappOrchestratorClient,
): Promise<Response> {
  try {
    const instance = await getRequiredWhatsappInstance(instanceId, repository);
    let state: WhatsappContainerState;

    if (action === 'start') {
      state = await orchestrator.startInstance(instance);
    } else if (action === 'stop') {
      state = await orchestrator.stopInstance(instance.id);
    } else {
      state = await orchestrator.restartInstance(instance);
    }

    return Response.json(state);
  } catch (error) {
    if (error instanceof WhatsappOpsError) {
      return toWhatsappOpsErrorResponse(error);
    }

    if (error instanceof WhatsappOrchestratorError) {
      return toOrchestratorErrorResponse(error);
    }

    throw error;
  }
}

export async function handleDeleteWhatsappInstanceRequest(
  instanceId: string,
  request: Request,
  repository: WhatsappOpsRepository,
  orchestrator: WhatsappOrchestratorClient,
): Promise<Response> {
  try {
    const bodyText = await request.text();
    const body = bodyText ? parseJsonObject(JSON.parse(bodyText)) : {};
    const mode = validateDeleteMode(body.mode);
    const instance = await getRequiredWhatsappInstance(instanceId, repository);

    if (mode === 'stop_only') {
      const [updatedInstance, container] = await Promise.all([
        repository.updateInstance(instance.id, { is_enabled: false, retired_at: new Date().toISOString() }),
        orchestrator.stopInstance(instance.id),
      ]);

      return Response.json({ mode, instance: updatedInstance, container });
    }

    if (mode === 'remove_runtime_resources') {
      const [updatedInstance, container] = await Promise.all([
        repository.updateInstance(instance.id, { is_enabled: false, retired_at: new Date().toISOString() }),
        orchestrator.removeInstance(instance.id),
      ]);

      return Response.json({ mode, instance: updatedInstance, container });
    }

    if (instance.id === DEFAULT_WHATSAPP_INSTANCE_ID) {
      throw new WhatsappOpsError(409, 'default_instance_cannot_be_removed', 'Default WhatsApp instance cannot be removed completely.');
    }

    await repository.assertInstanceCanBeDeleted(instance.id);
    const container = await orchestrator.removeInstance(instance.id);
    await repository.deleteInstance(instance.id);

    return Response.json({ mode, instance_id: instance.id, container });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return toWhatsappOpsErrorResponse(
        new WhatsappOpsError(422, 'invalid_json', 'Request body must be valid JSON.'),
      );
    }

    if (error instanceof WhatsappOpsError) {
      return toWhatsappOpsErrorResponse(error);
    }

    if (error instanceof WhatsappOrchestratorError) {
      return toOrchestratorErrorResponse(error);
    }

    throw error;
  }
}

export async function handleGetWhatsappInstanceEventsRequest(
  instanceId: string,
  repository: WhatsappOpsRepository,
): Promise<Response> {
  return Response.json({
    instance_id: instanceId,
    events: await repository.listInstanceEvents(instanceId, 25),
  });
}

export async function handleGetWhatsappOutboundRequest(
  repository: WhatsappOpsRepository,
  limit = 25,
): Promise<Response> {
  const [summary, items] = await Promise.all([
    repository.getOutboundSummary(),
    repository.listRecentOutbound(limit),
  ]);

  return Response.json({
    summary,
    items,
  });
}
