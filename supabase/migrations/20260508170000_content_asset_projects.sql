create table if not exists public.content_asset_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by text not null,
  created_by_email text,
  project_name text not null,
  notes text
);

create unique index if not exists content_asset_projects_project_name_key
  on public.content_asset_projects (project_name);

create index if not exists content_asset_projects_created_at_idx
  on public.content_asset_projects (created_at desc);

alter table public.content_assets
  add column if not exists project_id uuid references public.content_asset_projects(id) on delete set null;

insert into public.content_asset_projects (created_by, created_by_email, project_name, notes, created_at, updated_at)
select
  coalesce(nullif(trim(min(uploader)), ''), 'Unknown') as created_by,
  max(uploader_email) as created_by_email,
  project_name,
  max(notes) as notes,
  min(created_at) as created_at,
  max(updated_at) as updated_at
from public.content_assets
where project_name is not null and trim(project_name) <> ''
group by project_name
on conflict (project_name) do nothing;

update public.content_assets asset
set project_id = project.id
from public.content_asset_projects project
where asset.project_id is null
  and asset.project_name = project.project_name;

create index if not exists content_assets_project_id_idx
  on public.content_assets (project_id);
