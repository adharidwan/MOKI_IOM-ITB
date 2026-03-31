alter table public.api_clients
  add column if not exists max_requests_per_minute integer not null default 60,
  add column if not exists max_pending_messages integer not null default 100;

alter table public.outbound_messages
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists ticket_id uuid references public.tickets(id) on delete cascade,
  add column if not exists priority smallint not null default 100;

update public.outbound_messages
set source_type = 'api_notification'
where source_type is null;

update public.outbound_messages
set source_id = concat(
  'api:',
  coalesce(client_id::text, 'unknown'),
  ':',
  coalesce(idempotency_key, id::text)
)
where source_id is null;

alter table public.outbound_messages
  alter column client_id drop not null,
  alter column idempotency_key drop not null,
  alter column request_fingerprint drop not null,
  alter column source_type set not null,
  alter column source_id set not null;

alter table public.outbound_messages
  drop constraint if exists outbound_messages_source_type_check;

alter table public.outbound_messages
  add constraint outbound_messages_source_type_check
  check (source_type in ('api_notification', 'ticket_reply'));

alter table public.outbound_messages
  drop constraint if exists outbound_messages_api_notification_client_check;

alter table public.outbound_messages
  add constraint outbound_messages_api_notification_client_check
  check (
    (source_type = 'api_notification' and client_id is not null and idempotency_key is not null and request_fingerprint is not null)
    or
    (source_type = 'ticket_reply' and client_id is null and idempotency_key is null and request_fingerprint is null)
  );

create unique index if not exists outbound_messages_source_type_source_id_unique_idx
  on public.outbound_messages (source_type, source_id);

create index if not exists outbound_messages_due_work_idx
  on public.outbound_messages (delivery_status, next_retry_at, priority, created_at);

create index if not exists outbound_messages_client_source_created_at_idx
  on public.outbound_messages (client_id, source_type, created_at);

create index if not exists outbound_messages_client_source_delivery_status_idx
  on public.outbound_messages (client_id, source_type, delivery_status);

create table if not exists public.bot_dispatch_settings (
  id text primary key default 'default',
  global_messages_per_minute integer not null default 24 check (global_messages_per_minute > 0),
  api_notifications_paused boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.bot_dispatch_settings (id, global_messages_per_minute, api_notifications_paused)
values ('default', 24, false)
on conflict (id) do nothing;
