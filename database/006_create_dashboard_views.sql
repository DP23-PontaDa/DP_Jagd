begin;

do $$
begin
  if to_regclass('public.vw_abschussplan_ist') is null
     or to_regclass('public.planperioden') is null
     or to_regclass('public.planperiode_planpositionen') is null
     or to_regclass('public.wildgruppen') is null
     or to_regclass('public.abschuesse') is null
     or to_regclass('public.personen') is null then
    raise exception
      'Migration 006 abgebrochen: Eine für das Dashboard benötigte Tabelle oder View fehlt.';
  end if;
end;
$$;

create or replace view public.vw_dashboard_planpositionen
with (security_invoker = true)
as
select
  periode.id as planperiode_id,
  periode.startjahr,
  periode.endjahr,
  snapshot.wildgruppe_id,
  wildgruppe.bezeichnung as wildgruppe,
  wildgruppe.reihenfolge as wildgruppe_reihenfolge,
  snapshot.id as planperiode_planposition_id,
  snapshot.code,
  snapshot.bezeichnung as planposition,
  snapshot.reihenfolge,
  coalesce(
    max(auswertung.soll) filter (where auswertung.plan_typ = 'KJ'),
    0
  ) as soll_kj,
  coalesce(
    max(auswertung.soll) filter (
      where auswertung.plan_typ = 'INTERN'
        and auswertung.jahr = periode.startjahr
    ),
    0
  ) as soll_startjahr,
  coalesce(
    max(auswertung.soll) filter (
      where auswertung.plan_typ = 'INTERN'
        and auswertung.jahr = periode.endjahr
    ),
    0
  ) as soll_endjahr,
  coalesce(
    max(auswertung.ist) filter (where auswertung.plan_typ = 'KJ'),
    0
  ) as ist_kj,
  coalesce(
    max(auswertung.ist) filter (
      where auswertung.plan_typ = 'INTERN'
        and auswertung.jahr = periode.startjahr
    ),
    0
  ) as ist_startjahr,
  coalesce(
    max(auswertung.ist) filter (
      where auswertung.plan_typ = 'INTERN'
        and auswertung.jahr = periode.endjahr
    ),
    0
  ) as ist_endjahr,
  coalesce(
    max(auswertung.rest) filter (where auswertung.plan_typ = 'KJ'),
    0
  ) as rest,
  coalesce(
    max(auswertung.erfuellung_prozent) filter (
      where auswertung.plan_typ = 'KJ'
    ),
    0
  ) as erfuellung_prozent,
  coalesce(
    max(auswertung.fallwild) filter (where auswertung.plan_typ = 'KJ'),
    0
  ) as fallwild,
  extract(year from current_date)::integer as aktuelles_jahr,
  case
    when extract(year from current_date)::integer = periode.startjahr then
      coalesce(
        max(auswertung.soll) filter (
          where auswertung.plan_typ = 'INTERN'
            and auswertung.jahr = periode.startjahr
        ),
        0
      )
    when extract(year from current_date)::integer = periode.endjahr then
      coalesce(
        max(auswertung.soll) filter (
          where auswertung.plan_typ = 'INTERN'
            and auswertung.jahr = periode.endjahr
        ),
        0
      )
    else 0
  end as soll_aktuelles_jahr
from public.planperioden periode
join public.planperiode_planpositionen snapshot
  on snapshot.planperiode_id = periode.id
 and snapshot.aktiv = true
join public.wildgruppen wildgruppe
  on wildgruppe.id = snapshot.wildgruppe_id
left join public.vw_abschussplan_ist auswertung
  on auswertung.planperiode_id = periode.id
 and auswertung.planperiode_planposition_id = snapshot.id
group by
  periode.id,
  periode.startjahr,
  periode.endjahr,
  snapshot.wildgruppe_id,
  wildgruppe.bezeichnung,
  wildgruppe.reihenfolge,
  snapshot.id,
  snapshot.code,
  snapshot.bezeichnung,
  snapshot.reihenfolge;

drop view if exists public.vw_dashboard_jaeger;

create view public.vw_dashboard_jaeger
with (security_invoker = true)
as
select
  periode.id as planperiode_id,
  person.id as jaeger_id,
  concat_ws(' ', person.vorname, person.nachname) as jaeger,
  wildgruppe.id as wildgruppe_id,
  wildgruppe.bezeichnung as wildgruppe,
  wildgruppe.reihenfolge as wildgruppe_reihenfolge,
  wildklasse.id as wildklasse_id,
  wildklasse.code as wildklasse_code,
  wildklasse.bezeichnung as wildklasse,
  wildklasse.reihenfolge as wildklasse_reihenfolge,
  count(*)::bigint as anzahl
from public.planperioden periode
join public.abschuesse abschuss
  on abschuss.datum >= make_date(periode.startjahr, 1, 1)
 and abschuss.datum < make_date(periode.endjahr + 1, 1, 1)
 and abschuss.fallwild = false
join public.personen person
  on person.id = abschuss.jaeger_id
join public.wildgruppen wildgruppe
  on wildgruppe.id = abschuss.wildgruppe_id
join public.wildklassen wildklasse
  on wildklasse.id = abschuss.wildklasse_id
group by
  periode.id,
  person.id,
  person.vorname,
  person.nachname,
  wildgruppe.id,
  wildgruppe.bezeichnung,
  wildgruppe.reihenfolge,
  wildklasse.id,
  wildklasse.code,
  wildklasse.bezeichnung,
  wildklasse.reihenfolge;

grant select on public.vw_dashboard_planpositionen to authenticated;
grant select on public.vw_dashboard_jaeger to authenticated;

notify pgrst, 'reload schema';

commit;
