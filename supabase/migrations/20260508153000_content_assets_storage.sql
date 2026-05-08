insert into storage.buckets (id, name, public, file_size_limit)
values (
  'content-assets',
  'content-assets',
  false,
  104857600
)
on conflict (id) do update
set
  file_size_limit = excluded.file_size_limit;

create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  uploader text not null,
  uploader_email text,
  project_name text not null,
  original_filename text not null,
  storage_bucket text not null default 'content-assets',
  storage_path text not null,
  mime_type text not null,
  file_size bigint not null default 0,
  notes text
);

create unique index if not exists content_assets_storage_object_key
  on public.content_assets (storage_bucket, storage_path);

create index if not exists content_assets_created_at_idx
  on public.content_assets (created_at desc);

create index if not exists content_assets_project_name_idx
  on public.content_assets (project_name);

create index if not exists content_assets_uploader_idx
  on public.content_assets (uploader);
