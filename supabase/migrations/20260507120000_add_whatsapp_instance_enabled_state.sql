alter table public.whatsapp_instances
  add column if not exists is_enabled boolean not null default true;

update public.whatsapp_instances
set is_enabled = true
where is_enabled is null;
