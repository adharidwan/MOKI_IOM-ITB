alter table public.outbound_messages
  drop constraint if exists outbound_messages_source_type_check;

alter table public.outbound_messages
  add constraint outbound_messages_source_type_check
  check (source_type in ('api_notification', 'ticket_reply', 'blast'));

alter table public.outbound_messages
  drop constraint if exists outbound_messages_api_notification_client_check;

alter table public.outbound_messages
  add constraint outbound_messages_api_notification_client_check
  check (
    (source_type = 'api_notification' and client_id is not null and idempotency_key is not null and request_fingerprint is not null)
    or
    (source_type = 'ticket_reply' and client_id is null and idempotency_key is null and request_fingerprint is null)
    or
    (source_type = 'blast' and client_id is null and idempotency_key is null and request_fingerprint is null)
  );