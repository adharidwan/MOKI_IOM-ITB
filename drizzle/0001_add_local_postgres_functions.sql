CREATE OR REPLACE FUNCTION public.add_csv_contact_groups(
  p_contact_ids uuid[],
  p_group_names text[]
) RETURNS integer
LANGUAGE sql
AS $$
  with normalized_input as (
    select distinct btrim(group_name) as trimmed_group_name
    from unnest(coalesce(p_group_names, '{}'::text[])) as group_name
    where btrim(group_name) <> ''
  ),
  normalized_groups as (
    select coalesce(
      array_agg(trimmed_group_name order by lower(trimmed_group_name), trimmed_group_name),
      '{}'::text[]
    ) as group_names
    from normalized_input
  ),
  updated_contacts as (
    update public.csv_contacts as contact
    set group_names = coalesce(
      (
        select array_agg(merged_group_name order by lower(merged_group_name), merged_group_name)
        from (
          select distinct btrim(group_name) as merged_group_name
          from unnest(coalesce(contact.group_names, '{}'::text[]) || normalized_groups.group_names) as group_name
          where btrim(group_name) <> ''
        ) merged_groups
      ),
      '{}'::text[]
    )
    from normalized_groups
    where contact.id = any(coalesce(p_contact_ids, '{}'::uuid[]))
      and cardinality(normalized_groups.group_names) > 0
    returning 1
  )
  select count(*)::integer
  from updated_contacts;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.ensure_content_tag(
  p_name text
) RETURNS TABLE(id uuid, name text, created_at timestamp with time zone)
LANGUAGE plpgsql
AS $$
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_content_recordings_overview()
RETURNS TABLE(
  total_records bigint,
  platform_count bigint,
  this_month_count bigint,
  untagged_count bigint
)
LANGUAGE sql STABLE
AS $$
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.list_content_recordings(
  p_search text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_content_type text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_sort_by text DEFAULT 'upload_date',
  p_sort_dir text DEFAULT 'desc'
) RETURNS TABLE(
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
LANGUAGE sql STABLE
AS $$
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.list_csv_contacts(
  p_search text DEFAULT NULL,
  p_group_name text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_sort_by text DEFAULT 'imported_at',
  p_sort_dir text DEFAULT 'desc'
) RETURNS TABLE(
  id uuid,
  no_telp text,
  nama text,
  jenis_kelamin text,
  jabatan text,
  group_names text[],
  source_file text,
  imported_at timestamp with time zone,
  created_at timestamp with time zone,
  total_count bigint
)
LANGUAGE sql STABLE
AS $$
  with filtered_contacts as (
    select
      contact.id,
      contact.no_telp,
      contact.nama,
      contact.jenis_kelamin,
      contact.jabatan,
      coalesce(contact.group_names, '{}'::text[]) as group_names,
      contact.source_file,
      contact.imported_at,
      contact.created_at
    from public.csv_contacts as contact
    where
      (
        p_search is null
        or p_search = ''
        or contact.no_telp ilike '%' || p_search || '%'
        or contact.nama ilike '%' || p_search || '%'
        or coalesce(contact.jabatan, '') ilike '%' || p_search || '%'
      )
      and (
        p_group_name is null
        or p_group_name = ''
        or coalesce(contact.group_names, '{}'::text[]) @> array[p_group_name]::text[]
      )
  ),
  ordered as (
    select
      filtered_contacts.*,
      count(*) over() as total_count
    from filtered_contacts
    order by
      case when coalesce(lower(p_sort_by), 'imported_at') = 'nama' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then lower(filtered_contacts.nama) end asc,
      case when coalesce(lower(p_sort_by), 'imported_at') = 'nama' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then lower(filtered_contacts.nama) end desc,
      case when coalesce(lower(p_sort_by), 'imported_at') = 'no_telp' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then filtered_contacts.no_telp end asc,
      case when coalesce(lower(p_sort_by), 'imported_at') = 'no_telp' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then filtered_contacts.no_telp end desc,
      case when coalesce(lower(p_sort_by), 'imported_at') = 'status' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then cardinality(filtered_contacts.group_names) > 0 end asc,
      case when coalesce(lower(p_sort_by), 'imported_at') = 'status' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then cardinality(filtered_contacts.group_names) > 0 end desc,
      case when coalesce(lower(p_sort_by), 'imported_at') = 'imported_at' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then filtered_contacts.imported_at end asc,
      case when coalesce(lower(p_sort_by), 'imported_at') = 'imported_at' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then filtered_contacts.imported_at end desc,
      lower(filtered_contacts.nama),
      filtered_contacts.id
    limit greatest(1, least(100, coalesce(p_page_size, 20)))
    offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(100, coalesce(p_page_size, 20)))
  )
  select * from ordered;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.list_csv_contact_groups(
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_sort_by text DEFAULT 'member_count',
  p_sort_dir text DEFAULT 'desc'
) RETURNS TABLE(
  group_name text,
  member_count bigint,
  preview_names text[],
  total_count bigint
)
LANGUAGE sql STABLE
AS $$
  with normalized_contacts as (
    select
      btrim(unnested_group_name) as group_name,
      contact.nama
    from public.csv_contacts as contact,
      unnest(coalesce(contact.group_names, '{}'::text[])) as unnested_group_name
    where btrim(unnested_group_name) <> ''
  ),
  grouped as (
    select
      normalized_contacts.group_name,
      count(*)::bigint as member_count,
      array(
        select preview_member.nama
        from normalized_contacts as preview_member
        where preview_member.group_name = normalized_contacts.group_name
        order by lower(preview_member.nama), preview_member.nama
        limit 4
      ) as preview_names
    from normalized_contacts
    where
      p_search is null
      or p_search = ''
      or normalized_contacts.group_name ilike '%' || p_search || '%'
    group by normalized_contacts.group_name
  ),
  ordered as (
    select
      grouped.group_name,
      grouped.member_count,
      grouped.preview_names,
      count(*) over() as total_count
    from grouped
    order by
      case when coalesce(lower(p_sort_by), 'member_count') = 'group_name' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then lower(grouped.group_name) end asc,
      case when coalesce(lower(p_sort_by), 'member_count') = 'group_name' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then lower(grouped.group_name) end desc,
      case when coalesce(lower(p_sort_by), 'member_count') = 'member_count' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then grouped.member_count end asc,
      case when coalesce(lower(p_sort_by), 'member_count') = 'member_count' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then grouped.member_count end desc,
      grouped.member_count desc,
      lower(grouped.group_name),
      grouped.group_name
    limit greatest(10, least(100, coalesce(p_page_size, 20)))
    offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(10, least(100, coalesce(p_page_size, 20)))
  )
  select * from ordered;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.list_csv_contact_group_members(
  p_group_name text,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_sort_by text DEFAULT 'nama',
  p_sort_dir text DEFAULT 'asc'
) RETURNS TABLE(
  id uuid,
  no_telp text,
  nama text,
  jenis_kelamin text,
  jabatan text,
  group_names text[],
  source_file text,
  imported_at timestamp with time zone,
  created_at timestamp with time zone,
  total_count bigint
)
LANGUAGE sql STABLE
AS $$
  with filtered_contacts as (
    select
      contact.id,
      contact.no_telp,
      contact.nama,
      contact.jenis_kelamin,
      contact.jabatan,
      contact.group_names,
      contact.source_file,
      contact.imported_at,
      contact.created_at
    from public.csv_contacts as contact
    where
      p_group_name is not null
      and p_group_name <> ''
      and contact.group_names @> array[p_group_name]::text[]
      and (
        p_search is null
        or p_search = ''
        or contact.no_telp ilike '%' || p_search || '%'
        or contact.nama ilike '%' || p_search || '%'
        or coalesce(contact.jabatan, '') ilike '%' || p_search || '%'
      )
  ),
  ordered as (
    select
      filtered_contacts.*,
      count(*) over() as total_count
    from filtered_contacts
    order by
      case when coalesce(lower(p_sort_by), 'nama') = 'nama' and coalesce(lower(p_sort_dir), 'asc') = 'asc' then lower(filtered_contacts.nama) end asc,
      case when coalesce(lower(p_sort_by), 'nama') = 'nama' and coalesce(lower(p_sort_dir), 'asc') = 'desc' then lower(filtered_contacts.nama) end desc,
      case when coalesce(lower(p_sort_by), 'nama') = 'no_telp' and coalesce(lower(p_sort_dir), 'asc') = 'asc' then filtered_contacts.no_telp end asc,
      case when coalesce(lower(p_sort_by), 'nama') = 'no_telp' and coalesce(lower(p_sort_dir), 'asc') = 'desc' then filtered_contacts.no_telp end desc,
      case when coalesce(lower(p_sort_by), 'nama') = 'jenis_kelamin' and coalesce(lower(p_sort_dir), 'asc') = 'asc' then lower(filtered_contacts.jenis_kelamin) end asc,
      case when coalesce(lower(p_sort_by), 'nama') = 'jenis_kelamin' and coalesce(lower(p_sort_dir), 'asc') = 'desc' then lower(filtered_contacts.jenis_kelamin) end desc,
      lower(filtered_contacts.nama),
      filtered_contacts.nama,
      filtered_contacts.created_at desc
    limit greatest(10, least(100, coalesce(p_page_size, 20)))
    offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(10, least(100, coalesce(p_page_size, 20)))
  )
  select * from ordered;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.resolve_csv_contact_group_recipients(
  p_group_names text[],
  p_limit integer DEFAULT NULL,
  p_sort_by text DEFAULT 'nama'
) RETURNS TABLE(
  id uuid,
  no_telp text,
  nama text,
  jenis_kelamin text,
  jabatan text,
  group_names text[],
  source_file text,
  imported_at timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE sql STABLE
AS $$
  with normalized_groups as (
    select array_agg(distinct btrim(group_name)) filter (where btrim(group_name) <> '') as group_names
    from unnest(coalesce(p_group_names, '{}'::text[])) as group_name
  ),
  filtered_contacts as (
    select
      contact.id,
      contact.no_telp,
      contact.nama,
      contact.jenis_kelamin,
      contact.jabatan,
      coalesce(contact.group_names, '{}'::text[]) as group_names,
      contact.source_file,
      contact.imported_at,
      contact.created_at
    from public.csv_contacts as contact, normalized_groups
    where cardinality(coalesce(normalized_groups.group_names, '{}'::text[])) > 0
      and coalesce(contact.group_names, '{}'::text[]) && normalized_groups.group_names
  )
  select *
  from filtered_contacts
  order by
    case when coalesce(lower(p_sort_by), 'nama') = 'created_at' then filtered_contacts.created_at end desc,
    lower(filtered_contacts.nama),
    filtered_contacts.nama,
    filtered_contacts.id
  limit case when p_limit is null then null else greatest(0, p_limit) end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.list_tickets(
  p_search text DEFAULT NULL,
  p_instance_id text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10,
  p_sort_by text DEFAULT 'updated_at',
  p_sort_dir text DEFAULT 'desc'
) RETURNS TABLE(
  id uuid,
  subject text,
  description text,
  status text,
  user_email text,
  channel text,
  phone_number text,
  whatsapp_chat_id text,
  whatsapp_instance_id text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  replies jsonb,
  total_count bigint
)
LANGUAGE sql STABLE
AS $$
  with filtered_tickets as (
    select
      ticket.id,
      ticket.subject,
      ticket.description,
      ticket.status,
      ticket.user_email,
      ticket.channel,
      ticket.phone_number,
      ticket.whatsapp_chat_id,
      ticket.whatsapp_instance_id,
      ticket.created_at,
      ticket.updated_at,
      case ticket.status
        when 'Open' then 0
        when 'In Progress' then 1
        when 'Resolved' then 2
        when 'Closed' then 3
        else 4
      end as status_order
    from public.tickets as ticket
    where
      (p_search is null or p_search = '' or ticket.subject ilike '%' || p_search || '%')
      and (p_instance_id is null or ticket.whatsapp_instance_id = p_instance_id)
  ),
  ordered as (
    select
      filtered_tickets.*,
      count(*) over() as total_count
    from filtered_tickets
    order by
      case when coalesce(lower(p_sort_by), 'updated_at') = 'id' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then filtered_tickets.id end asc,
      case when coalesce(lower(p_sort_by), 'updated_at') = 'id' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then filtered_tickets.id end desc,
      case when coalesce(lower(p_sort_by), 'updated_at') = 'subject' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then lower(filtered_tickets.subject) end asc,
      case when coalesce(lower(p_sort_by), 'updated_at') = 'subject' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then lower(filtered_tickets.subject) end desc,
      case when coalesce(lower(p_sort_by), 'updated_at') = 'status' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then filtered_tickets.status_order end asc,
      case when coalesce(lower(p_sort_by), 'updated_at') = 'status' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then filtered_tickets.status_order end desc,
      case when coalesce(lower(p_sort_by), 'updated_at') = 'updated_at' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then coalesce(filtered_tickets.updated_at, filtered_tickets.created_at) end asc,
      case when coalesce(lower(p_sort_by), 'updated_at') = 'updated_at' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then coalesce(filtered_tickets.updated_at, filtered_tickets.created_at) end desc,
      filtered_tickets.created_at desc,
      filtered_tickets.id
    limit greatest(1, least(100, coalesce(p_page_size, 10)))
    offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(100, coalesce(p_page_size, 10)))
  )
  select
    ordered.id,
    ordered.subject,
    ordered.description,
    ordered.status,
    ordered.user_email,
    ordered.channel,
    ordered.phone_number,
    ordered.whatsapp_chat_id,
    ordered.whatsapp_instance_id,
    ordered.created_at,
    ordered.updated_at,
    coalesce(
      jsonb_agg(to_jsonb(reply) order by reply.created_at asc) filter (where reply.id is not null),
      '[]'::jsonb
    ) as replies,
    ordered.total_count
  from ordered
  left join public.replies as reply on reply.ticket_id = ordered.id
  group by
    ordered.id,
    ordered.subject,
    ordered.description,
    ordered.status,
    ordered.user_email,
    ordered.channel,
    ordered.phone_number,
    ordered.whatsapp_chat_id,
    ordered.whatsapp_instance_id,
    ordered.created_at,
    ordered.updated_at,
    ordered.total_count,
    ordered.status_order
  order by
    case when coalesce(lower(p_sort_by), 'updated_at') = 'id' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then ordered.id end asc,
    case when coalesce(lower(p_sort_by), 'updated_at') = 'id' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then ordered.id end desc,
    case when coalesce(lower(p_sort_by), 'updated_at') = 'subject' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then lower(ordered.subject) end asc,
    case when coalesce(lower(p_sort_by), 'updated_at') = 'subject' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then lower(ordered.subject) end desc,
    case when coalesce(lower(p_sort_by), 'updated_at') = 'status' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then ordered.status_order end asc,
    case when coalesce(lower(p_sort_by), 'updated_at') = 'status' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then ordered.status_order end desc,
    case when coalesce(lower(p_sort_by), 'updated_at') = 'updated_at' and coalesce(lower(p_sort_dir), 'desc') = 'asc' then coalesce(ordered.updated_at, ordered.created_at) end asc,
    case when coalesce(lower(p_sort_by), 'updated_at') = 'updated_at' and coalesce(lower(p_sort_dir), 'desc') = 'desc' then coalesce(ordered.updated_at, ordered.created_at) end desc,
    ordered.created_at desc,
    ordered.id;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.ticket_status_summary(
  p_search text DEFAULT NULL,
  p_instance_id text DEFAULT NULL
) RETURNS TABLE(
  total_count bigint,
  open_count bigint,
  in_progress_count bigint,
  resolved_count bigint,
  closed_count bigint
)
LANGUAGE sql STABLE
AS $$
  select
    count(*) as total_count,
    count(*) filter (where ticket.status = 'Open') as open_count,
    count(*) filter (where ticket.status = 'In Progress') as in_progress_count,
    count(*) filter (where ticket.status = 'Resolved') as resolved_count,
    count(*) filter (where ticket.status = 'Closed') as closed_count
  from public.tickets as ticket
  where
    (p_search is null or p_search = '' or ticket.subject ilike '%' || p_search || '%')
    and (p_instance_id is null or ticket.whatsapp_instance_id = p_instance_id);
$$;
