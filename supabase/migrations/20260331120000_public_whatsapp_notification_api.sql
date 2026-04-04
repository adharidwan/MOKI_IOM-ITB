create extension if not exists pgcrypto;

create table if not exists public.api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null unique,
  key_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'disabled')),
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.api_clients(id) on delete restrict,
  idempotency_key text not null,
  request_fingerprint text not null,
  recipient_phone_number text not null,
  recipient_chat_id text,
  content text not null,
  client_reference text,
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued', 'retrying', 'sent', 'failed')),
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  next_retry_at timestamptz,
  last_delivery_error text,
  whatsapp_message_id text,
  delivered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint outbound_messages_client_idempotency_unique unique (client_id, idempotency_key)
);

create index if not exists outbound_messages_delivery_status_idx
  on public.outbound_messages (delivery_status);

create index if not exists outbound_messages_next_retry_at_idx
  on public.outbound_messages (next_retry_at);

create index if not exists outbound_messages_created_at_idx
  on public.outbound_messages (created_at);
