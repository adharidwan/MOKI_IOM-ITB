create extension if not exists pgcrypto;

create table if not exists public.csv_contacts (
  id uuid primary key default gen_random_uuid(),
  no_telp text not null,
  nama text not null,
  jenis_kelamin text not null,
  jabatan text,
  source_file text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_csv_contacts_no_telp
  on public.csv_contacts(no_telp);

create unique index if not exists uq_csv_contacts_no_telp
  on public.csv_contacts(no_telp);

create index if not exists idx_csv_contacts_imported_at
  on public.csv_contacts(imported_at);

alter table public.csv_contacts enable row level security;

drop policy if exists service_role_full_access_csv_contacts on public.csv_contacts;

create policy service_role_full_access_csv_contacts
  on public.csv_contacts
  for all
  to service_role
  using (true)
  with check (true);
