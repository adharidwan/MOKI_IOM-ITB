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

## Task 1: Multiple WhatsApp Bot Integration And Docker-Controlled Workers

### Goal

Support multiple WhatsApp bot instances safely, distribute new outbound blast/API traffic across available instances, and allow admins to manage instance configuration and worker lifecycle from `/whatsapp`.

The implementation should be phased. First make multi-instance message routing correct without Docker control. Then add a separate Docker orchestrator service that can start, stop, and restart bot containers for each instance.

### Current Direction

The preferred architecture is not to let the Next.js admin app talk directly to Docker. Instead, use a private internal orchestrator service.

```txt
Admin UI
  -> Next.js API
    -> Bot Orchestrator Service
      -> Docker Engine
        -> WhatsApp bot containers
```

Reason:

- Docker control is powerful and can become host-level access if exposed incorrectly.
- The frontend should never access Docker directly.
- The Next.js API should only expose limited admin actions and delegate container operations to an internal service.
- Multi-instance routing must work even if Docker orchestration is disabled or unavailable.

### Reality Check

- The database already has `whatsapp_instances`.
- `tickets`, `outbound_messages`, and `whatsapp_contacts` already include `whatsapp_instance_id`.
- Runtime state is already namespaced by instance ID in Redis.
- The bot reads `WHATSAPP_INSTANCE_ID` and `WHATSAPP_INSTANCE_LABEL` from env.
- Ticket replies already preserve the ticket's instance affinity.
- Blast and external API outbound messages still default to the hardcoded `default` instance.
- Admin `/api/admin/whatsapp/instances` is currently GET-only.
- The WhatsApp bot currently uses one `.wwebjs_auth` data path, which can conflict when multiple bot processes run.
- Admin-controlled Docker lifecycle is not implemented yet.

### Phase 1: Multi-Instance Foundation

Phase 1 makes the product correct and safe when multiple bot workers are already running.

Implementation tasks:

- Add `is_enabled boolean not null default true` to `whatsapp_instances`.
- Update instance types/repository/service to include `is_enabled`.
- Add bot session isolation by instance ID in `scripts/whatsapp-bot.js`.
- Add an eligible instance selector helper for new outbound assignments.
- Use the selector for blast outbound messages.
- Use the selector for external API outbound messages.
- Keep ticket replies routed to the ticket's existing `whatsapp_instance_id`.
- Add admin API to create WhatsApp instances.
- Add admin API to update instance label or enabled state.
- Prefer soft-disable over hard delete for demo safety.
- Add dashboard UI on `/whatsapp` to create, rename, disable, and reactivate an instance.
- Show worker command/env guidance for manually running an instance.

Acceptance criteria:

- Two bot workers can run with different `WHATSAPP_INSTANCE_ID` values without auth/session conflict.
- `/whatsapp` shows both configured and live instances.
- New blast/API outbound messages are assigned to a ready enabled instance instead of always `default`.
- Ticket replies still use the same instance that received the original ticket.
- Disabled instances are not selected for new blast/API outbound messages.
- If no eligible instance exists, blast/API send fails clearly instead of silently falling back to `default`.

### Phase 2: Docker Orchestrator Service

Phase 2 adds admin-controlled worker lifecycle management.

The orchestrator is a separate internal service responsible for Docker operations. The admin app calls it through controlled backend APIs.

Admin actions:

- Create instance config.
- Start worker container for an instance.
- Stop worker container for an instance.
- Restart worker container for an instance.
- Disable instance for new blast/API assignments.
- Reactivate instance for new blast/API assignments.
- View worker/container state.

Important separation:

- Disable means the instance stays visible and logged in but does not receive new blast/API assignments.
- Stop means the worker container is stopped.
- Restart means the worker container is recreated or restarted while preserving the auth volume.
- Delete is not part of v1.

The orchestrator should be internal-only and should not be publicly reachable.

### Docker Orchestrator Responsibilities

The orchestrator should do only a small set of explicit operations:

- Create a bot container for a given instance ID and label.
- Start an existing bot container.
- Stop an existing bot container.
- Restart an existing bot container.
- Inspect container status for dashboard display.
- Ensure each instance uses a unique auth volume.
- Prevent two containers from being started for the same `WHATSAPP_INSTANCE_ID`.

The orchestrator should not decide message routing. Routing remains owned by the application selector and `whatsapp_instances.is_enabled`.

### Docker Worker Contract

Each spawned bot worker needs unique identity and storage:

```txt
WHATSAPP_INSTANCE_ID=<id>
WHATSAPP_INSTANCE_LABEL="<label>"
WHATSAPP_WORKER_ID=<id>-worker
```

Each spawned bot worker needs shared infrastructure env:

```txt
SUPABASE_URL=<shared>
SUPABASE_SERVICE_ROLE_KEY=<shared>
REDIS_URL=<shared>
WHATSAPP_CHROMIUM_PATH=/usr/bin/chromium
```

Each spawned bot worker needs a unique auth volume:

```txt
bot_auth_<id>:/app/.wwebjs_auth
```

The bot script should also use instance-specific LocalAuth configuration so auth isolation does not depend only on Docker volume naming.

Example generated container/service intent:

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

### Security Rules For Docker Control

- Do not expose the Docker socket to the browser.
- Do not put Docker control directly in client components.
- Prefer a separate private orchestrator service over direct Docker access from Next.js.
- Authenticate all admin APIs before calling the orchestrator.
- Validate instance IDs before using them in container names, volume names, env vars, or paths.
- Allowed instance ID pattern: lowercase letters, numbers, hyphen, and underscore.
- Reject spaces, slashes, path traversal, shell metacharacters, and duplicate IDs.
- Keep orchestrator operations allowlisted; do not expose arbitrary Docker command execution.
- Log all start/stop/restart actions.

### Data Model

Add disabled state:

```sql
alter table whatsapp_instances
add column if not exists is_enabled boolean not null default true;
```

Recommendation: use `is_enabled` instead of overloading runtime status.

Reason:

- `is_enabled` represents admin availability for new assignments.
- Runtime status represents whether the worker is alive, ready, disconnected, QR-required, degraded, or failed.
- A disabled instance can still be running and ready.

Optional later fields for Docker orchestration:

- `container_name text`
- `desired_state text` such as `running` or `stopped`
- `last_started_at timestamptz`
- `last_stopped_at timestamptz`

For v1, derive Docker state from the orchestrator instead of adding these fields unless persistence is needed.

### Eligible Instance Selection

New blast/API outbound messages should only go to eligible instances.

An instance is eligible when:

- `whatsapp_instances.is_enabled = true`
- runtime exists in Redis
- derived status is `ready`
- heartbeat is not stale
- no worker conflict is detected

An instance is not eligible when:

- disabled by admin
- QR required
- disconnected
- auth failed
- degraded
- no heartbeat
- stale heartbeat
- worker conflict exists

Fallback policy:

- Use production-strict behavior for v1.
- Reject blast/API send when no eligible instance exists.
- Do not silently use `default`.
- Show clear UI/API error text such as `No ready enabled WhatsApp instance is available`.

### Blast Distribution

Recommended blast flow:

- Resolve all recipients.
- Load eligible instances once.
- Load queue/load snapshot once per eligible instance.
- Assign recipients to instances in memory.
- Insert outbound rows with selected `whatsapp_instance_id`.
- Enqueue dispatch jobs after outbound rows are created.

Distribution policy:

- Minimum v1: balanced round-robin among eligible instances.
- Better v1: weighted round-robin using current pending counts.

Important rules:

- Do not query the database per recipient to find the lowest queue.
- Once a message is assigned to an instance, do not automatically rebalance it to another instance.
- Existing queued messages should not move when an instance is disabled.

### API Notification Distribution

Recommended flow:

- Check idempotency first.
- If an existing idempotent outbound message exists, reuse it and do not reassign.
- Load eligible instances.
- Pick one eligible instance using a lightweight selector.
- Insert outbound row with selected `whatsapp_instance_id`.

Recommended selector for first implementation:

- Load eligible instances from database plus Redis runtime state.
- Sort instances deterministically.
- Use queue/load snapshot or simple round-robin.
- Add Redis round-robin pointer later if API traffic is high.

### Ticketing Instance Affinity

Ticket replies must use the same WhatsApp instance that received the original customer message.

Current behavior to preserve:

- Ticket creation stores `whatsapp_instance_id`.
- Ticket reply queues outbound with the ticket's `whatsapp_instance_id`.

Soft-disable rule for ticketing:

- Soft-disable blocks new blast/API assignment only.
- Soft-disable must not reroute existing ticket conversations to another WhatsApp account.
- If the original instance is down, the reply should remain queued, retrying, or failed according to existing delivery logic.

### Worker Processing Rule

Keep the current v1 worker behavior:

- A worker delays a job when `job.data.whatsapp_instance_id` does not match its own instance ID.

Known limitation:

- If all workers share one BullMQ queue, workers can pick jobs for other instances and delay them.
- This is acceptable for v1/demo volume.

Future improvement:

- Use one queue per instance, such as `outbound-dispatch:default` and `outbound-dispatch:iom-wa-2`.
- Or add stronger worker partitioning.

### Admin APIs

Phase 1 APIs:

- `GET /api/admin/whatsapp/instances`
- `POST /api/admin/whatsapp/instances`
- `PATCH /api/admin/whatsapp/instances/[id]`

Phase 2 APIs:

- `POST /api/admin/whatsapp/instances/[id]/start`
- `POST /api/admin/whatsapp/instances/[id]/stop`
- `POST /api/admin/whatsapp/instances/[id]/restart`
- `GET /api/admin/whatsapp/instances/[id]/container`

Create instance fields:

- `id`
- `label`
- `is_enabled`

Update instance fields:

- `label`
- `is_enabled`

Validation rules:

- `id` is required.
- `label` is required.
- `id` must be safe for env/session path/container/volume usage.
- Duplicate IDs are rejected.
- Spaces in IDs are rejected.
- Hard delete is not implemented in v1.

### `/whatsapp` Dashboard UI

The dashboard should support both phases.

Phase 1 UI:

- Show instance label.
- Show instance ID.
- Show enabled/disabled state.
- Show derived runtime status.
- Show QR required state.
- Show worker ID.
- Show worker host.
- Show heartbeat age.
- Show queued ticket replies.
- Show queued API notifications.
- Show queued blast messages.
- Show retrying, failed, and sent counts.
- Create instance.
- Rename instance.
- Disable instance.
- Reactivate instance.
- Show manual worker env/command guidance.

Phase 2 UI:

- Start worker container.
- Stop worker container.
- Restart worker container.
- Show Docker/container state.
- Show warning when instance config exists but no matching container is running.
- Show warning when a container is running with the wrong instance ID.
- Show warning when duplicate workers are detected for one instance.

UI copy for soft-disable:

```txt
Disable prevents new blast/API assignments. Existing queued messages and ticket replies may still be processed by this instance.
```

### Soft-Disable Semantics

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

### Implementation Order

1. Add `is_enabled` migration and type support.
2. Update instance repository/service to include `is_enabled`.
3. Add bot session isolation by instance ID.
4. Add eligible instance helper.
5. Add batch blast assignment.
6. Add API notification assignment.
7. Verify ticket reply affinity remains unchanged.
8. Add admin create/rename/disable/reactivate APIs.
9. Update `/whatsapp` dashboard cards to show enabled/runtime/queue states.
10. Add admin controls to `/whatsapp` for create, rename, disable, and reactivate.
11. Update outbound tracker/list to clearly show instance label/status.
12. Add tests for assignment and disable behavior.
13. Add private Docker orchestrator service skeleton.
14. Add orchestrator Docker inspect/start/stop/restart operations.
15. Add Next.js API routes that call the orchestrator.
16. Add `/whatsapp` start/stop/restart controls.
17. Add security validation and audit logging for container lifecycle actions.
18. Test two dynamically spawned bot containers with separate sessions.

### Test Cases

- Blast uses only enabled ready instances.
- Blast skips disabled instances.
- Blast skips QR-required, disconnected, stale, and conflicted instances.
- Blast distributes across multiple eligible instances.
- Blast fails clearly when no eligible instance exists.
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
- Orchestrator can start a worker for an instance.
- Orchestrator can stop a worker without deleting auth/session data.
- Orchestrator can restart a worker and preserve the auth volume.
- Orchestrator rejects invalid instance IDs.
- Orchestrator prevents duplicate containers for the same instance ID.

### Definition Of Done

- Staging can run at least two bot containers with separate WhatsApp sessions.
- `/whatsapp` shows each worker separately.
- Admin can create instance configs.
- Admin can soft-disable/reactivate instance configs.
- New blast/API messages avoid disabled and non-ready instances.
- Blast distribution does not query DB per recipient.
- Ticket replies stay on the same WhatsApp instance as the original ticket.
- Outbound tracker/dashboard clearly shows which worker/instance each message belongs to.
- If only one bot is running, the system still works normally.
- Admin can start, stop, and restart a bot worker through the dashboard after Phase 2 is implemented.
- Docker orchestration is isolated behind a private service with strict allowlisted operations.

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
