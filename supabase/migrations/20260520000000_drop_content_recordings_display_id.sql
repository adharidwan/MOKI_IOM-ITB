alter table if exists public.content_recordings
  drop column if exists display_id;

drop sequence if exists public.content_recordings_display_id_seq;
