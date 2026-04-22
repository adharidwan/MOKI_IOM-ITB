# Sprint Review Follow-Up Plan

## Purpose

This document captures the agreed direction, decision points, and future task list after the latest sprint review discussion.

It is meant to be a working plan for the next implementation steps around:

- outbound message tracking UX
- blast message composition improvements
- contact and group management UX
- schema decisions related to those changes

## Current State Confirmed In Code

### Message tracker

- Outbound delivery visibility currently lives mainly in `/whatsapp` via `app/components/WhatsappDashboard.tsx`.
- The current delivery view is dashboard-oriented, not task-oriented.
- Users need to navigate to the page and refresh data manually for the main outbound status flow.
- SSE is already used in the repo, but only for WhatsApp QR live updates, not for outbound delivery tracking.

### Blast messaging

- Blast sending already supports three recipient sources:
  - contact groups
  - CSV upload
  - manual input
- This is implemented in `app/components/BlastComposer.tsx` and `app/api/admin/blast/route.ts`.
- Group-based blast dispatch already exists in the backend through `createGroupBlastOutboundMessages(...)`.

### Grouping model

- Contacts currently store group membership in `public.csv_contacts.group_names text[]`.
- One contact can belong to multiple groups.
- One group can contain multiple contacts.
- Therefore, the current behavior is logically many-to-many.
- However, it is not modeled as a normalized relational many-to-many schema. It is an array-based membership model.

### Outbound ledger

- `public.outbound_messages` already supports `source_type = 'blast'`.
- Delivery status already supports `queued`, `retrying`, `sent`, and `failed`.
- `whatsapp_instance_id` already exists on outbound rows.
- This is enough to support a first version of a live outbound tracker without adding a new table immediately.

## Decisions Made

These decisions were already chosen during planning:

1. Tracker UX: use a global bottom-right overlay.
2. Tracker scope: show all outbound traffic, not only blast traffic.
3. Live updates: use SSE first.
4. Blast editor: keep plain text, add variable insertion UI.
5. Variable v1: support `{{name}}`, `{{phone_number}}`, and `{{group_name}}`.
6. `{{group_name}}` behavior: if multiple groups match, join all matched groups.
7. Information architecture: add a dedicated `/group` page.

## Product And Technical Reasoning

### 1. Global outbound tracker overlay

Recommended direction:

- build a persistent bottom-right overlay similar to upload progress UIs
- keep it visible across pages
- let users collapse and expand it
- show summary counts and individual message statuses

Pros:

- much better UX than forcing the user to open `/whatsapp`
- matches the mental model of long-running background work
- works well for hundreds of messages if the detail list is filterable

Cons:

- needs shared client-side state and a stable outbound event contract
- can become noisy if it shows too much unrelated traffic without filters

Recommendation:

- implement the overlay as an all-outbound tracker with source filters: `All`, `Blast`, `Ticket Reply`, `API`

### 2. SSE for outbound live updates

Recommended direction:

- add SSE for active outbound status updates
- use polling only as a fallback if the stream disconnects or if the page is resumed after inactivity

Pros:

- fits the overlay model well
- reduces the need for repeated manual refreshes
- gives immediate feedback while a blast is being processed

Cons:

- requires a clear streaming payload shape
- requires reconnect and stale-state handling

Recommendation:

- use SSE for active updates, but keep a simple fallback path instead of making the whole tracker depend on perfect stream reliability

### 3. Blast message editor

Recommended direction:

- do not introduce a rich-text editor library in v1
- keep the current textarea model
- add helper UI to insert variables into the plain-text message

Pros:

- lower complexity
- closer to the actual WhatsApp text delivery model
- avoids formatting mismatches and editor maintenance cost

Cons:

- fewer authoring affordances than a richer editor

Recommendation:

- plain text plus variable chips or buttons is the best first step

### 4. Variables for adaptive blast content

Recommended v1 variables:

- `{{name}}`
- `{{phone_number}}`
- `{{group_name}}`

Rules:

- preview must show rendered text before send
- missing values must fall back safely and predictably
- `{{group_name}}` should join matched groups for that recipient

Suggested fallback behavior:

- `{{name}}`: fall back to empty string or a neutral generic salutation, depending on message style chosen later
- `{{phone_number}}`: always use normalized number
- `{{group_name}}`: join matched groups, for example `VIP, Orang Tua A`

Important note:

- this should remain simple substitution, not a full template language in this sprint

### 5. Contacts and groups IA

Recommended direction:

- split group-heavy workflows into a dedicated `/group` page
- keep `/contacts` focused on contact list management

Pros:

- scales better when there are many contacts and many groups
- gives a clearer mental model for operators
- makes group inspection and blast targeting more natural

Cons:

- adds one more route to the product
- some actions need to be redistributed between pages

Recommendation:

- add `/group`
- simplify `/contacts`
- make group membership browsing and blast targeting more explicit in the new page

## Database Schema Assessment

The current schema reference for this repo is `supabase/dump.sql`.

Relevant facts from the dump:

- `public.csv_contacts` has both `group_name text` and `group_names text[]`
- `public.csv_contacts.group_names` already supports multi-group membership
- `public.outbound_messages` already supports `source_type = 'blast'`
- `public.outbound_messages` already stores delivery status and timestamps needed for a tracker
- indexes already exist for `group_names`, `delivery_status`, `created_at`, and `whatsapp_instance_id`

### Should we change the schema now?

Short answer:

- not immediately for the first iteration of the planned work

Reasoning:

1. The new overlay tracker can be built from the current `outbound_messages` ledger.
2. SSE does not require a schema change by itself.
3. Variable rendering can happen at application level before queueing.
4. A `/group` page can be built on top of the existing `group_names` array model.

### Schema recommendation for this sprint

Recommended now:

- keep the current schema for the first implementation pass
- do not normalize groups yet
- do not introduce a new blast campaign table yet unless the product explicitly needs persistent batch-level history

### Schema changes that may become useful later

These are not immediate requirements, but they are the most likely next schema upgrades.

#### Option A: normalize groups

Possible future tables:

- `contact_groups`
- `contact_group_members`

Use this only if you need:

- group metadata
- group rename history
- group ownership or auditing
- better large-scale group querying and lifecycle management

Pros:

- cleaner relational model
- easier long-term management
- stronger foundation for a dedicated `/group` page

Cons:

- requires migration work and application rewrites
- not necessary for the immediate UX improvements

Recommendation:

- postpone unless group management requirements become more advanced than membership tagging

#### Option B: add batch-level outbound tracking

Possible future addition:

- a `blast_campaigns` or `outbound_batches` table
- or at minimum a dedicated batch identifier column on `outbound_messages`

Use this only if you need:

- first-class batch history
- overlay restoration by batch
- separate summary records for one send action
- campaign-level analytics or audit trail

Pros:

- better model for upload-style grouped tracking
- clearer status aggregation for one sending action

Cons:

- more schema and application complexity
- current all-outbound overlay can still be built without it

Recommendation:

- not required for the first tracker version
- reconsider if the team wants persistent batch history instead of only recent outbound rows

### Small schema cleanup worth noting

`public.csv_contacts.group_name` appears to be a legacy field now that `group_names text[]` is the real grouping model.

Recommendation:

- do not remove it immediately in the same sprint as the UX work
- verify whether any remaining code or imports still depend on it
- if not used anywhere important, remove it later in a dedicated cleanup migration and update docs accordingly

## Recommended Delivery Plan

### Phase 1: Tracker foundation

Goal:

- make outbound tracking accurate across all source types

Work:

- include `blast` consistently in outbound summaries and queue counts
- define tracker API payload shape for summary and row-level status
- add an SSE endpoint for active outbound updates

Verify:

- blast messages appear in summary counts
- status changes stream live without page refresh

### Phase 2: Global tracker overlay

Goal:

- surface sending progress everywhere in the app

Work:

- build bottom-right collapsed tracker
- allow expand/collapse
- show active counts and recent completed items
- add status filters and source filters
- design for hundreds of messages with chunking or virtualization if needed

Verify:

- user can start a blast, leave the page, and still monitor progress
- list remains readable for large message counts

### Phase 3: Blast composer variables

Goal:

- support adaptive personalized message text without overcomplicating the composer

Work:

- add variable insertion UI
- implement rendering for `{{name}}`, `{{phone_number}}`, `{{group_name}}`
- show rendered preview before send

Verify:

- preview matches what is queued for recipients
- fallbacks are deterministic

### Phase 4: Group management UX

Goal:

- make group targeting and inspection scalable

Work:

- add `/group` page
- show group counts and member previews
- allow opening a group to inspect members
- improve group selection UX inside blast flow

Verify:

- user can understand who is inside each group before sending
- user can select zero or more groups and see deduped totals

### Phase 5: Contacts page cleanup

Goal:

- make `/contacts` feel like a higher-volume admin workspace

Work:

- simplify the page once group-heavy workflows move out
- improve table/listing density and filtering
- keep contact editing and bulk actions clear

Verify:

- `/contacts` is easier to scan with large data volume

## Persistent Future Task List

### High priority

- Design global bottom-right outbound tracker overlay.
- Add SSE-backed live outbound delivery stream.
- Fix outbound summaries so `blast` is included consistently.
- Define tracker payload model for summary counts and per-message state.
- Implement filters for `queued`, `retrying`, `sent`, `failed` and source-type filters.
- Add approximate completion ETA in the tracker.
- Add variable insertion UI to blast composer.
- Implement `{{name}}`, `{{phone_number}}`, and `{{group_name}}` rendering.
- Add preview behavior and fallback rules for missing variable values.
- Build dedicated `/group` page.
- Improve blast group selection with member visibility and deduped recipient totals.
- Add tests for tracker summaries, streaming updates, variable rendering, and group selection.

### Medium priority

- Refine `/contacts` into a cleaner high-volume admin page.
- Decide whether to add search inside the tracker detail list.
- Decide whether tracker completed items should auto-hide after a time window.
- Re-evaluate whether a batch or campaign table is needed after tracker v1 ships.
- Re-evaluate whether normalized relational groups are needed after `/group` usage becomes clear.

### Low priority

- Clean up the legacy `csv_contacts.group_name` column if it is truly unused.
- Add deeper outbound analytics if product needs historical performance reporting.

## Recommended Success Criteria

1. A user can send a large blast and monitor it from anywhere in the app.
2. The tracker clearly shows how many messages are queued, sent, retrying, and failed.
3. The tracker remains readable with large message counts.
4. Blast message personalization works with simple safe variables.
5. Group targeting is understandable before send.
6. `/contacts` and `/group` each have a clearer responsibility.
7. No schema migration is introduced unless it clearly unlocks a real requirement.

## Final Recommendation

Recommended immediate path:

1. Keep the current schema for the first implementation pass.
2. Build the tracker and blast UX improvements on top of `outbound_messages` and `csv_contacts.group_names`.
3. Only introduce schema changes later if one of these becomes a real requirement:
   - first-class batch history
   - advanced group lifecycle management
   - group metadata and auditing
   - performance limitations from the current array-based grouping model

My engineering judgment:

- The current schema is good enough for the first version of the planned UX improvements.
- The biggest problems right now are UX flow and operational visibility, not missing schema primitives.
- The main schema question worth revisiting later is whether groups and blast batches should become first-class entities.
