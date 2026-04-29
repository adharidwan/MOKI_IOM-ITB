# My Next Task List

## Purpose

This document tracks the immediate implementation tasks after the product backlog reality check.

It is focused on the next work items to execute, not the full product backlog.

## Current Priority Order

1. Make multiple WhatsApp bot integration production-ready.
2. Add saved WhatsApp blast templates.
3. Rework the root `/` page into a production-ready dashboard or redirect.
4. Improve `/whatsapp` dashboard UI and admin controls.
5. Improve `/ticket` UI/UX where needed.

## Task 1: Multiple WhatsApp Bot Integration

### Goal

Support multiple WhatsApp bot instances safely, make outbound traffic distribute across available instances, and allow admins to manage bot instances from `/whatsapp`.

### Reality Check

- The database already has `whatsapp_instances`.
- `tickets`, `outbound_messages`, and `whatsapp_contacts` already include `whatsapp_instance_id`.
- Runtime state is already namespaced by instance ID in Redis.
- The bot reads `WHATSAPP_INSTANCE_ID` and `WHATSAPP_INSTANCE_LABEL` from env.
- Ticket replies already preserve the ticket's instance affinity.
- Blast and external API outbound messages still default to the hardcoded `default` instance.
- Admin `/api/admin/whatsapp/instances` is currently GET-only.
- The WhatsApp bot currently uses one `.wwebjs_auth` data path, which can conflict when multiple bot processes run.

### Implementation Tasks

- Add bot session isolation by instance ID in `scripts/whatsapp-bot.js`.
- Add a selector helper for outbound instance assignment.
- Use the selector for blast outbound messages.
- Use the selector for external API outbound messages.
- Keep ticket replies routed to the ticket's `whatsapp_instance_id`.
- Add admin API to create WhatsApp instances.
- Add admin API to update instance label or disabled state.
- Prefer soft-disable over hard delete for demo safety.
- Add dashboard UI on `/whatsapp` to create a bot instance.
- Add dashboard UI to disable or reactivate an instance.
- Show the required env/command for running a worker for each instance.

### Suggested Minimal Data Model Change

Add disabled state if needed:

- Option A: add `is_enabled boolean not null default true` to `whatsapp_instances`.
- Option B: add a new status such as `disabled`.

Recommendation: use `is_enabled` to avoid mixing operational runtime status with admin availability.

### Acceptance Criteria

- Two bot workers can run with different `WHATSAPP_INSTANCE_ID` values without auth/session conflict.
- `/whatsapp` shows both instances.
- New blast/API outbound messages are assigned to a ready enabled instance instead of always `default`.
- Ticket replies still use the same instance that received the original ticket.
- Disabled instances are not selected for new blast/API outbound messages.

### Detailed Plan: Multi-Instance Message Distribution And Admin-Controlled Instances

This plan covers the first implementation focus: multi-instance WhatsApp message delivery and admin-controlled instance management.

The chosen admin disable model is soft-disable only.

Soft-disable means:

- The bot container may still be running.
- The WhatsApp session is not destroyed.
- The instance remains visible in `/whatsapp`.
- New blast/API outbound messages must not be assigned to that instance.
- Existing historical messages, tickets, contacts, QR state, and events are not deleted.
- Existing ticket conversations should not silently move to another WhatsApp account.

#### Core Responsibility Split

| Concern | Owner |
|---|---|
| Bot process exists | Docker/deployment |
| Bot process is logged in and ready | WhatsApp worker runtime |
| Instance can receive new blast/API work | Admin `is_enabled` flag |
| Message delivery history | `outbound_messages` ledger |
| Live status, QR, heartbeat | Redis runtime keys |
| Durable instance configuration | `whatsapp_instances` table |

The admin dashboard should not start or stop Docker containers in v1.

Reason:

- Docker control from a Next.js admin app is deployment-specific.
- It requires privileged access to the Docker socket or host process manager.
- It adds security risk and operational complexity.
- For this project, staging should run multiple explicit bot services instead.

#### Staging Deployment Model

Staging should run one bot container per WhatsApp instance.

Each bot service needs:

- unique `WHATSAPP_INSTANCE_ID`
- unique `WHATSAPP_INSTANCE_LABEL`
- unique `WHATSAPP_WORKER_ID`
- unique auth volume
- shared Redis connection
- shared Supabase configuration

Example service naming:

- `bot_1` with `WHATSAPP_INSTANCE_ID=default`
- `bot_2` with `WHATSAPP_INSTANCE_ID=iom-wa-2`
- `bot_3` with `WHATSAPP_INSTANCE_ID=iom-wa-3`

Do not use `docker compose up --scale bot=2` with the current design unless the bot can automatically receive unique instance IDs and isolated auth volumes.

#### Bot Session Isolation

Problem:

- Current bot auth uses one `.wwebjs_auth` path.
- Multiple bot containers can conflict if they share the same WhatsApp Web auth session.

Required behavior:

- Same `WHATSAPP_INSTANCE_ID` should reuse the same auth session after restart.
- Different `WHATSAPP_INSTANCE_ID` values must never share the same auth session.
- Two running workers with the same `WHATSAPP_INSTANCE_ID` should be treated as a conflict or degraded condition.

Implementation direction:

- Make WhatsApp auth path or LocalAuth client ID instance-specific.
- Use `WHATSAPP_INSTANCE_ID` as the isolation key.
- Example session paths:
  - `.wwebjs_auth/default`
  - `.wwebjs_auth/iom-wa-2`

Cases to consider:

- Two workers start with different instance IDs.
- Two workers accidentally start with the same instance ID.
- Bot restarts and should reuse the same session.
- Bot is moved to a new container but uses the same volume and same instance ID.
- Bot auth is deleted and must show QR again.

#### Eligible Instance Selection

New blast/API outbound messages should only go to eligible instances.

An instance is eligible when:

- `whatsapp_instances.is_enabled = true`
- runtime exists in Redis
- derived status is `ready`
- heartbeat is not stale
- no worker conflict is detected
- optional later: queue pressure is below a configured threshold

An instance is not eligible when:

- disabled by admin
- QR required
- disconnected
- auth failed
- degraded
- no heartbeat
- stale heartbeat
- worker conflict exists

Fallback policy decision:

- Production-strict policy: reject blast/API send when no eligible instance exists.
- Demo-friendly policy: fallback to `default` only if it is enabled and exists.

Recommendation:

- Prefer the production-strict policy for correctness.
- If staging reliability is a concern, implement an explicit fallback with clear warning text instead of silently using `default`.

#### Blast Distribution

Avoid querying the database for lowest queue per individual message.

Reason:

- It creates unnecessary database load during large blasts.
- Queue state becomes stale while inserting messages.
- It slows down blast creation.
- It can produce uneven behavior if many inserts race at once.

Recommended blast flow:

- Resolve all recipients.
- Load eligible instances once.
- Load current queue/load snapshot once per eligible instance.
- Assign recipients to instances in memory.
- Insert outbound rows with selected `whatsapp_instance_id`.
- Enqueue dispatch jobs after outbound rows are created.

Distribution policy:

- Minimum v1: balanced round-robin among eligible instances.
- Better v1: weighted round-robin using current pending counts.

Example:

| Instance | Current queue | New assignment behavior |
|---|---:|---|
| `default` | 50 | receives fewer new recipients |
| `iom-wa-2` | 5 | receives more new recipients |
| `iom-wa-3` | 0 | receives most new recipients |

Important rule:

- Once a message is assigned to an instance, do not automatically rebalance it to another instance.

Reason:

- Keeps delivery behavior predictable.
- Keeps outbound tracker easy to understand.
- Prevents messages from jumping between WhatsApp accounts.

Cases to consider:

- Only one bot is ready.
- Multiple bots are ready.
- One bot is disabled.
- One bot becomes disconnected after messages are assigned.
- One bot has high queue pressure.
- Blast has one recipient.
- Blast has thousands of recipients.
- Duplicate recipients after group resolution.
- Personalized variable rendering per recipient.
- Existing idempotency behavior for duplicate blast requests.
- Some assigned messages fail to enqueue.

#### API Notification Distribution

API notification requests are often one message per request.

Recommended flow:

- Load eligible instances.
- Pick one eligible instance using round-robin or lightweight selection.
- Insert outbound row with selected `whatsapp_instance_id`.

Recommended optimization:

- Use Redis for a simple round-robin pointer later if API traffic is high.
- For first implementation, a lightweight helper that reads eligible instances is acceptable.

Cases to consider:

- High API request rate.
- No eligible instance.
- One ready instance.
- Multiple ready instances.
- Disabled instance.
- Redis unavailable.
- Supabase unavailable.
- Idempotency replay.

Idempotency rule:

- Existing idempotency replay must return/reuse the existing outbound message.
- It must not reassign to a different WhatsApp instance.

#### Ticketing Instance Affinity

Ticket replies must use the same WhatsApp instance that received the original customer message.

Reason:

- The user expects replies from the same WhatsApp account.
- Conversation context belongs to that account.
- Replying from another number can confuse the user.
- WhatsApp Web chat/session state may be instance-specific.

Current behavior to preserve:

- Ticket creation stores `whatsapp_instance_id`.
- Ticket reply queues outbound with the ticket's `whatsapp_instance_id`.

Soft-disable rule for ticketing:

- Soft-disable blocks new blast/API assignment only.
- It should not silently reroute existing ticket replies to another instance.
- If the original instance is down, the reply should remain queued/retrying/fail according to delivery logic.

Cases to consider:

- Ticket created by `default`, admin replies while `default` is ready.
- Ticket created by `iom-wa-2`, admin replies while `iom-wa-2` is disabled but running.
- Ticket created by `iom-wa-2`, admin replies while `iom-wa-2` container is down.
- Ticket created before multi-instance existed and has null/default instance.
- Ticket transfer between WhatsApp accounts is not supported in v1.

#### Worker Processing Rule

Current behavior:

- A worker delays a job when `job.data.whatsapp_instance_id` does not match its own instance ID.

Keep this behavior for v1.

Cases to consider:

- Worker `default` sees job for `iom-wa-2`.
- Worker `iom-wa-2` is down.
- Queue contains jobs for multiple instances.
- Job repeatedly gets picked by the wrong worker and delayed.

Known performance concern:

- If all workers share one BullMQ queue, workers can pick jobs for other instances and delay them.
- This is acceptable for v1/demo volume, but may become noisy at larger scale.

Future improvement:

- Use one queue per instance, such as `outbound-dispatch:default` and `outbound-dispatch:iom-wa-2`.
- Or add a stronger worker partitioning strategy.

#### Admin Instance Management

Implement these admin actions:

- Create instance.
- Rename instance.
- Disable instance.
- Reactivate instance.

Do not implement hard delete in v1.

API direction:

- `GET /api/admin/whatsapp/instances`
- `POST /api/admin/whatsapp/instances`
- `PATCH /api/admin/whatsapp/instances/[id]`

Create instance fields:

- `id`
- `label`
- `is_enabled`

Validation rules:

- `id` is required.
- `label` is required.
- `id` must be simple and safe for env/session path usage.
- Recommended ID pattern: lowercase letters, numbers, hyphen, underscore.
- Duplicate IDs are rejected.
- Spaces in IDs are rejected.

Cases to consider:

- Create instance before worker container exists.
- Create instance after worker is already running.
- Duplicate instance ID.
- Invalid instance ID.
- Disable default instance.
- Disable all instances.
- Reactivate instance with no worker.
- Rename instance while worker is running.
- Worker auto-upserts an instance while admin creates/updates it.

Expected behavior:

- Creating an instance only creates durable config.
- It does not start Docker.
- Dashboard should show “No live worker detected” until a matching container runs.
- Disabling all instances is allowed, but blast/API send should fail or show no eligible worker.
- Renaming affects dashboard display only, not worker identity.

#### Soft-Disable Semantics

Soft-disable should do these things:

- Exclude instance from new blast assignment.
- Exclude instance from new API notification assignment.
- Keep instance visible in dashboard.
- Keep runtime state visible if the bot is still running.
- Preserve historical outbound messages.
- Preserve tickets and contacts.

Soft-disable should not do these things:

- Stop Docker container.
- Kill Chromium.
- Destroy WhatsApp session.
- Delete QR/runtime state.
- Delete instance events.
- Reassign existing queued messages automatically.
- Reroute ticket replies to another WhatsApp account.

Race cases:

- Admin disables an instance while blast assignment is happening.
- Admin disables an instance after messages are queued.
- Admin disables an instance while worker is sending.
- Admin reactivates an instance later.
- Admin disables the only ready instance.

Recommended behavior:

- Assignment reads enabled state at the start of the request.
- Messages assigned just before disable may still send.
- New requests after disable must not use that instance.
- UI should explain: “Disable prevents new blast/API assignments. Existing queued/ticket messages may still be processed.”

#### Worker Command Guidance In Dashboard

Because admin does not start Docker, the dashboard should show operator guidance for each instance.

Show environment values:

```txt
WHATSAPP_INSTANCE_ID=<id>
WHATSAPP_INSTANCE_LABEL="<label>"
WHATSAPP_WORKER_ID=<id>-worker
```

Show Docker Compose service pattern:

```yaml
bot_<id>:
  image: iom4-bot:latest
  env_file:
    - .env.local
  environment:
    WHATSAPP_INSTANCE_ID: <id>
    WHATSAPP_INSTANCE_LABEL: <label>
    WHATSAPP_WORKER_ID: <id>-worker
    WHATSAPP_CHROMIUM_PATH: /usr/bin/chromium
  volumes:
    - bot_auth_<id>:/app/.wwebjs_auth
```

Operator mistakes to surface:

- Instance created but no matching bot container is running.
- Container started with wrong `WHATSAPP_INSTANCE_ID`.
- Two containers started with the same `WHATSAPP_INSTANCE_ID`.
- Two instances share the same auth volume.

Dashboard indicators:

- no heartbeat
- worker conflict warning
- QR required
- auth failed
- disconnected
- repeated reconnect events

#### Outbound Tracker And Dashboard Integration

The user should be able to watch worker and message status clearly.

Per-instance dashboard should show:

- instance label
- instance ID
- enabled/disabled state
- derived runtime status
- QR required state
- worker ID
- worker host
- heartbeat age
- last inbound timestamp
- last outbound timestamp
- queued ticket replies
- queued API notifications
- queued blast messages
- retrying count
- failed count
- sent count
- latest events
- worker conflict warning
- disabled warning

Outbound tracker/message list should show:

- `whatsapp_instance_id`
- instance label
- source type: blast, API, or ticket
- delivery status
- recipient
- created timestamp
- delivered timestamp
- last error

UI cases to represent:

- Disabled but ready instance: “Ready, not receiving new blast/API work.”
- Enabled but no heartbeat: “Enabled, but worker unavailable.”
- QR required instance: show QR action.
- Auth failed instance: show re-login action.
- Instance with queued messages but no live worker.
- Instance with high failed count.
- Message assigned before disable.
- Message assigned to an instance that later disconnects.

#### Performance Considerations

Avoid:

- DB lookup per recipient to find the lowest queue.
- Per-message queue count query.
- Repeated dashboard polling with large payloads.
- Loading all outbound messages without pagination.
- One-by-one inserts for very large blasts if batching is possible.

Recommended:

- Select eligible instances once per blast request.
- Read queue/load snapshot once per eligible instance.
- Assign recipients in memory.
- Use Redis for live runtime state.
- Use Supabase/Postgres for durable ledger and config.
- Keep outbound tracker payload limited and paginated.
- Keep recent outbound list limited.

Potential bottlenecks:

- Very large recipient lists.
- Shared BullMQ queue with many instance-mismatched jobs.
- Supabase insert loop per outbound message.
- Redis outage causing runtime state to be unavailable.
- Stale runtime causing ready workers to look unavailable.

Mitigation for v1:

- Use approximate distribution instead of perfect balancing.
- Limit dashboard/outbound list sizes.
- Fail clearly when no eligible instance exists.
- Do not silently assign work to unknown/stale workers.

#### Implementation Order

1. Add `is_enabled` migration and type support.
2. Update instance repository/service to include `is_enabled`.
3. Add bot session isolation by instance ID.
4. Add eligible instance helper.
5. Add batch blast assignment.
6. Add API notification assignment.
7. Verify ticket reply affinity remains unchanged.
8. Add admin create/rename/disable/reactivate APIs.
9. Update `/whatsapp` dashboard cards to show enabled/runtime/queue states.
10. Add admin controls to `/whatsapp`.
11. Update outbound tracker/list to clearly show instance label/status.
12. Add tests for assignment and disable behavior.

#### Test Cases

- Blast uses only enabled ready instances.
- Blast skips disabled instances.
- Blast skips QR-required, disconnected, stale, and conflicted instances.
- Blast distributes across multiple eligible instances.
- Blast handles no eligible instance according to chosen fallback policy.
- API notification uses a selected eligible instance.
- API notification idempotency replay does not reassign.
- Ticket reply uses the ticket's original `whatsapp_instance_id`.
- Disabled original ticket instance does not cause reply to use another instance.
- Bot auth path differs for different instance IDs.
- Admin can create an instance.
- Admin can rename an instance.
- Admin can disable an instance.
- Admin can reactivate an instance.
- Disabled instance appears on dashboard but is not selected for new blast/API messages.
- Dashboard shows worker unavailable when instance config exists but no container is running.
- Dashboard shows worker conflict when two workers use the same instance ID.

#### Definition Of Done

- Staging can run at least two bot containers with separate WhatsApp sessions.
- `/whatsapp` shows each worker separately.
- Admin can create instance configs.
- Admin can soft-disable/reactivate instance configs.
- New blast/API messages avoid disabled and non-ready instances.
- Blast distribution does not query DB per recipient.
- Ticket replies stay on the same WhatsApp instance as the original ticket.
- Outbound tracker/dashboard clearly shows which worker/instance each message belongs to.
- If only one bot is running, the system still works normally.

## Task 2: WhatsApp Blast Templates

### Goal

Allow editors to save, reuse, update, and delete WhatsApp blast message templates while keeping the existing variable system.

### Reality Check

- Current blast composer supports variables.
- Supported variables are `{{name}}`, `{{phone_number}}`, and `{{group_name}}`.
- Current system does not have saved template CRUD.
- No `blast_message_templates` table exists yet.
- Scheduling is not implemented and should be handled separately from templates.

### Implementation Tasks

- Add `blast_message_templates` table migration.
- Add type definitions for blast templates.
- Add server/API handlers for list/create/update/delete templates.
- Add template selector to `BlastComposer`.
- Add "Save as template" action.
- Add "Update selected template" action.
- Add delete template action with confirmation.
- Keep template rendering as simple variable substitution.
- Keep existing preview behavior.

### Suggested Table

Fields:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `description text`
- `content text not null`
- `created_at timestamptz not null default timezone('utc', now())`
- `updated_at timestamptz not null default timezone('utc', now())`

Optional later:

- `category text`
- `created_by text`
- `last_used_at timestamptz`

### Acceptance Criteria

- User can pick an existing template and populate the blast message field.
- User can save the current blast message as a named template.
- User can update an existing template.
- User can delete a template.
- Variables still render correctly in preview and send flow.

## Task 3: Root `/` Page

### Goal

Make the initial page production-ready and consistent with the admin product.

### Reality Check

- `/` currently looks like a starter menu page.
- Production-ready visual language is stronger in `/contacts`, `/group`, `/blastmessage`, and `/ticket`.
- Removing `/` entirely may create an awkward landing behavior unless a redirect target is chosen.

### Recommended Direction

Rework `/` into a communication command center.

It should use the same design language as the admin pages and link to:

- `/contacts`
- `/group`
- `/blastmessage`
- `/ticket`
- `/whatsapp`
- `/content-record`
- `/scrape`

### Alternative Direction

Redirect `/` to `/whatsapp` if the product owner sees `/whatsapp` as the primary operational dashboard.

### Recommendation

Do not remove `/` yet.

Rework it into a production-ready home dashboard so the demo feels like one complete product instead of separate feature pages.

### Acceptance Criteria

- `/` uses the same admin visual language as mature pages.
- `/` clearly communicates the product purpose.
- `/` routes users to all main modules.
- `/` does not look like a temporary starter page.

## Task 4: `/whatsapp` UI And Admin Controls

### Goal

Improve the operational dashboard for monitoring bot health, queue health, and outbound message delivery.

### Implementation Tasks

- Make instance cards more scannable.
- Add clear status hierarchy: Ready, QR Required, Degraded, Disconnected, Auth Failed.
- Surface queue pressure per instance.
- Add create/disable instance actions after backend support exists.
- Keep QR view easy to access.
- Keep outbound tracker visible and understandable.

### Acceptance Criteria

- Admin can quickly identify which bot needs action.
- Admin can open QR for an instance.
- Admin can see whether blast/ticket/API messages are queued or failing.

## Task 5: `/ticket` UI/UX Polish

### Goal

Make ticket handling feel like a proper helpdesk workflow.

### Implementation Tasks 

- Improve conversation readability in ticket detail.
- Improve reply status visibility for queued/sent/failed WA replies.
- Make ticket status actions clearer.
- Consider filters for Open/In Progress/Closed if not already sufficient.

### Acceptance Criteria

- Staff can read the conversation quickly.
- Staff can reply without losing context.
- Staff can identify failed outbound replies.

## Deferred Tasks

These should not block the immediate next implementation unless required by the product owner.

- PB-10 scheduled blast.
- Full pre-content asset/resource management.
- Draft content workflow.
- Content tags/categories.
- Normalized contact group schema.
- Full multi-channel performance analytics beyond WhatsApp.
