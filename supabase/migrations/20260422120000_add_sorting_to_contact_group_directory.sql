create or replace function public.list_csv_contact_groups(
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort_by text default 'member_count',
  p_sort_dir text default 'desc'
)
returns table (
  group_name text,
  member_count bigint,
  preview_names text[],
  total_count bigint
)
language sql
stable
as $$
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
      case
        when coalesce(lower(p_sort_by), 'member_count') = 'group_name'
          and coalesce(lower(p_sort_dir), 'desc') = 'asc'
        then lower(grouped.group_name)
      end asc,
      case
        when coalesce(lower(p_sort_by), 'member_count') = 'group_name'
          and coalesce(lower(p_sort_dir), 'desc') = 'desc'
        then lower(grouped.group_name)
      end desc,
      case
        when coalesce(lower(p_sort_by), 'member_count') = 'member_count'
          and coalesce(lower(p_sort_dir), 'desc') = 'asc'
        then grouped.member_count
      end asc,
      case
        when coalesce(lower(p_sort_by), 'member_count') = 'member_count'
          and coalesce(lower(p_sort_dir), 'desc') = 'desc'
        then grouped.member_count
      end desc,
      grouped.member_count desc,
      lower(grouped.group_name),
      grouped.group_name
    limit greatest(10, least(100, coalesce(p_page_size, 20)))
    offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(10, least(100, coalesce(p_page_size, 20)))
  )
  select * from ordered;
$$;

create or replace function public.list_csv_contact_group_members(
  p_group_name text,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort_by text default 'nama',
  p_sort_dir text default 'asc'
)
returns table (
  id uuid,
  no_telp text,
  nama text,
  jenis_kelamin text,
  jabatan text,
  group_names text[],
  source_file text,
  imported_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
as $$
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
      case
        when coalesce(lower(p_sort_by), 'nama') = 'nama'
          and coalesce(lower(p_sort_dir), 'asc') = 'asc'
        then lower(filtered_contacts.nama)
      end asc,
      case
        when coalesce(lower(p_sort_by), 'nama') = 'nama'
          and coalesce(lower(p_sort_dir), 'asc') = 'desc'
        then lower(filtered_contacts.nama)
      end desc,
      case
        when coalesce(lower(p_sort_by), 'nama') = 'no_telp'
          and coalesce(lower(p_sort_dir), 'asc') = 'asc'
        then filtered_contacts.no_telp
      end asc,
      case
        when coalesce(lower(p_sort_by), 'nama') = 'no_telp'
          and coalesce(lower(p_sort_dir), 'asc') = 'desc'
        then filtered_contacts.no_telp
      end desc,
      case
        when coalesce(lower(p_sort_by), 'nama') = 'jenis_kelamin'
          and coalesce(lower(p_sort_dir), 'asc') = 'asc'
        then lower(filtered_contacts.jenis_kelamin)
      end asc,
      case
        when coalesce(lower(p_sort_by), 'nama') = 'jenis_kelamin'
          and coalesce(lower(p_sort_dir), 'asc') = 'desc'
        then lower(filtered_contacts.jenis_kelamin)
      end desc,
      lower(filtered_contacts.nama),
      filtered_contacts.nama,
      filtered_contacts.created_at desc
    limit greatest(10, least(100, coalesce(p_page_size, 20)))
    offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(10, least(100, coalesce(p_page_size, 20)))
  )
  select * from ordered;
$$;
