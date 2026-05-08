alter table public.whatsapp_instances
  add column if not exists retired_at timestamptz;
