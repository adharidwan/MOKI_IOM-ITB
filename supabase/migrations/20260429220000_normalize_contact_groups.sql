create table if not exists public.contact_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint contact_groups_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists contact_groups_name_lower_idx
  on public.contact_groups (lower(btrim(name)));

create table if not exists public.contact_group_members (
  contact_id uuid not null references public.csv_contacts(id) on delete cascade,
  group_id uuid not null references public.contact_groups(id) on delete cascade,
  added_at timestamp with time zone not null default timezone('utc', now()),
  primary key (contact_id, group_id)
);

create index if not exists contact_group_members_group_id_contact_id_idx
  on public.contact_group_members (group_id, contact_id);

create index if not exists contact_group_members_contact_id_group_id_idx
  on public.contact_group_members (contact_id, group_id);

alter table public.contact_groups enable row level security;
alter table public.contact_group_members enable row level security;

create policy contact_groups_service_role_all
  on public.contact_groups
  to service_role
  using (true)
  with check (true);

create policy contact_group_members_service_role_all
  on public.contact_group_members
  to service_role
  using (true)
  with check (true);

create or replace function public.normalize_contact_group_names(p_group_names text[])
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(trimmed_group_name order by lower(trimmed_group_name), trimmed_group_name),
    '{}'::text[]
  )
  from (
    select distinct btrim(group_name) as trimmed_group_name
    from unnest(coalesce(p_group_names, '{}'::text[])) as group_name
    where btrim(group_name) <> ''
  ) normalized;
$$;

create or replace function public.sync_contact_group_memberships(
  p_contact_id uuid,
  p_group_names text[]
)
returns integer
language plpgsql
as $$
declare
  normalized_names text[] := public.normalize_contact_group_names(p_group_names);
  affected_count integer := 0;
begin
  delete from public.contact_group_members
  where contact_id = p_contact_id;

  if cardinality(normalized_names) = 0 then
    return 0;
  end if;

  insert into public.contact_groups (name)
  select group_name
  from unnest(normalized_names) as group_name
  on conflict do nothing;

  insert into public.contact_group_members (contact_id, group_id)
  select p_contact_id, contact_groups.id
  from public.contact_groups
  join unnest(normalized_names) as group_name
    on lower(btrim(contact_groups.name)) = lower(btrim(group_name))
  on conflict do nothing;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

create or replace function public.normalize_csv_contact_group_names_trigger()
returns trigger
language plpgsql
as $$
begin
  new.group_names = public.normalize_contact_group_names(new.group_names);
  return new;
end;
$$;

create or replace function public.sync_csv_contact_group_memberships_trigger()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_contact_group_memberships(new.id, new.group_names);
  return new;
end;
$$;

insert into public.contact_groups (name)
select distinct btrim(group_name)
from public.csv_contacts contact,
  unnest(coalesce(contact.group_names, '{}'::text[])) as group_name
where btrim(group_name) <> ''
on conflict do nothing;

insert into public.contact_group_members (contact_id, group_id)
select contact.id, contact_group.id
from public.csv_contacts contact
cross join lateral unnest(public.normalize_contact_group_names(contact.group_names)) as group_name
join public.contact_groups contact_group
  on lower(btrim(contact_group.name)) = lower(btrim(group_name))
on conflict do nothing;

drop trigger if exists trg_csv_contacts_normalize_group_names on public.csv_contacts;
create trigger trg_csv_contacts_normalize_group_names
  before insert or update of group_names on public.csv_contacts
  for each row
  execute function public.normalize_csv_contact_group_names_trigger();

drop trigger if exists trg_csv_contacts_sync_group_memberships on public.csv_contacts;
create trigger trg_csv_contacts_sync_group_memberships
  after insert or update of group_names on public.csv_contacts
  for each row
  execute function public.sync_csv_contact_group_memberships_trigger();

update public.csv_contacts
set group_names = public.normalize_contact_group_names(group_names)
where group_names is distinct from public.normalize_contact_group_names(group_names);

create or replace function public.add_csv_contact_groups(
  p_contact_ids uuid[],
  p_group_names text[]
)
returns integer
language plpgsql
as $$
declare
  normalized_names text[] := public.normalize_contact_group_names(p_group_names);
  updated_count integer := 0;
begin
  if cardinality(coalesce(p_contact_ids, '{}'::uuid[])) = 0
    or cardinality(normalized_names) = 0 then
    return 0;
  end if;

  insert into public.contact_groups (name)
  select group_name
  from unnest(normalized_names) as group_name
  on conflict do nothing;

  with updated_contacts as (
    update public.csv_contacts as contact
    set group_names = public.normalize_contact_group_names(
      coalesce(contact.group_names, '{}'::text[]) || normalized_names
    )
    where contact.id = any(coalesce(p_contact_ids, '{}'::uuid[]))
    returning contact.id
  ), inserted_memberships as (
    insert into public.contact_group_members (contact_id, group_id)
    select updated_contacts.id, contact_group.id
    from updated_contacts
    cross join unnest(normalized_names) as group_name
    join public.contact_groups contact_group
      on lower(btrim(contact_group.name)) = lower(btrim(group_name))
    on conflict do nothing
    returning 1
  )
  select count(*)::integer
  into updated_count
  from updated_contacts;

  return updated_count;
end;
$$;

create or replace function public.list_csv_contacts(
  p_search text default null::text,
  p_group_name text default null::text,
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort_by text default 'imported_at'::text,
  p_sort_dir text default 'desc'::text
)
returns table(
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
language sql
stable
as $$
  with contact_groups_by_contact as (
    select
      member.contact_id,
      array_agg(contact_group.name order by lower(contact_group.name), contact_group.name) as group_names
    from public.contact_group_members member
    join public.contact_groups contact_group on contact_group.id = member.group_id
    group by member.contact_id
  ), filtered_contacts as (
    select
      contact.id,
      contact.no_telp,
      contact.nama,
      contact.jenis_kelamin,
      contact.jabatan,
      coalesce(contact_groups_by_contact.group_names, '{}'::text[]) as group_names,
      contact.source_file,
      contact.imported_at,
      contact.created_at
    from public.csv_contacts as contact
    left join contact_groups_by_contact on contact_groups_by_contact.contact_id = contact.id
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
        or exists (
          select 1
          from public.contact_group_members member
          join public.contact_groups contact_group on contact_group.id = member.group_id
          where member.contact_id = contact.id
            and lower(btrim(contact_group.name)) = lower(btrim(p_group_name))
        )
      )
  ), ordered as (
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

create or replace function public.list_csv_contact_groups(
  p_search text default null::text,
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort_by text default 'member_count'::text,
  p_sort_dir text default 'desc'::text
)
returns table(group_name text, member_count bigint, preview_names text[], total_count bigint)
language sql
stable
as $$
  with grouped as (
    select
      contact_group.name as group_name,
      count(member.contact_id)::bigint as member_count,
      array(
        select preview_contact.nama
        from public.contact_group_members preview_member
        join public.csv_contacts preview_contact on preview_contact.id = preview_member.contact_id
        where preview_member.group_id = contact_group.id
        order by lower(preview_contact.nama), preview_contact.nama
        limit 4
      ) as preview_names
    from public.contact_groups contact_group
    left join public.contact_group_members member on member.group_id = contact_group.id
    where
      p_search is null
      or p_search = ''
      or contact_group.name ilike '%' || p_search || '%'
    group by contact_group.id, contact_group.name
  ), ordered as (
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

create or replace function public.list_csv_contact_group_members(
  p_group_name text,
  p_search text default null::text,
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort_by text default 'nama'::text,
  p_sort_dir text default 'asc'::text
)
returns table(
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
language sql
stable
as $$
  with contact_groups_by_contact as (
    select
      member.contact_id,
      array_agg(contact_group.name order by lower(contact_group.name), contact_group.name) as group_names
    from public.contact_group_members member
    join public.contact_groups contact_group on contact_group.id = member.group_id
    group by member.contact_id
  ), filtered_contacts as (
    select
      contact.id,
      contact.no_telp,
      contact.nama,
      contact.jenis_kelamin,
      contact.jabatan,
      coalesce(contact_groups_by_contact.group_names, '{}'::text[]) as group_names,
      contact.source_file,
      contact.imported_at,
      contact.created_at
    from public.csv_contacts contact
    join public.contact_group_members member on member.contact_id = contact.id
    join public.contact_groups contact_group on contact_group.id = member.group_id
    left join contact_groups_by_contact on contact_groups_by_contact.contact_id = contact.id
    where
      p_group_name is not null
      and p_group_name <> ''
      and lower(btrim(contact_group.name)) = lower(btrim(p_group_name))
      and (
        p_search is null
        or p_search = ''
        or contact.no_telp ilike '%' || p_search || '%'
        or contact.nama ilike '%' || p_search || '%'
        or coalesce(contact.jabatan, '') ilike '%' || p_search || '%'
      )
  ), ordered as (
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

create or replace function public.resolve_csv_contact_group_recipients(
  p_group_names text[],
  p_limit integer default null,
  p_sort_by text default 'created_at'
)
returns table(
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
language sql
stable
as $$
  with normalized_input as (
    select public.normalize_contact_group_names(p_group_names) as group_names
  ), matched_contacts as (
    select distinct contact.id
    from public.csv_contacts contact
    join public.contact_group_members member on member.contact_id = contact.id
    join public.contact_groups contact_group on contact_group.id = member.group_id
    cross join normalized_input
    where cardinality(normalized_input.group_names) > 0
      and lower(btrim(contact_group.name)) = any(
        select lower(btrim(group_name))
        from unnest(normalized_input.group_names) as group_name
      )
  ), contact_groups_by_contact as (
    select
      member.contact_id,
      array_agg(contact_group.name order by lower(contact_group.name), contact_group.name) as group_names
    from public.contact_group_members member
    join public.contact_groups contact_group on contact_group.id = member.group_id
    where member.contact_id in (select matched_contacts.id from matched_contacts)
    group by member.contact_id
  ), resolved_contacts as (
    select
      contact.id,
      contact.no_telp,
      contact.nama,
      contact.jenis_kelamin,
      contact.jabatan,
      coalesce(contact_groups_by_contact.group_names, '{}'::text[]) as group_names,
      contact.source_file,
      contact.imported_at,
      contact.created_at,
      count(*) over() as total_count
    from public.csv_contacts contact
    join matched_contacts on matched_contacts.id = contact.id
    left join contact_groups_by_contact on contact_groups_by_contact.contact_id = contact.id
  )
  select *
  from resolved_contacts
  order by
    case when coalesce(lower(p_sort_by), 'created_at') = 'nama' then lower(resolved_contacts.nama) end asc,
    case when coalesce(lower(p_sort_by), 'created_at') = 'nama' then resolved_contacts.nama end asc,
    resolved_contacts.created_at desc
  limit p_limit;
$$;

grant all on table public.contact_groups to anon, authenticated, service_role;
grant all on table public.contact_group_members to anon, authenticated, service_role;
grant all on function public.normalize_contact_group_names(text[]) to anon, authenticated, service_role;
grant all on function public.sync_contact_group_memberships(uuid, text[]) to anon, authenticated, service_role;
grant all on function public.normalize_csv_contact_group_names_trigger() to anon, authenticated, service_role;
grant all on function public.sync_csv_contact_group_memberships_trigger() to anon, authenticated, service_role;
grant all on function public.resolve_csv_contact_group_recipients(text[], integer, text) to anon, authenticated, service_role;
