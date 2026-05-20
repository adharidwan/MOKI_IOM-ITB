drop function if exists public.list_content_recordings(text, text, text, uuid[], integer, integer, text, text);
drop function if exists public.list_content_recordings(text, text, text, text[], integer, integer, text, text);

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
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  tags jsonb,
  total_count bigint
)
language sql
stable
as $$
  with filtered as (
    select cr.*
    from public.content_recordings cr
    where
      (
        nullif(trim(coalesce(p_search, '')), '') is null
        or cr.title ilike '%' || trim(p_search) || '%'
        or cr.caption ilike '%' || trim(p_search) || '%'
        or cr.description ilike '%' || trim(p_search) || '%'
        or cr.link ilike '%' || trim(p_search) || '%'
        or cr.source_post_id ilike '%' || trim(p_search) || '%'
      )
      and (nullif(trim(coalesce(p_platform, '')), '') is null or cr.platform = trim(p_platform))
      and (nullif(trim(coalesce(p_content_type, '')), '') is null or cr.content_type = trim(p_content_type))
      and (
        p_tag_ids is null
        or cardinality(p_tag_ids) = 0
        or exists (
          select 1
          from public.content_recording_tags crt
          where crt.content_recording_id = cr.id
            and crt.tag_id = any(p_tag_ids)
        )
      )
  ),
  counted as (
    select filtered.*, count(*) over() as total_count
    from filtered
  )
  select
    counted.id,
    counted.title,
    counted.platform,
    counted.caption,
    counted.description,
    counted.content_type,
    counted.upload_date,
    counted.link,
    counted.source_post_id,
    counted.thumbnail_url,
    counted.media_urls,
    counted.created_at,
    counted.updated_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ct.id,
            'name', ct.name,
            'created_at', ct.created_at
          )
          order by ct.name
        )
        from public.content_recording_tags crt
        join public.content_tags ct on ct.id = crt.tag_id
        where crt.content_recording_id = counted.id
      ),
      '[]'::jsonb
    ) as tags,
    counted.total_count
  from counted
  order by
    case when p_sort_by = 'title' and p_sort_dir = 'asc' then counted.title end asc nulls last,
    case when p_sort_by = 'title' and p_sort_dir = 'desc' then counted.title end desc nulls last,
    case when p_sort_by = 'platform' and p_sort_dir = 'asc' then counted.platform end asc nulls last,
    case when p_sort_by = 'platform' and p_sort_dir = 'desc' then counted.platform end desc nulls last,
    case when p_sort_by = 'content_type' and p_sort_dir = 'asc' then counted.content_type end asc nulls last,
    case when p_sort_by = 'content_type' and p_sort_dir = 'desc' then counted.content_type end desc nulls last,
    case when p_sort_by = 'upload_date' and p_sort_dir = 'asc' then counted.upload_date end asc nulls last,
    case when p_sort_by = 'upload_date' and p_sort_dir = 'desc' then counted.upload_date end desc nulls last,
    case when p_sort_by = 'created_at' and p_sort_dir = 'asc' then counted.created_at end asc nulls last,
    case when p_sort_by = 'created_at' and p_sort_dir = 'desc' then counted.created_at end desc nulls last,
    case when p_sort_by = 'updated_at' and p_sort_dir = 'asc' then counted.updated_at end asc nulls last,
    case when p_sort_by = 'updated_at' and p_sort_dir = 'desc' then counted.updated_at end desc nulls last,
    counted.upload_date desc,
    counted.created_at desc
  limit greatest(1, least(100, coalesce(p_page_size, 20)))
  offset greatest(0, coalesce(p_page, 1) - 1) * greatest(1, least(100, coalesce(p_page_size, 20)));
$$;
