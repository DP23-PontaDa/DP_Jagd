begin;

alter table public.st_peter_mitterberg
  add column if not exists key_dates boolean;

update public.st_peter_mitterberg
set key_dates = true
where key_dates is null;

alter table public.st_peter_mitterberg
  alter column key_dates set default true,
  alter column key_dates set not null;

comment on column public.st_peter_mitterberg.key_dates is
  'Markiert besonders wichtige St.-Peter/Mitterberg-Einträge für die Key-Dates-Übersicht.';

notify pgrst, 'reload schema';

commit;
