begin;

alter table public.abschuesse
  add column if not exists tageszeit text;

alter table public.abschuesse
  drop constraint if exists abschuesse_tageszeit_check;

alter table public.abschuesse
  add constraint abschuesse_tageszeit_check
  check (tageszeit is null or tageszeit in ('frueh', 'abend'));

comment on column public.abschuesse.tageszeit is
  'Optionale Tageszeit des Abschusses: frueh oder abend.';

notify pgrst, 'reload schema';

commit;
