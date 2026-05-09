create table if not exists public.content_asset_project_tags (
  content_asset_project_id uuid not null references public.content_asset_projects(id) on delete cascade,
  tag_id uuid not null references public.content_tags(id) on delete cascade,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint content_asset_project_tags_pkey primary key (content_asset_project_id, tag_id)
);

create table if not exists public.content_asset_tags (
  content_asset_id uuid not null references public.content_assets(id) on delete cascade,
  tag_id uuid not null references public.content_tags(id) on delete cascade,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint content_asset_tags_pkey primary key (content_asset_id, tag_id)
);

create index if not exists content_asset_project_tags_tag_id_idx
  on public.content_asset_project_tags(tag_id);

create index if not exists content_asset_tags_tag_id_idx
  on public.content_asset_tags(tag_id);
