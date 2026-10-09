begin;

-- Eindeutige, administrativ gepflegte Zuordnung zwischen Auth-Benutzer und Person.
alter table public.app_benutzerprofile add column if not exists person_id uuid;
alter table public.app_benutzerprofile drop constraint if exists app_benutzerprofile_person_fk;
alter table public.app_benutzerprofile add constraint app_benutzerprofile_person_fk
  foreign key (person_id) references public.personen(id) on update cascade on delete restrict;
create unique index if not exists app_benutzerprofile_person_uidx
  on public.app_benutzerprofile(person_id) where person_id is not null;

insert into public.app_module (code, bezeichnung, reihenfolge, parent_code, ist_container)
select 'jaeger-bericht', 'Jägerdatenblatt', coalesce(max(reihenfolge), 0) + 1, 'abschussplan', false
from public.app_module
on conflict (code) do update set bezeichnung = excluded.bezeichnung, parent_code = excluded.parent_code, ist_container = false;

insert into public.app_rollen_rechte (rolle_id, modul_code, lesen, bearbeiten, loeschen)
select r.id, 'jaeger-bericht', true, false, false
from public.app_rollen r where r.name = 'Jäger'
on conflict (rolle_id, modul_code) do update set lesen = true;

-- Einige ältere Installationen besitzen die Rollenstruktur bereits, jedoch
-- noch nicht diese zentrale serverseitige Admin-Hilfsfunktion.
create or replace function public.app_ist_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.app_benutzerprofile p
    join public.app_rollen r on r.id = p.rolle_id
    where p.id = auth.uid() and p.aktiv = true and r.name = 'Admin'
  );
$$;

create or replace function public.app_jaegerdatenblatt_zugang()
returns table(ist_admin boolean, person_id uuid, vorname text, nachname text)
language sql stable security definer set search_path = public
as $$
  select public.app_ist_admin(), p.person_id, pe.vorname, pe.nachname
  from public.app_benutzerprofile p
  left join public.personen pe on pe.id = p.person_id
  where p.id = auth.uid() and p.aktiv = true;
$$;

create or replace function public.app_jaegerdatenblatt_meine_jahre()
returns table(jahr integer)
language sql stable security definer set search_path = public
as $$
  select distinct extract(year from a.datum)::integer
  from public.app_benutzerprofile p
  join public.abschuesse a on a.jaeger_id = p.person_id or a.anrechnung_person_id = p.person_id
  where p.id = auth.uid() and p.aktiv = true and a.datum is not null
  order by 1 desc;
$$;

create or replace function public.app_jaegerdatenblatt_meine_daten(
  p_person_id uuid,
  p_von_jahr integer,
  p_bis_jahr integer
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_person_id uuid;
  v_admin boolean;
  v_person jsonb;
begin
  if p_von_jahr is null or p_bis_jahr is null or p_von_jahr > p_bis_jahr
    or p_von_jahr not between 1900 and 2999 or p_bis_jahr not between 1900 and 2999 then
    raise exception 'Ungültiger Berichtszeitraum.' using errcode = '22023';
  end if;

  select public.app_ist_admin(), person_id into v_admin, v_person_id
  from public.app_benutzerprofile where id = auth.uid() and aktiv = true;
  if not found then raise exception 'Benutzerkonto ist nicht aktiv.' using errcode = '42501'; end if;
  if not v_admin and (v_person_id is null or v_person_id <> p_person_id) then
    raise exception 'Zugriff auf dieses Jägerdatenblatt ist nicht erlaubt.' using errcode = '42501';
  end if;
  if p_person_id is null then raise exception 'Kein Jäger zugeordnet.' using errcode = '22023'; end if;

  select jsonb_build_object('id', id, 'vorname', vorname, 'nachname', nachname)
    into v_person from public.personen where id = p_person_id;
  if v_person is null then raise exception 'Der zugeordnete Jäger existiert nicht.' using errcode = 'P0001'; end if;

  return jsonb_build_object(
    'jaeger', v_person,
    'abschuesse', coalesce((select jsonb_agg(x order by x->>'datum', x->>'id') from (
      select jsonb_build_object(
        'id', a.id, 'nr', a.nr, 'datum', a.datum, 'jaeger_id', a.jaeger_id,
        'anrechnung_person_id', a.anrechnung_person_id, 'wildgruppe_id', a.wildgruppe_id,
        'wildklasse_id', a.wildklasse_id, 'fallwild', a.fallwild, 'sonderabschuss', a.sonderabschuss,
        'alter', a.alter, 'bemerkung', a.bemerkung, 'zusatzinfo', a.zusatzinfo,
        'jaeger', jsonb_build_object('id', j.id, 'vorname', j.vorname, 'nachname', j.nachname),
        'wildgruppen', jsonb_build_object('id', wg.id, 'bezeichnung', wg.bezeichnung, 'reihenfolge', wg.reihenfolge),
        'wildklassen', jsonb_build_object('id', wk.id, 'code', wk.code, 'bezeichnung', wk.bezeichnung, 'wildgruppe_id', wk.wildgruppe_id),
        'erlegungsort', case when o.id is null then null else jsonb_build_object('id', o.id, 'name', o.name, 'reviereinrichtung', o.reviereinrichtung) end
      ) x
      from public.abschuesse a
      join public.personen j on j.id = a.jaeger_id
      join public.wildgruppen wg on wg.id = a.wildgruppe_id
      join public.wildklassen wk on wk.id = a.wildklasse_id
      left join public.orte o on o.id = a.ort_id
      where (a.jaeger_id = p_person_id or a.anrechnung_person_id = p_person_id)
        and a.datum >= make_date(p_von_jahr, 1, 1) and a.datum < make_date(p_bis_jahr + 1, 1, 1)
    ) s), '[]'::jsonb),
    'nachsuchen', coalesce((select jsonb_agg(x order by x->>'datum', x->>'id') from (
      select jsonb_build_object('id', n.id, 'datum', n.datum, 'wild_gefunden', n.wild_gefunden, 'info', n.info,
        'jaeger_id', n.jaeger_id, 'jaeger', jsonb_build_object('id', j.id, 'vorname', j.vorname, 'nachname', j.nachname),
        'wildgruppen', jsonb_build_object('id', wg.id, 'bezeichnung', wg.bezeichnung),
        'wildklassen', jsonb_build_object('id', wk.id, 'bezeichnung', wk.bezeichnung),
        'ort_stammdaten', case when o.id is null then null else jsonb_build_object('id', o.id, 'name', o.name) end) x
      from public.nachsuchen n join public.personen j on j.id=n.jaeger_id
      join public.wildgruppen wg on wg.id=n.wildgruppe_id join public.wildklassen wk on wk.id=n.wildklasse_id
      left join public.orte o on o.id=n.ort_id
      where n.jaeger_id=p_person_id and n.datum >= make_date(p_von_jahr,1,1) and n.datum < make_date(p_bis_jahr+1,1,1)
    ) s), '[]'::jsonb),
    'probeschuesse', coalesce((select jsonb_agg(x order by x->>'datum', x->>'id') from (
      select jsonb_build_object('id', p.id, 'datum', p.datum, 'info', p.info, 'jaeger_id', p.jaeger_id,
        'jaeger', jsonb_build_object('id',j.id,'vorname',j.vorname,'nachname',j.nachname),
        'ort_stammdaten', case when o.id is null then null else jsonb_build_object('id',o.id,'name',o.name) end) x
      from public.probeschuesse p join public.personen j on j.id=p.jaeger_id left join public.orte o on o.id=p.ort_id
      where p.jaeger_id=p_person_id and p.datum >= make_date(p_von_jahr,1,1) and p.datum < make_date(p_bis_jahr+1,1,1)
    ) s), '[]'::jsonb),
    'fehlschuesse', coalesce((select jsonb_agg(x order by x->>'datum', x->>'id') from (
      select jsonb_build_object('id', f.id, 'datum', f.datum, 'info', f.info, 'jaeger_id', f.jaeger_id,
        'jaeger', jsonb_build_object('id',j.id,'vorname',j.vorname,'nachname',j.nachname),
        'wildgruppen', jsonb_build_object('id',wg.id,'bezeichnung',wg.bezeichnung),
        'wildklassen', jsonb_build_object('id',wk.id,'bezeichnung',wk.bezeichnung),
        'ort_stammdaten', case when o.id is null then null else jsonb_build_object('id',o.id,'name',o.name) end) x
      from public.fehlschuesse f join public.personen j on j.id=f.jaeger_id join public.wildgruppen wg on wg.id=f.wildgruppe_id
      join public.wildklassen wk on wk.id=f.wildklasse_id left join public.orte o on o.id=f.ort_id
      where f.jaeger_id=p_person_id and f.datum >= make_date(p_von_jahr,1,1) and f.datum < make_date(p_bis_jahr+1,1,1)
    ) s), '[]'::jsonb),
    'kahlwild_ids', coalesce((select jsonb_agg(wk.id) from public.wildklassen wk join public.wildgruppen wg on wg.id=wk.wildgruppe_id
      where lower(btrim(wg.bezeichnung))='rotwild' and lower(btrim(wk.bezeichnung)) in ('tier','schmaltier','kalb männlich','kalb weiblich')), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.app_jaegerdatenblatt_zugang() from public;
revoke all on function public.app_jaegerdatenblatt_meine_jahre() from public;
revoke all on function public.app_jaegerdatenblatt_meine_daten(uuid, integer, integer) from public;
grant execute on function public.app_jaegerdatenblatt_zugang() to authenticated;
grant execute on function public.app_jaegerdatenblatt_meine_jahre() to authenticated;
grant execute on function public.app_jaegerdatenblatt_meine_daten(uuid, integer, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
