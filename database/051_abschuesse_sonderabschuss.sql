begin;

alter table public.abschuesse
  add column if not exists sonderabschuss boolean not null default false;

comment on column public.abschuesse.sonderabschuss is
  'Hirschabschuss ohne personenbezogene Wirkung auf Kahlwildpflicht, Freigabefolge und Vorziehungen.';

notify pgrst, 'reload schema';

commit;
