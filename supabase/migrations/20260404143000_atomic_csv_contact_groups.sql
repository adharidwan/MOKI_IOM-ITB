create or replace function public.add_csv_contact_groups(
  p_contact_ids uuid[],
  p_group_names text[]
)
returns integer
language sql
as $$
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
