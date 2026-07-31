begin;

do $$
begin
  if to_regclass('public.abschuesse') is null
     or to_regclass('public.planperioden') is null
     or to_regclass('public.planperiode_planpositionen') is null
     or to_regclass('public.planperiode_planposition_wildklasse') is null
     or to_regclass('public.abschussplaene') is null
     or to_regclass('public.abschussplan_positionen') is null then
    raise exception
      'Migration 005 abgebrochen: Eine für die IST-Berechnung benötigte Tabelle fehlt.';
  end if;

  if exists (
    select 1
    from public.planperiode_planposition_wildklasse
    group by planperiode_id, wildklasse_id
    having count(*) > 1
  ) then
    raise exception
      'Migration 005 abgebrochen: Mindestens eine Wildklasse ist innerhalb einer Planperiode mehrfach zugeordnet.';
  end if;

  if exists (
    select 1
    from public.planperiode_planposition_wildklasse mapping
    join public.planperiode_planpositionen snapshot
      on snapshot.id = mapping.planperiode_planposition_id
    where mapping.planperiode_id <> snapshot.planperiode_id
  ) then
    raise exception
      'Migration 005 abgebrochen: Ein Snapshot-Mapping gehört zu einer anderen Planperiode als seine Planposition.';
  end if;
end;
$$;

create index if not exists abschuesse_wildklasse_datum_idx
  on public.abschuesse (wildklasse_id, datum);

create index if not exists planperiode_planposition_mapping_ist_idx
  on public.planperiode_planposition_wildklasse (
    planperiode_id,
    planperiode_planposition_id,
    wildklasse_id
  );

create or replace view public.vw_abschussplan_ist
with (security_invoker = true)
as
select
  position.id,
  position.plan_id,
  plan.planperiode_id,
  plan.wildgruppe_id,
  plan.plan_typ,
  plan.jahr,
  position.planperiode_planposition_id,
  snapshot.code,
  snapshot.bezeichnung,
  snapshot.reihenfolge,
  snapshot.aktiv,
  coalesce(position.soll, 0) as soll,
  ist_werte.ist,
  coalesce(position.soll, 0) - ist_werte.ist as rest,
  case
    when coalesce(position.soll, 0) > 0 then
      round(
        ist_werte.ist::numeric * 100
        / position.soll::numeric,
        1
      )
    else 0::numeric
  end as erfuellung_prozent,
  ist_werte.fallwild
from public.abschussplan_positionen position
join public.abschussplaene plan
  on plan.id = position.plan_id
join public.planperioden periode
  on periode.id = plan.planperiode_id
join public.planperiode_planpositionen snapshot
  on snapshot.id = position.planperiode_planposition_id
 and snapshot.planperiode_id = plan.planperiode_id
 and snapshot.wildgruppe_id = plan.wildgruppe_id
cross join lateral (
  select
    count(*) filter (where abschuss.fallwild = false)::bigint as ist,
    count(*) filter (where abschuss.fallwild = true)::bigint as fallwild
  from public.planperiode_planposition_wildklasse mapping
  join public.abschuesse abschuss
    on abschuss.wildklasse_id = mapping.wildklasse_id
   and abschuss.wildgruppe_id = plan.wildgruppe_id
  where mapping.planperiode_id = plan.planperiode_id
    and mapping.planperiode_planposition_id =
      position.planperiode_planposition_id
    and abschuss.datum >= make_date(periode.startjahr, 1, 1)
    and abschuss.datum < make_date(periode.endjahr + 1, 1, 1)
    and (
      plan.plan_typ <> 'INTERN'
      or extract(year from abschuss.datum)::integer = plan.jahr
    )
) ist_werte;

create or replace view public.vw_abschussplan_jahresuebersicht
with (security_invoker = true)
as
select
  auswertung.planperiode_id,
  auswertung.wildgruppe_id,
  wildgruppe.bezeichnung as wildgruppe,
  wildgruppe.reihenfolge,
  sum(auswertung.soll) as soll_kj,
  sum(auswertung.ist) as ist_kj
from public.vw_abschussplan_ist auswertung
join public.wildgruppen wildgruppe
  on wildgruppe.id = auswertung.wildgruppe_id
where auswertung.plan_typ = 'KJ'
group by
  auswertung.planperiode_id,
  auswertung.wildgruppe_id,
  wildgruppe.bezeichnung,
  wildgruppe.reihenfolge;

grant select on public.vw_abschussplan_ist to authenticated;
grant select on public.vw_abschussplan_jahresuebersicht to authenticated;

notify pgrst, 'reload schema';

commit;
