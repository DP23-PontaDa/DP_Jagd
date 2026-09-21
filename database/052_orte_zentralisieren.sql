begin;

alter table public.orte
  add column if not exists ort_typ text;

update public.orte
set ort_typ = case when reviereinrichtung then 'REVIEREINRICHTUNG' else 'ABSCHUSSORT' end
where ort_typ is null;

alter table public.orte
  alter column ort_typ set default 'ABSCHUSSORT',
  alter column ort_typ set not null;

alter table public.orte
  drop constraint if exists orte_ort_typ_check;
alter table public.orte
  add constraint orte_ort_typ_check check (
    (ort_typ = 'REVIEREINRICHTUNG' and reviereinrichtung = true)
    or (ort_typ in ('ABSCHUSSORT', 'ORT') and reviereinrichtung = false)
  );

alter table public.fehlschuesse add column if not exists ort_id uuid;
alter table public.probeschuesse add column if not exists ort_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fehlschuesse_ort_fk'
      and conrelid = 'public.fehlschuesse'::regclass) then
    alter table public.fehlschuesse add constraint fehlschuesse_ort_fk
      foreign key (ort_id) references public.orte(id) on update cascade on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'probeschuesse_ort_fk'
      and conrelid = 'public.probeschuesse'::regclass) then
    alter table public.probeschuesse add constraint probeschuesse_ort_fk
      foreign key (ort_id) references public.orte(id) on update cascade on delete restrict;
  end if;
end;
$$;

create index if not exists fehlschuesse_ort_id_idx on public.fehlschuesse(ort_id);
create index if not exists probeschuesse_ort_id_idx on public.probeschuesse(ort_id);

-- Historische Texte werden nur bei exakt einem Namens-Treffer zugeordnet.
update public.fehlschuesse f
set ort_id = (select min(o.id) from public.orte o where lower(btrim(o.name)) = lower(btrim(f.ort)))
where f.ort_id is null and nullif(btrim(f.ort), '') is not null
  and (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(f.ort))) = 1;

update public.probeschuesse p
set ort_id = (select min(o.id) from public.orte o where lower(btrim(o.name)) = lower(btrim(p.ort)))
where p.ort_id is null and nullif(btrim(p.ort), '') is not null
  and (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(p.ort))) = 1;

comment on column public.orte.ort_typ is
  'Zentrale Ortskategorie: REVIEREINRICHTUNG, ABSCHUSSORT oder ORT.';

notify pgrst, 'reload schema';
commit;
