create table if not exists public.scheduled_blasts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message_template text not null,
  source_type text not null check (source_type in ('manual', 'csv', 'contact', 'group')),
  source_config jsonb not null default '{}'::jsonb,
  schedule_type text not null check (schedule_type in ('once', 'recurring')),
  recurrence_type text check (recurrence_type in ('daily', 'weekly', 'monthly')),
  timezone text not null default 'Asia/Jakarta',
  run_at timestamptz,
  next_run_at timestamptz,
  last_run_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  save_to_group boolean not null default false,
  save_group_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint scheduled_blasts_once_run_at_check check (
    (schedule_type = 'once' and run_at is not null and recurrence_type is null)
    or
    (schedule_type = 'recurring' and recurrence_type is not null)
  ),
  constraint scheduled_blasts_save_group_name_check check (
    (save_to_group = false)
    or
    (save_to_group = true and save_group_name is not null and length(trim(save_group_name)) > 0)
  )
);

create table if not exists public.scheduled_blast_recipients (
  id uuid primary key default gen_random_uuid(),
  scheduled_blast_id uuid not null references public.scheduled_blasts(id) on delete cascade,
  recipient_phone_number text not null,
  recipient_name text,
  recipient_group_names text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  unique (scheduled_blast_id, recipient_phone_number)
);

create table if not exists public.scheduled_blast_runs (
  id uuid primary key default gen_random_uuid(),
  scheduled_blast_id uuid not null references public.scheduled_blasts(id) on delete cascade,
  scheduled_for timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'queued', 'partial', 'failed', 'skipped')),
  batch_id text,
  total_recipients integer not null default 0 check (total_recipients >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  tracked_message_ids text[] not null default '{}'::text[],
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists scheduled_blasts_due_idx
  on public.scheduled_blasts (status, next_run_at)
  where deleted_at is null;

create index if not exists scheduled_blasts_created_at_idx
  on public.scheduled_blasts (created_at desc);

create index if not exists scheduled_blast_recipients_blast_id_idx
  on public.scheduled_blast_recipients (scheduled_blast_id);

create index if not exists scheduled_blast_runs_blast_created_at_idx
  on public.scheduled_blast_runs (scheduled_blast_id, created_at desc);

alter table public.scheduled_blasts enable row level security;
alter table public.scheduled_blast_recipients enable row level security;
alter table public.scheduled_blast_runs enable row level security;

grant all on table public.scheduled_blasts to anon;
grant all on table public.scheduled_blasts to authenticated;
grant all on table public.scheduled_blasts to service_role;

grant all on table public.scheduled_blast_recipients to anon;
grant all on table public.scheduled_blast_recipients to authenticated;
grant all on table public.scheduled_blast_recipients to service_role;

grant all on table public.scheduled_blast_runs to anon;
grant all on table public.scheduled_blast_runs to authenticated;
grant all on table public.scheduled_blast_runs to service_role;
