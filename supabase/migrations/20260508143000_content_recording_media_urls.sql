alter table if exists public.content_recordings
  add column if not exists media_urls text[];

update public.content_recordings
set media_urls = array[thumbnail_url]
where media_urls is null
  and nullif(btrim(coalesce(thumbnail_url, '')), '') is not null;

drop function if exists public.list_content_recordings(
  text,
  text,
  text,
  uuid[],
  integer,
  integer,
  text,
  text
);

create or replace function public.list_content_recordings(
  p_search text default null,
  p_platform text default null,
  p_content_type text default null,
  p_tag_ids uuid[] default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort_by text default 'upload_date',
  p_sort_dir text default 'desc'
)
returns table (
  id uuid,
  display_id bigint,
  title text,
  platform text,
  caption text,
  description text,
  content_type text,
  upload_date date,
  link text,
  source_post_id text,
  thumbnail_url text,
  media_urls text[],
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
      coalesce((select array_agg(distinct tag_id) from unnest(p_tag_ids) as selected(tag_id)), '{}'::uuid[]) as tag_ids,
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
        coalesce(array_length(n.tag_ids, 1), 0) = 0
        or (
          select count(distinct crt.tag_id)
          from public.content_recording_tags crt
          where crt.content_recording_id = cr.id
            and crt.tag_id = any(n.tag_ids)
        ) = coalesce(array_length(n.tag_ids, 1), 0)
      )
      and (
        n.search is null
        or cr.id::text ilike '%' || n.search || '%'
        or cr.display_id::text = n.search
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
    r.display_id,
    r.title,
    r.platform,
    r.caption,
    r.description,
    r.content_type,
    r.upload_date,
    r.link,
    r.source_post_id,
    r.thumbnail_url,
    r.media_urls,
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
    r.display_id,
    r.title,
    r.platform,
    r.caption,
    r.description,
    r.content_type,
    r.upload_date,
    r.link,
    r.source_post_id,
    r.thumbnail_url,
    r.media_urls,
    r.created_at,
    r.updated_at,
    r.total_count,
    r.sort_position
  order by r.sort_position;
$$;
