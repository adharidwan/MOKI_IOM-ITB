# Architecture Context

This document captures the important architecture decisions and the current operational model for the WhatsApp ticketing and notification service. It is meant to be a stable context file for future sessions.

## Current System Shape

- The Next.js app is the control plane:
  - ticket dashboard
  - server-side ticket actions
  - public notification API at `POST /api/v1/messages/whatsapp`
  - session-scoped outbound tracker overlay for operator-visible delivery progress
  - contact management at `/contacts`
  - group directory at `/group`
  - paginated blast recipient selection at `/blastmessage`
- `scripts/whatsapp-bot.js` is the only component that talks directly to WhatsApp Web.
- Supabase remains the source of truth for business data and the outbound delivery ledger.
- Redis + BullMQ is the operational outbound queue and idempotency/quota state backend.

## Current Message Flows

### Inbound WhatsApp -> Support

1. A WhatsApp user sends a message to the bot.
2. The bot processes it directly in `scripts/whatsapp-bot.js`.
3. The bot either:
   - appends the message to an active ticket, or
   - treats it as a ticket-creation command, or
   - sends the help message for invalid input.

Important:
- Inbound messages are not queued first.
- Inbound support behavior remains owned by the bot worker.

### Ticket Dashboard -> Outbound WhatsApp

1. An admin replies from the ticket dashboard.
2. The app inserts a row into `replies` for ticket history.
3. The app inserts a row into `outbound_messages` as a delivery ledger entry with:
   - `source_type = 'ticket_reply'`
   - `source_id = <reply id>`
   - higher priority than notification traffic
4. The app enqueues a BullMQ job with the same source metadata.
5. The bot worker consumes the BullMQ job, sends the WhatsApp message, then mirrors delivery state back onto the linked `replies` row.
6. Operators can monitor the resulting outbound rows from the session-scoped tracker overlay without leaving the current page.

Important:
- `replies` is still the ticket conversation record.
- `replies` is no longer the outbound queue source of truth.

### Public API -> Outbound WhatsApp

1. An external service calls `POST /api/v1/messages/whatsapp`.
2. The app authenticates the API client, validates the payload, and applies idempotency checks.
3. The app enforces per-client application quotas:
   - requests per minute
   - pending queued notifications
4. The app inserts a row into `outbound_messages` as a lightweight ledger entry with:
   - `source_type = 'api_notification'`
   - `delivery_status = 'queued'`
   - lower priority than ticket replies
5. The app reserves the caller's idempotency key in Redis for 24 hours and enqueues a BullMQ job.
6. The bot worker resolves the WhatsApp recipient chat ID, sends the message, then updates delivery status in the ledger row.
7. Operators can see these outbound rows in the same session-scoped tracker overlay alongside other tracked outbound traffic from the current browser session.

Important:
- Public API sends are asynchronous.
- `202 Accepted` means queued, not delivered.
- Public API may now return `429` when the client exceeds configured quotas.

## Queue Model Today

The system now has one outbound Redis-backed queue:

1. BullMQ queue `outbound-dispatch`
   - used for ticket replies and public API notifications
   - stores operational due-work, delayed retries, and priority ordering

2. `outbound_messages`
   - no longer polled by the bot
   - stores lightweight accepted/sent/failed ledger data and delivery metadata
   - provides status lookup data for items currently tracked in the operator-facing overlay

Related tables:
- `replies` remains ticket history and UI-facing reply state
- `bot_dispatch_settings` stores runtime dispatch controls
- `api_clients` stores API credentials and per-client quota configuration

Redis also stores:
- 24-hour idempotency reservations for public API requests
- per-client accepted-request timestamps for the 60-second rate limit
- pending outbound counters by client and source type

The bot runs a BullMQ worker with concurrency `1` and uses `bot_dispatch_settings` to decide whether a job can send now or should be delayed in-place.

The Next.js app also exposes tracker endpoints for the session-scoped outbound overlay:

- `GET /api/admin/outbound-tracker`
- `GET /api/admin/outbound-tracker/stream`

These endpoints surface tracked outbound rows and summary counts for all supported source types:

- `ticket_reply`
- `api_notification`
- `blast`

## Current Constraints And Gaps

### 1. No Edge-Level Protection In Repo

- The public API now has application-level per-client quotas.
- There is still no edge or gateway limiter defined in this repository.

Result:
- the app can protect itself from a single client to some degree
- upstream abuse protection is still not defined here

### 2. Temporary Unsafe Dispatch Control API

- `GET /api/admin/outbound-dispatch-settings`
- `PATCH /api/admin/outbound-dispatch-settings`
- These routes currently rely on the same open-dashboard trust model as the rest of the app.

Result:
- safe only in a trusted internal environment
- not safe for broad exposure without real admin auth

### 3. Limited Observability

The repo does not currently expose:
- queue depth metrics
- send throughput metrics
- per-client request rate
- send latency metrics
- oldest queued item age

Result:
- real production volume is unknown from the application itself

Important nuance:

- The app now has a user-facing session-scoped outbound tracker overlay and SSE-backed live status feed for current tracked message activity.
- The overlay stores tracked outbound batches in browser `sessionStorage`, so it can survive page refresh within the same browser session.
- The overlay is still intentionally non-persistent at the product level: it disappears when the browser session ends and old terminal batches are auto-pruned.
- This improves operator UX substantially, but it is not a full observability or metrics system yet.

### 4. Single Worker WhatsApp Session

- One BullMQ worker processes outbound jobs with concurrency `1`.
- Ticket replies are prioritized over API notifications.
- API notifications can be globally paused without pausing ticket replies.
- Global pacing still applies through `bot_dispatch_settings`.

Result:
- delivery latency is much lower than the old polling model
- scaling behavior is still intentionally limited to one WhatsApp session for now

## Agreed Direction

These are the intended architectural directions based on the project discussion:

1. Keep outbound WhatsApp delivery asynchronous.
2. Keep application-level public API quotas in place.
3. Keep edge or gateway rate limiting as an optional outer layer, not the only protection.
4. Keep one unified outbound delivery queue in Redis/BullMQ.
5. Keep ticket conversation history separate from the delivery queue.
6. Preserve current inbound support behavior unless product requirements change.
7. Replace the temporary open control API with real admin auth before wider exposure.

## Recommended Next Steps

### Phase 1: Add Queue Observability

Goal:
- make queue health and throughput visible

Recommended minimum telemetry:
- queue depth by source type
- sent count per minute
- failed count per minute
- oldest queued message age
- delivery latency from enqueue to send
- per-client API request count

This can begin with structured application logs before building a dashboard.

### Phase 2: Harden Dispatch Control Access

Goal:
- make runtime dispatch controls safe outside the current trusted environment

Recommended implementation direction:
- add real admin authentication and authorization
- make control actions auditable
- restrict control routes to authenticated operators only

### Phase 3: Prepare For Scaling

Only do this after the queue is unified and basic metrics exist.

Recommended hardening:
- add explicit queue metrics from Redis/BullMQ
- define safe multi-worker ownership before increasing concurrency
- define dead-letter and operator recovery policy explicitly
- add resilient Redis deployment/monitoring for production

## Recommended Order Of Work

If the team wants the safest next sequence:

1. Add basic queue and request metrics.
2. Protect the dispatch-control API with real admin auth.
3. Improve due-work lookup and worker-claiming semantics.
4. Define dead-letter and operator recovery policy.

## Explicit Non-Goals For Now

These are not the recommended immediate next steps:

- changing inbound support-message behavior
- adding delivery webhooks immediately
- building a public delivery-status endpoint before stronger observability exists

## Notes For Future Sessions

When continuing work in this area, preserve these assumptions unless product requirements explicitly change:

- The public API is a notification API, not a public ticket-management API.
- Outbound messages must remain asynchronous.
- The bot worker is the only WhatsApp-sending component.
- BullMQ is the single outbound operational queue.
- `outbound_messages` is a delivery ledger, not the due-work queue.
- The session-scoped outbound tracker overlay stores batch membership in browser `sessionStorage` and only reads delivery state for tracked message IDs from `outbound_messages`.
- Resolved batches are automatically removed after a short TTL so failed or completed items do not accumulate indefinitely in the overlay.
- Contact and group administration are intentionally split: `/contacts` focuses on contact records, while `/group` focuses on browsing group composition before blast selection.
- `/contacts` and `/group` now use server-side pagination and filtering.
- `/blastmessage` no longer needs the full contact dataset on initial render; recipient selection is backed by paginated server queries for contacts and groups.
- Ticket replies have higher dispatch priority than API notifications.
- Application-level public API quotas exist.
- The dispatch-control API currently has no real auth and should be treated as temporary.
