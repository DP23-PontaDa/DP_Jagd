begin;

alter table public.abschuesse add column if not exists anrechnung_person_id uuid;
alter table public.abschuesse drop constraint if exists abschuesse_anrechnung_person_fk;
alter table public.abschuesse add constraint abschuesse_anrechnung_person_fk
  foreign key (anrechnung_person_id) references public.personen(id)
  on update cascade on delete restrict;
create index if not exists abschuesse_anrechnung_person_idx
  on public.abschuesse(anrechnung_person_id) where anrechnung_person_id is not null;
comment on column public.abschuesse.anrechnung_person_id is
  'Optionales Vereinsmitglied für personenbezogene Anrechnung; NULL bedeutet tatsächlicher Schütze.';
notify pgrst, 'reload schema';
commit;
