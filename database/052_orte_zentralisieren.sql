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

-- Ein verwendeter Ort darf unabhängig von den Leserechten der Oberfläche
-- nicht gelöscht werden. Die bestehenden Constraint-Namen bleiben erhalten.
alter table public.abschuesse drop constraint if exists abschuesse_ort_fk;
alter table public.abschuesse add constraint abschuesse_ort_fk
  foreign key (ort_id) references public.orte(id) on update cascade on delete restrict;

alter table public.nachsuchen drop constraint if exists nachsuchen_ort_fk;
alter table public.nachsuchen add constraint nachsuchen_ort_fk
  foreign key (ort_id) references public.orte(id) on update cascade on delete restrict;

alter table public.tagebuch_dp drop constraint if exists tagebuch_dp_ort_id_fkey;
alter table public.tagebuch_dp add constraint tagebuch_dp_ort_id_fkey
  foreign key (ort_id) references public.orte(id) on update cascade on delete restrict;

alter table public.st_peter_mitterberg drop constraint if exists st_peter_mitterberg_ort_id_fkey;
alter table public.st_peter_mitterberg add constraint st_peter_mitterberg_ort_id_fkey
  foreign key (ort_id) references public.orte(id) on update cascade on delete restrict;

-- Historische Texte werden nur bei exakt einem Namens-Treffer zugeordnet.
update public.fehlschuesse f
set ort_id = (select o.id from public.orte o where lower(btrim(o.name)) = lower(btrim(f.ort)) limit 1)
where f.ort_id is null and nullif(btrim(f.ort), '') is not null
  and (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(f.ort))) = 1;

update public.probeschuesse p
set ort_id = (select o.id from public.orte o where lower(btrim(o.name)) = lower(btrim(p.ort)) limit 1)
where p.ort_id is null and nullif(btrim(p.ort), '') is not null
  and (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(p.ort))) = 1;

update public.nachsuchen n
set ort_id = (select o.id from public.orte o where lower(btrim(o.name)) = lower(btrim(n.ort)) limit 1)
where n.ort_id is null and nullif(btrim(n.ort), '') is not null
  and (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(n.ort))) = 1;

update public.tagebuch_dp t
set ort_id = (select o.id from public.orte o where lower(btrim(o.name)) = lower(btrim(t.ort_freitext)) limit 1)
where t.ort_id is null and nullif(btrim(t.ort_freitext), '') is not null
  and (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(t.ort_freitext))) = 1;

update public.st_peter_mitterberg s
set ort_id = (select o.id from public.orte o where lower(btrim(o.name)) = lower(btrim(s.ort_freitext)) limit 1)
where s.ort_id is null and nullif(btrim(s.ort_freitext), '') is not null
  and (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(s.ort_freitext))) = 1;

create or replace view public.ort_freitext_migrationspruefung as
select 'nachsuchen'::text as quelle, n.id, n.ort as ort_text,
  (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(n.ort))) as treffer
from public.nachsuchen n where n.ort_id is null and nullif(btrim(n.ort), '') is not null
union all
select 'fehlschuesse', f.id, f.ort,
  (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(f.ort)))
from public.fehlschuesse f where f.ort_id is null and nullif(btrim(f.ort), '') is not null
union all
select 'probeschuesse', p.id, p.ort,
  (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(p.ort)))
from public.probeschuesse p where p.ort_id is null and nullif(btrim(p.ort), '') is not null
union all
select 'tagebuch_dp', t.id, t.ort_freitext,
  (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(t.ort_freitext)))
from public.tagebuch_dp t where t.ort_id is null and nullif(btrim(t.ort_freitext), '') is not null
union all
select 'st_peter_mitterberg', s.id, s.ort_freitext,
  (select count(*) from public.orte o where lower(btrim(o.name)) = lower(btrim(s.ort_freitext)))
from public.st_peter_mitterberg s where s.ort_id is null and nullif(btrim(s.ort_freitext), '') is not null;

comment on column public.orte.ort_typ is
  'Zentrale Ortskategorie: REVIEREINRICHTUNG, ABSCHUSSORT oder ORT.';

notify pgrst, 'reload schema';
commit;
