create table if not exists public.blast_message_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint blast_message_templates_title_check check (length(trim(title)) between 1 and 120),
  constraint blast_message_templates_content_check check (length(trim(content)) between 1 and 4096)
);

create index if not exists blast_message_templates_created_at_idx
  on public.blast_message_templates (created_at desc)
  where deleted_at is null;

create index if not exists blast_message_templates_title_idx
  on public.blast_message_templates (lower(title))
  where deleted_at is null;

alter table public.blast_message_templates enable row level security;

grant all on table public.blast_message_templates to anon;
grant all on table public.blast_message_templates to authenticated;
grant all on table public.blast_message_templates to service_role;
