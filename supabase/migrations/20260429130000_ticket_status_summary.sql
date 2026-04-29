create or replace function public.ticket_status_summary(
  p_search text default null,
  p_instance_id text default null
)
returns table (
  total_count bigint,
  open_count bigint,
  in_progress_count bigint,
  resolved_count bigint,
  closed_count bigint
)
language sql
stable
as $$
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
