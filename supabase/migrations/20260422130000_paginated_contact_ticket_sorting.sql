create or replace function public.list_csv_contacts(
  p_search text default null,
  p_group_name text default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort_by text default 'imported_at',
  p_sort_dir text default 'desc'
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

create or replace function public.list_tickets(
  p_search text default null,
  p_instance_id text default null,
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort_by text default 'updated_at',
  p_sort_dir text default 'desc'
)
returns table (
  id uuid,
  subject text,
  description text,
  status text,
  user_email text,
  channel text,
  phone_number text,
  whatsapp_chat_id text,
  whatsapp_instance_id text,
  created_at timestamptz,
  updated_at timestamptz,
  replies jsonb,
  total_count bigint
)
language sql
stable
as $$
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
