import {
  WHATSAPP_RUNTIME_TTL_SECONDS,
} from './whatsapp-ops-runtime';
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
} from './whatsapp-notification-utils';

export interface WhatsappOpsRepository {
  listInstances(): Promise<WhatsappInstanceRecord[]>;
  getInstanceRuntime(instanceId: string): Promise<WhatsappInstanceRuntime | null>;
  getInstanceQueueSummary(instanceId: string): Promise<WhatsappInstanceQueueSummary>;
  getInstanceStaffSummary(instanceId: string): Promise<WhatsappInstanceStaffSummary>;
  listInstanceEvents(instanceId: string, limit: number): Promise<WhatsappInstanceEventRecord[]>;
  getGlobalQueueCounts(): Promise<{
    queued_ticket_replies: number;
    queued_api_notifications: number;
  }>;
  getGlobalFailedRetryingCount(): Promise<number>;
  getGlobalOldestQueuedAt(): Promise<string | null>;
  listRecentOutbound(limit: number): Promise<WhatsappOutboundListItem[]>;
  getOutboundSummary(): Promise<WhatsappOutboundSummary>;
}

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
): Promise<Response> {
  const [summary, items] = await Promise.all([
    repository.getOutboundSummary(),
    repository.listRecentOutbound(25),
  ]);

  return Response.json({
    summary,
    items,
  });
}
