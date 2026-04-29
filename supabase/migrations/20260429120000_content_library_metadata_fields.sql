alter table if exists public.content_recordings
  add column if not exists caption text,
  add column if not exists description text,
  add column if not exists content_type text;

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.content_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists content_tags_name_lower_idx
  on public.content_tags (lower(btrim(name)));

create table if not exists public.content_recording_tags (
  content_recording_id uuid not null references public.content_recordings(id) on delete cascade,
  tag_id uuid not null references public.content_tags(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (content_recording_id, tag_id)
);

create index if not exists content_recordings_platform_idx
  on public.content_recordings (platform);

create index if not exists content_recordings_content_type_idx
  on public.content_recordings (content_type);

create index if not exists content_recordings_upload_date_idx
  on public.content_recordings (upload_date desc);

create index if not exists content_recordings_created_at_idx
  on public.content_recordings (created_at desc);

create index if not exists content_recordings_title_trgm_idx
  on public.content_recordings using gin (title extensions.gin_trgm_ops);

create index if not exists content_recordings_caption_trgm_idx
  on public.content_recordings using gin (caption extensions.gin_trgm_ops);

create index if not exists content_recordings_description_trgm_idx
  on public.content_recordings using gin (description extensions.gin_trgm_ops);

create index if not exists content_recordings_link_trgm_idx
  on public.content_recordings using gin (link extensions.gin_trgm_ops);

create index if not exists content_recording_tags_tag_id_idx
  on public.content_recording_tags (tag_id, content_recording_id);

create or replace function public.ensure_content_tag(p_name text)
returns table (id uuid, name text, created_at timestamptz)
language plpgsql
as $$
declare
  normalized_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
begin
  if normalized_name is null then
    raise exception 'Tag name is required.';
  end if;

  return query
  select ct.id, ct.name, ct.created_at
  from public.content_tags ct
  where lower(btrim(ct.name)) = lower(normalized_name)
  limit 1;

  if found then
    return;
  end if;

  begin
    return query
    insert into public.content_tags (name)
    values (normalized_name)
    returning content_tags.id, content_tags.name, content_tags.created_at;
  exception when unique_violation then
    return query
    select ct.id, ct.name, ct.created_at
    from public.content_tags ct
    where lower(btrim(ct.name)) = lower(normalized_name)
    limit 1;
  end;
end;
$$;

create or replace function public.get_content_recordings_overview()
returns table (
  total_records bigint,
  platform_count bigint,
  this_month_count bigint,
  untagged_count bigint
)
language sql
stable
as $$
  select
    count(*) as total_records,
    count(distinct platform) filter (where platform is not null and platform <> '') as platform_count,
    count(*) filter (where upload_date >= date_trunc('month', timezone('utc', now()))::date) as this_month_count,
    count(*) filter (
      where not exists (
        select 1
        from public.content_recording_tags crt
        where crt.content_recording_id = cr.id
      )
    ) as untagged_count
  from public.content_recordings cr;
$$;

create or replace function public.list_content_recordings(
  p_search text default null,
  p_platform text default null,
  p_content_type text default null,
  p_tag_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort_by text default 'upload_date',
  p_sort_dir text default 'desc'
)
returns table (
  id uuid,
  title text,
  platform text,
  caption text,
  description text,
  content_type text,
  upload_date date,
  link text,
  source_post_id text,
  thumbnail_url text,
  created_at timestamptz,
  updated_at timestamptz,
  tags jsonb,
  total_count bigint
)
language sql
stable
as $$
  with normalized as (
    select
      nullif(btrim(p_search), '') as search,
      nullif(btrim(p_platform), '') as platform,
      nullif(btrim(p_content_type), '') as content_type,
      greatest(coalesce(p_page, 1), 1) as page,
      least(greatest(coalesce(p_page_size, 20), 1), 100) as page_size,
      case when p_sort_by in ('title', 'platform', 'content_type', 'upload_date', 'created_at', 'updated_at') then p_sort_by else 'upload_date' end as sort_by,
      case when lower(coalesce(p_sort_dir, 'desc')) = 'asc' then 'asc' else 'desc' end as sort_dir
  ),
  filtered as (
    select cr.*
    from public.content_recordings cr
    cross join normalized n
    where (n.platform is null or cr.platform = n.platform)
      and (n.content_type is null or cr.content_type = n.content_type)
      and (
        p_tag_id is null or exists (
          select 1
          from public.content_recording_tags crt
          where crt.content_recording_id = cr.id
            and crt.tag_id = p_tag_id
        )
      )
      and (
        n.search is null
        or cr.title ilike '%' || n.search || '%'
        or coalesce(cr.caption, '') ilike '%' || n.search || '%'
        or coalesce(cr.description, '') ilike '%' || n.search || '%'
        or cr.link ilike '%' || n.search || '%'
        or coalesce(cr.source_post_id, '') ilike '%' || n.search || '%'
      )
  ),
  ranked as (
    select
      f.*,
      count(*) over() as total_count,
      row_number() over (
        order by
          case when n.sort_by = 'title' and n.sort_dir = 'asc' then f.title end asc nulls last,
          case when n.sort_by = 'title' and n.sort_dir = 'desc' then f.title end desc nulls last,
          case when n.sort_by = 'platform' and n.sort_dir = 'asc' then f.platform end asc nulls last,
          case when n.sort_by = 'platform' and n.sort_dir = 'desc' then f.platform end desc nulls last,
          case when n.sort_by = 'content_type' and n.sort_dir = 'asc' then f.content_type end asc nulls last,
          case when n.sort_by = 'content_type' and n.sort_dir = 'desc' then f.content_type end desc nulls last,
          case when n.sort_by = 'upload_date' and n.sort_dir = 'asc' then f.upload_date end asc nulls last,
          case when n.sort_by = 'upload_date' and n.sort_dir = 'desc' then f.upload_date end desc nulls last,
          case when n.sort_by = 'created_at' and n.sort_dir = 'asc' then f.created_at end asc nulls last,
          case when n.sort_by = 'created_at' and n.sort_dir = 'desc' then f.created_at end desc nulls last,
          case when n.sort_by = 'updated_at' and n.sort_dir = 'asc' then f.updated_at end asc nulls last,
          case when n.sort_by = 'updated_at' and n.sort_dir = 'desc' then f.updated_at end desc nulls last,
          f.created_at desc,
          f.id desc
      ) as sort_position
    from filtered f
    cross join normalized n
    order by
      case when n.sort_by = 'title' and n.sort_dir = 'asc' then f.title end asc nulls last,
      case when n.sort_by = 'title' and n.sort_dir = 'desc' then f.title end desc nulls last,
      case when n.sort_by = 'platform' and n.sort_dir = 'asc' then f.platform end asc nulls last,
      case when n.sort_by = 'platform' and n.sort_dir = 'desc' then f.platform end desc nulls last,
      case when n.sort_by = 'content_type' and n.sort_dir = 'asc' then f.content_type end asc nulls last,
      case when n.sort_by = 'content_type' and n.sort_dir = 'desc' then f.content_type end desc nulls last,
      case when n.sort_by = 'upload_date' and n.sort_dir = 'asc' then f.upload_date end asc nulls last,
      case when n.sort_by = 'upload_date' and n.sort_dir = 'desc' then f.upload_date end desc nulls last,
      case when n.sort_by = 'created_at' and n.sort_dir = 'asc' then f.created_at end asc nulls last,
      case when n.sort_by = 'created_at' and n.sort_dir = 'desc' then f.created_at end desc nulls last,
      case when n.sort_by = 'updated_at' and n.sort_dir = 'asc' then f.updated_at end asc nulls last,
      case when n.sort_by = 'updated_at' and n.sort_dir = 'desc' then f.updated_at end desc nulls last,
      f.created_at desc,
      f.id desc
    limit (select page_size from normalized)
    offset (select (page - 1) * page_size from normalized)
  )
  select
    r.id,
    r.title,
    r.platform,
    r.caption,
    r.description,
    r.content_type,
    r.upload_date,
    r.link,
    r.source_post_id,
    r.thumbnail_url,
    r.created_at,
    r.updated_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object('id', ct.id, 'name', ct.name)
        order by lower(ct.name), ct.name
      ) filter (where ct.id is not null),
      '[]'::jsonb
    ) as tags,
    r.total_count
  from ranked r
  left join public.content_recording_tags crt on crt.content_recording_id = r.id
  left join public.content_tags ct on ct.id = crt.tag_id
  group by
    r.id,
    r.title,
    r.platform,
    r.caption,
    r.description,
    r.content_type,
    r.upload_date,
    r.link,
    r.source_post_id,
    r.thumbnail_url,
    r.created_at,
    r.updated_at,
    r.total_count,
    r.sort_position
  order by r.sort_position;
$$;
