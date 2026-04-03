alter table public.csv_contacts
  add column if not exists group_name text;

create index if not exists idx_csv_contacts_group_name
  on public.csv_contacts using btree (group_name);

alter table public.csv_contacts
  add column if not exists group_names text[] not null default '{}'::text[];

update public.csv_contacts
set group_names = case
  when group_name is null or btrim(group_name) = '' then '{}'::text[]
  else array[group_name]
end
where group_names = '{}'::text[];

create index if not exists idx_csv_contacts_group_names
  on public.csv_contacts using gin (group_names);