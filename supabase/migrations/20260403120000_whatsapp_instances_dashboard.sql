create table if not exists public.whatsapp_instances (
  id text primary key,
  label text not null,
  status text not null check (
    status in (
      'starting',
      'qr_required',
      'connecting',
      'ready',
      'degraded',
      'disconnected',
      'auth_failed'
    )
  ),
  last_known_phone_number text,
  last_known_chat_id text,
  last_ready_at timestamptz,
  last_qr_at timestamptz,
  last_disconnect_at timestamptz,
  last_error text,
  assigned_worker_id text,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.whatsapp_instances (
  id,
  label,
  status,
  updated_at
)
values (
  'default',
  'Primary WhatsApp',
  'starting',
  timezone('utc', now())
)
on conflict (id) do nothing;

create table if not exists public.whatsapp_instance_events (
  id uuid primary key default gen_random_uuid(),
  whatsapp_instance_id text not null references public.whatsapp_instances(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'qr_issued',
      'ready',
      'disconnected',
      'auth_failed',
      'worker_stale',
      'reconnect_started'
    )
  ),
  message text,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists whatsapp_instance_events_instance_created_at_idx
  on public.whatsapp_instance_events (whatsapp_instance_id, created_at desc);

alter table public.tickets
  add column if not exists whatsapp_instance_id text;

update public.tickets
set whatsapp_instance_id = 'default'
where channel = 'whatsapp'
  and whatsapp_instance_id is null;

alter table public.tickets
  drop constraint if exists tickets_whatsapp_instance_id_fkey;

alter table public.tickets
  add constraint tickets_whatsapp_instance_id_fkey
  foreign key (whatsapp_instance_id) references public.whatsapp_instances(id) on delete set null;

create index if not exists tickets_whatsapp_instance_id_idx
  on public.tickets (whatsapp_instance_id);

alter table public.outbound_messages
  add column if not exists whatsapp_instance_id text;

update public.outbound_messages
set whatsapp_instance_id = 'default'
where whatsapp_instance_id is null;

alter table public.outbound_messages
  alter column whatsapp_instance_id set not null;

alter table public.outbound_messages
  drop constraint if exists outbound_messages_whatsapp_instance_id_fkey;

alter table public.outbound_messages
  add constraint outbound_messages_whatsapp_instance_id_fkey
  foreign key (whatsapp_instance_id) references public.whatsapp_instances(id) on delete restrict;

create index if not exists outbound_messages_whatsapp_instance_id_idx
  on public.outbound_messages (whatsapp_instance_id);

create index if not exists outbound_messages_instance_status_created_at_idx
  on public.outbound_messages (whatsapp_instance_id, delivery_status, created_at);

alter table public.whatsapp_contacts
  add column if not exists whatsapp_instance_id text;

update public.whatsapp_contacts
set whatsapp_instance_id = 'default'
where whatsapp_instance_id is null;

alter table public.whatsapp_contacts
  alter column whatsapp_instance_id set not null;

alter table public.whatsapp_contacts
  drop constraint if exists whatsapp_contacts_whatsapp_instance_id_fkey;

alter table public.whatsapp_contacts
  add constraint whatsapp_contacts_whatsapp_instance_id_fkey
  foreign key (whatsapp_instance_id) references public.whatsapp_instances(id) on delete cascade;

alter table public.whatsapp_contacts
  drop constraint if exists whatsapp_contacts_pkey;

alter table public.whatsapp_contacts
  add constraint whatsapp_contacts_pkey primary key (whatsapp_instance_id, phone_number);

create index if not exists whatsapp_contacts_phone_number_idx
  on public.whatsapp_contacts (phone_number);
