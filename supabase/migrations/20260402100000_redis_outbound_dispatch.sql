alter table public.outbound_messages
  drop constraint if exists outbound_messages_client_idempotency_unique;

drop index if exists public.outbound_messages_client_idempotency_unique;

create index if not exists outbound_messages_client_idempotency_created_at_idx
  on public.outbound_messages (client_id, idempotency_key, created_at desc);
