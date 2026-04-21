import type { OutboundMessageStatus, OutboundMessageSourceType, WhatsappOutboundListItem } from './whatsapp-notification-utils';

export const OUTBOUND_TRACKER_SESSION_STORAGE_KEY = 'outbound-tracker-batches';
export const SENT_BATCH_TTL_MS = 10 * 60 * 1000;
export const FAILED_BATCH_TTL_MS = 30 * 60 * 1000;

const trackedBatchDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});

export interface TrackedOutboundBatch {
  id: string;
  label: string;
  source_type: OutboundMessageSourceType;
  created_at: string;
  tracked_ids: string[];
  total_count: number;
  resolved_at: string | null;
}

export interface TrackedOutboundBatchSummary extends TrackedOutboundBatch {
  queued: number;
  retrying: number;
  failed: number;
  sent: number;
  active: number;
}

function normalizeTrackedIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
}

function trackedBatchSourceLabel(sourceType: OutboundMessageSourceType): string {
  if (sourceType === 'ticket_reply') return 'Ticket';
  if (sourceType === 'api_notification') return 'External';
  return 'Blast';
}

function formatTrackedBatchTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return trackedBatchDateFormatter.format(date);
}

function buildTrackedBatchDisplayId(batch: TrackedOutboundBatch, existingBatches: TrackedOutboundBatch[]): string {
  const baseId = `${trackedBatchSourceLabel(batch.source_type)} - ${formatTrackedBatchTimestamp(batch.created_at)}`;

  if (!existingBatches.some((existingBatch) => existingBatch.id === baseId)) {
    return baseId;
  }

  const code = String(batch.id || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(-4)
    .toUpperCase() || '0001';

  let nextId = `${baseId} #${code}`;
  let duplicateIndex = 2;

  while (existingBatches.some((existingBatch) => existingBatch.id === nextId)) {
    nextId = `${baseId} #${code}-${duplicateIndex}`;
    duplicateIndex += 1;
  }

  return nextId;
}

export function normalizeTrackedBatches(rawValue: unknown): TrackedOutboundBatch[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const trackedIds = normalizeTrackedIds(Array.isArray(record.tracked_ids) ? (record.tracked_ids as string[]) : []);

      if (!String(record.id || '').trim() || !trackedIds.length) {
        return null;
      }

      return {
        id: String(record.id || '').trim(),
        label: String(record.label || 'Outbound batch').trim() || 'Outbound batch',
        source_type: (String(record.source_type || 'blast').trim() || 'blast') as OutboundMessageSourceType,
        created_at: String(record.created_at || new Date().toISOString()),
        tracked_ids: trackedIds,
        total_count: Math.max(trackedIds.length, Number(record.total_count || trackedIds.length)),
        resolved_at: record.resolved_at ? String(record.resolved_at) : null,
      } satisfies TrackedOutboundBatch;
    })
    .filter((entry): entry is TrackedOutboundBatch => Boolean(entry));
}

export function prepareTrackedBatchForRegistration(
  batches: TrackedOutboundBatch[],
  nextBatch: TrackedOutboundBatch,
): TrackedOutboundBatch | null {
  const normalizedNextBatch = normalizeTrackedBatches([nextBatch])[0];

  if (!normalizedNextBatch) {
    return null;
  }

  const displayId = buildTrackedBatchDisplayId(normalizedNextBatch, batches);
  return {
    ...normalizedNextBatch,
    id: displayId,
    label: displayId,
  } satisfies TrackedOutboundBatch;
}

export function registerTrackedBatch(
  batches: TrackedOutboundBatch[],
  nextBatch: TrackedOutboundBatch,
): TrackedOutboundBatch[] {
  const displayBatch = prepareTrackedBatchForRegistration(batches, nextBatch);

  if (!displayBatch) {
    return batches;
  }

  const withoutCurrent = batches.filter((batch) => batch.id !== displayBatch.id);
  return [displayBatch, ...withoutCurrent].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
}

export function collectTrackedIds(batches: TrackedOutboundBatch[]): string[] {
  return Array.from(new Set(batches.flatMap((batch) => batch.tracked_ids)));
}

export function deriveBatchSummaries(
  batches: TrackedOutboundBatch[],
  items: WhatsappOutboundListItem[],
): TrackedOutboundBatchSummary[] {
  const itemById = new Map(items.map((item) => [item.id, item] as const));

  return batches.map((batch) => {
    const batchItems = batch.tracked_ids
      .map((trackedId) => itemById.get(trackedId))
      .filter((item): item is WhatsappOutboundListItem => Boolean(item));

    const countByStatus = (status: OutboundMessageStatus) =>
      batchItems.filter((item) => item.delivery_status === status).length;

    const queued = countByStatus('queued');
    const retrying = countByStatus('retrying');
    const failed = countByStatus('failed');
    const sent = countByStatus('sent');

    return {
      ...batch,
      queued,
      retrying,
      failed,
      sent,
      active: queued + retrying,
    };
  });
}

export function reconcileTrackedBatches(
  batches: TrackedOutboundBatch[],
  items: WhatsappOutboundListItem[],
  nowMs = Date.now(),
): TrackedOutboundBatch[] {
  const summaries = deriveBatchSummaries(batches, items);

  return summaries
    .map((summary) => {
      const trackedCount = summary.tracked_ids.length;
      const terminalCount = summary.sent + summary.failed;
      const isFullyTerminal = trackedCount > 0 && terminalCount === trackedCount;

      if (!isFullyTerminal) {
        return {
          ...summary,
          resolved_at: null,
        } satisfies TrackedOutboundBatchSummary;
      }

      const resolvedAt = summary.resolved_at || new Date(nowMs).toISOString();
      return {
        ...summary,
        resolved_at: resolvedAt,
      } satisfies TrackedOutboundBatchSummary;
    })
    .filter((summary) => {
      if (!summary.resolved_at) {
        return true;
      }

      const resolvedAtMs = Date.parse(summary.resolved_at);

      if (!Number.isFinite(resolvedAtMs)) {
        return true;
      }

      const ttlMs = summary.failed > 0 ? FAILED_BATCH_TTL_MS : SENT_BATCH_TTL_MS;
      return nowMs - resolvedAtMs < ttlMs;
    })
    .map((summary) => ({
      id: summary.id,
      label: summary.label,
      source_type: summary.source_type,
      created_at: summary.created_at,
      tracked_ids: summary.tracked_ids,
      total_count: summary.total_count,
      resolved_at: summary.resolved_at,
    }));
}
