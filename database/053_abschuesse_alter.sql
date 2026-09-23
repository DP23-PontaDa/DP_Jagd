begin;

alter table public.abschuesse
  add column if not exists "alter" integer;

alter table public.abschuesse
  drop constraint if exists abschuesse_alter_nicht_negativ;

alter table public.abschuesse
  add constraint abschuesse_alter_nicht_negativ
  check ("alter" is null or "alter" >= 0);

comment on column public.abschuesse."alter" is
  'Optionales ganzzahliges Alter für die dafür vorgesehenen Hirsch- und Rehbock-Wildklassen.';

notify pgrst, 'reload schema';

commit;
