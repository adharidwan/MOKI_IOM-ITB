# Database Schema

This document describes the intended `public` schema for the project after applying the repo migrations currently in source control:

- `supabase/migrations/20260331120000_public_whatsapp_notification_api.sql`
- `supabase/migrations/20260331130000_unified_outbound_queue_and_dispatch_controls.sql`
- `supabase/migrations/20260402100000_redis_outbound_dispatch.sql`

The pre-existing baseline was taken from:

- `supabase/schema_before_20260331120000_and_20260331130000.sql`

Important:
- The dump file above is the authoritative source for the older tables that existed before this session.
- The current repo schema is therefore: pre-migration dump + the two migrations above.
- This document focuses on table structure, relationships, constraints, and delivery-ledger semantics. It is not a full replacement for raw SQL.

## Overview

The schema currently has three logical areas:

1. Support/ticketing data
2. WhatsApp contact and outbound delivery data
3. API client and dispatch-control data

Main tables:

- `tickets`
- `replies`
- `whatsapp_contacts`
- `csv_contacts`
- `api_clients`
- `outbound_messages`
- `bot_dispatch_settings`

## Relationships

Primary data relationships:

- `replies.ticket_id -> tickets.id`
- `whatsapp_contacts.last_ticket_id -> tickets.id`
- `outbound_messages.ticket_id -> tickets.id`
- `outbound_messages.client_id -> api_clients.id`

Logical, non-FK relationships:

- For `outbound_messages.source_type = 'ticket_reply'`, `source_id` is the related `replies.id`
- For `outbound_messages.source_type = 'api_notification'`, `source_id` is an application-generated identifier derived from the API client and idempotency key

## Core Support Tables

### `tickets`

Purpose:
- top-level support ticket record
- can represent web-origin or WhatsApp-origin tickets

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `subject` | `text` | no | none | ticket title |
| `description` | `text` | yes | none | initial ticket description |
| `status` | `text` | yes | `'Open'` | app uses values like `Open`, `In Progress`, `Resolved`, `Closed` |
| `user_email` | `text` | yes | none | for non-WhatsApp/web tickets |
| `created_at` | `timestamptz` | yes | `now()` | creation timestamp |
| `channel` | `text` | yes | `'web'` | app uses `web` and `whatsapp` |
| `phone_number` | `text` | yes | none | normalized phone for WhatsApp tickets |
| `whatsapp_chat_id` | `text` | yes | none | full WhatsApp chat ID such as `628...@c.us` |
| `updated_at` | `timestamptz` | yes | `now()` | last ticket update |

Indexes:

- `tickets_channel_idx(channel)`
- `tickets_phone_number_idx(phone_number)`
- `tickets_whatsapp_chat_id_idx(whatsapp_chat_id)`

Notes:

- No check constraint for `status` or `channel` is present in the dumped baseline.
- Application code enforces the practical state set.

### `replies`

Purpose:
- ticket conversation history
- stores customer/admin replies shown by the ticket UI
- no longer the outbound queue source of truth

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `ticket_id` | `uuid` | yes | none | FK to `tickets.id` |
| `author` | `text` | no | none | display author, e.g. `Admin` or phone number |
| `content` | `text` | no | none | reply body |
| `created_at` | `timestamptz` | yes | `now()` | reply timestamp |
| `sender_type` | `text` | yes | `'admin'` | app uses `admin`, `customer`, `system` |
| `delivery_status` | `text` | yes | `'not_applicable'` | mirrored from outbound send state for admin WhatsApp replies |
| `delivery_attempts` | `integer` | yes | `0` | delivery attempts counter |
| `next_retry_at` | `timestamptz` | yes | none | next retry time |
| `last_delivery_error` | `text` | yes | none | last send failure message |
| `whatsapp_message_id` | `text` | yes | none | provider-side message identifier |
| `delivered_at` | `timestamptz` | yes | none | success timestamp |

Constraints:

- primary key on `id`
- FK `replies_ticket_id_fkey(ticket_id) -> tickets(id)` with `ON DELETE CASCADE`

Indexes:

- `replies_delivery_status_idx(delivery_status, next_retry_at)`
- `replies_ticket_created_at_idx(ticket_id, created_at)`

Notes:

- `replies` remains the UI/history record.
- For outbound ticket replies, delivery state is mirrored from the BullMQ worker back into these columns.

### `whatsapp_contacts`

Purpose:
- remembers WhatsApp-specific contact state and invalid/help-message behavior

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `phone_number` | `text` | no | none | primary key |
| `chat_id` | `text` | no | none | WhatsApp chat ID |
| `invalid_message_count` | `integer` | no | `0` | used for help-message cadence |
| `last_message_preview` | `text` | yes | none | last inbound snippet |
| `last_help_sent_at` | `timestamptz` | yes | none | last help auto-response |
| `last_inbound_at` | `timestamptz` | yes | `now()` | last inbound message time |
| `last_ticket_id` | `uuid` | yes | none | FK to `tickets.id` |
| `updated_at` | `timestamptz` | yes | `now()` | last row update |

Constraints:

- primary key on `phone_number`
- FK `whatsapp_contacts_last_ticket_id_fkey(last_ticket_id) -> tickets(id)` with `ON DELETE SET NULL`

### `csv_contacts`

Purpose:
- imported contact list data from CSV files

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `no_telp` | `text` | no | none | imported phone number |
| `nama` | `text` | no | none | imported name |
| `jenis_kelamin` | `text` | no | none | imported gender |
| `jabatan` | `text` | yes | none | imported job title |
| `source_file` | `text` | yes | none | source filename |
| `imported_at` | `timestamptz` | no | `now()` | import timestamp |
| `created_at` | `timestamptz` | no | `now()` | row creation timestamp |

Constraints and indexes:

- primary key on `id`
- unique index `idx_csv_contacts_no_telp(no_telp)`
- index `idx_csv_contacts_imported_at(imported_at)`

## API And Dispatch Tables

### `api_clients`

Purpose:
- registry of external API consumers for the public WhatsApp notification API
- stores credential material and per-client application quotas

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `name` | `text` | no | none | client display name |
| `key_prefix` | `text` | no | none | prefix embedded in raw API key |
| `key_hash` | `text` | no | none | SHA-256 hash of raw API key |
| `status` | `text` | no | `'active'` | check constraint allows `active` / `disabled` |
| `max_requests_per_minute` | `integer` | no | `60` | per-client accepted request quota |
| `max_pending_messages` | `integer` | no | `100` | per-client queued notification cap |
| `last_used_at` | `timestamptz` | yes | none | last successful auth time |
| `created_at` | `timestamptz` | no | `timezone('utc', now())` | row creation timestamp |
| `updated_at` | `timestamptz` | no | `timezone('utc', now())` | last row update |

Constraints:

- primary key on `id`
- unique `key_prefix`
- unique `key_hash`
- `status` check constraint: `active` or `disabled`

Notes:

- Raw API keys are not stored in the database.
- Quotas are enforced in application code, not in DB triggers.

### `outbound_messages`

Purpose:
- lightweight outbound delivery ledger for all WhatsApp sends
- used by both public API notifications and ticket replies

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `client_id` | `uuid` | yes | none | FK to `api_clients.id`, only for `api_notification` |
| `idempotency_key` | `text` | yes | none | only for `api_notification` |
| `request_fingerprint` | `text` | yes | none | only for `api_notification` |
| `source_type` | `text` | no | none | `api_notification` or `ticket_reply` |
| `source_id` | `text` | no | none | app-level source identifier |
| `ticket_id` | `uuid` | yes | none | FK to `tickets.id`, mainly for `ticket_reply` |
| `priority` | `smallint` | no | `100` | lower number = higher priority |
| `recipient_phone_number` | `text` | no | none | normalized phone number |
| `recipient_chat_id` | `text` | yes | none | WhatsApp chat ID once known |
| `content` | `text` | no | none | outbound text body |
| `client_reference` | `text` | yes | none | caller-side reference for API notifications |
| `delivery_status` | `text` | no | `'queued'` | `queued`, `retrying`, `sent`, `failed` |
| `delivery_attempts` | `integer` | no | `0` | retry counter |
| `next_retry_at` | `timestamptz` | yes | none | next retry time |
| `last_delivery_error` | `text` | yes | none | last failure message |
| `whatsapp_message_id` | `text` | yes | none | provider-side message identifier |
| `delivered_at` | `timestamptz` | yes | none | success timestamp |
| `created_at` | `timestamptz` | no | `timezone('utc', now())` | enqueue time |
| `updated_at` | `timestamptz` | no | `timezone('utc', now())` | last row update |

Constraints:

- primary key on `id`
- unique index: `outbound_messages_source_type_source_id_unique_idx(source_type, source_id)`
- check constraint: `source_type in ('api_notification', 'ticket_reply')`
- check constraint:
  - `api_notification` rows must have `client_id`, `idempotency_key`, and `request_fingerprint`
  - `ticket_reply` rows must have those three columns set to `NULL`

Foreign keys:

- `client_id -> api_clients.id` with `ON DELETE RESTRICT`
- `ticket_id -> tickets.id` with `ON DELETE CASCADE`

Indexes:

- `outbound_messages_delivery_status_idx(delivery_status)`
- `outbound_messages_next_retry_at_idx(next_retry_at)`
- `outbound_messages_created_at_idx(created_at)`
- `outbound_messages_client_source_created_at_idx(client_id, source_type, created_at)`
- `outbound_messages_client_source_delivery_status_idx(client_id, source_type, delivery_status)`
- `outbound_messages_client_idempotency_created_at_idx(client_id, idempotency_key, created_at desc)`

Operational notes:

- `ticket_reply` rows still carry higher priority than `api_notification` rows, but the operational priority queue now lives in Redis/BullMQ.
- The bot does not poll this table for due work anymore.
- Redis stores public API idempotency state for 24 hours, accepted-request timestamps for rate limiting, and pending counters by client/source.
- Ticket UI still reads mirrored delivery state from `replies`.

### `bot_dispatch_settings`

Purpose:
- singleton runtime control record for bot dispatch pacing

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `text` | no | `'default'` | singleton key |
| `global_messages_per_minute` | `integer` | no | `24` | dispatch rate control |
| `api_notifications_paused` | `boolean` | no | `false` | pause notifications without pausing ticket replies |
| `updated_at` | `timestamptz` | no | `timezone('utc', now())` | last settings update |

Constraints:

- primary key on `id`
- check constraint: `global_messages_per_minute > 0`

Notes:

- Intended usage is a single row with `id = 'default'`.
- The bot converts `global_messages_per_minute` into an effective minimum dispatch gap in memory.

## Enum-Like Values Used By The App

These values are enforced partly by database checks and partly by application code.

### Ticket status

Application uses:

- `Open`
- `In Progress`
- `Resolved`
- `Closed`

### Reply sender type

Application uses:

- `admin`
- `customer`
- `system`

### Reply delivery status

Application uses:

- `pending`
- `queued`
- `retrying`
- `sent`
- `failed`
- `not_applicable`

### Outbound message source type

Database-enforced:

- `api_notification`
- `ticket_reply`

### Outbound message delivery status

Database-enforced:

- `queued`
- `retrying`
- `sent`
- `failed`

## Security And Policy Notes

From the pre-migration dump:

- explicit `service_role` policies exist for:
  - `tickets`
  - `replies`
  - `whatsapp_contacts`
- `csv_contacts` has RLS enabled in the dump

Important caveat:

- The repo migrations added `api_clients`, `outbound_messages`, and `bot_dispatch_settings`, but the migrations in source control do not also define full RLS/policy setup for those tables.
- If you need an authoritative security model document, verify the live Supabase policies after applying migrations.

## Source Of Truth

For future maintenance:

- use this document as the human-readable schema reference
- use the SQL files as the authoritative implementation source
- update this file whenever a migration changes:
  - tables
  - columns
  - constraints
  - queue/control semantics
