import {
  computeEffectiveMinGapMs,
  type DispatchSettingsRecord,
  type OutboundTrackerResponse,
  type OutboundMessageStatus,
  type OutboundMessageSourceType,
  type WhatsappOutboundListItem,
} from './whatsapp-notification-utils';

export interface OutboundTrackerRepository {
  listOutboundByIds(ids: string[]): Promise<WhatsappOutboundListItem[]>;
  getDispatchSettings(): Promise<DispatchSettingsRecord>;
}

function countByStatus(items: WhatsappOutboundListItem[], status: OutboundMessageStatus): number {
  return items.filter((item) => item.delivery_status === status).length;
}

function countBySource(items: WhatsappOutboundListItem[], sourceType: OutboundMessageSourceType): number {
  return items.filter((item) => item.source_type === sourceType).length;
}

function countActiveBySource(items: WhatsappOutboundListItem[], sourceType: OutboundMessageSourceType): number {
  return items.filter(
    (item) => item.source_type === sourceType && ['queued', 'retrying'].includes(item.delivery_status),
  ).length;
}

function estimateCompletionSeconds(
  items: WhatsappOutboundListItem[],
  settings: DispatchSettingsRecord,
  effectiveMinGapMs: number,
): number | null {
  const activeItems = items.filter((item) => ['queued', 'retrying'].includes(item.delivery_status));

  if (!activeItems.length) {
    return 0;
  }

  if (
    settings.api_notifications_paused &&
    activeItems.some((item) => item.source_type === 'api_notification' || item.source_type === 'blast')
  ) {
    return null;
  }

  return Math.ceil((activeItems.length * effectiveMinGapMs) / 1000);
}

export async function getOutboundTrackerResponse(
  repository: OutboundTrackerRepository,
  trackedIds: string[],
): Promise<OutboundTrackerResponse> {
  const normalizedTrackedIds = Array.from(
    new Set(trackedIds.map((id) => String(id || '').trim()).filter(Boolean)),
  );
  const settings = await repository.getDispatchSettings();
  const effectiveMinGapMs = computeEffectiveMinGapMs(settings.global_messages_per_minute);

  if (!normalizedTrackedIds.length) {
    return {
      summary: {
        queued: 0,
        retrying: 0,
        failed: 0,
        sent: 0,
        active: 0,
        total: 0,
        ticket_reply: 0,
        api_notification: 0,
        blast: 0,
        queued_ticket_replies: 0,
        queued_api_notifications: 0,
        queued_blast_messages: 0,
        effective_min_gap_ms: effectiveMinGapMs,
        api_notifications_paused: settings.api_notifications_paused,
        estimated_completion_seconds: 0,
        updated_at: new Date().toISOString(),
      },
      items: [],
    };
  }

  const items = await repository.listOutboundByIds(normalizedTrackedIds);
  const queued = countByStatus(items, 'queued');
  const retrying = countByStatus(items, 'retrying');
  const failed = countByStatus(items, 'failed');
  const sent = countByStatus(items, 'sent');

  return {
    summary: {
      queued,
      retrying,
      failed,
      sent,
      active: queued + retrying,
      total: items.length,
      ticket_reply: countBySource(items, 'ticket_reply'),
      api_notification: countBySource(items, 'api_notification'),
      blast: countBySource(items, 'blast'),
      queued_ticket_replies: countActiveBySource(items, 'ticket_reply'),
      queued_api_notifications: countActiveBySource(items, 'api_notification'),
      queued_blast_messages: countActiveBySource(items, 'blast'),
      effective_min_gap_ms: effectiveMinGapMs,
      api_notifications_paused: settings.api_notifications_paused,
      estimated_completion_seconds: estimateCompletionSeconds(items, settings, effectiveMinGapMs),
      updated_at: new Date().toISOString(),
    },
    items,
  };
}
