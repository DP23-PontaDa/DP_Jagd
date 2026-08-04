begin;

alter table public.abschussplan_positionen
  add column if not exists ist_reviere_startjahr integer not null default 0
    check (ist_reviere_startjahr >= 0),
  add column if not exists ist_reviere_endjahr integer not null default 0
    check (ist_reviere_endjahr >= 0);

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
  coalesce(position.soll, 0)
    - ist_werte.ist
    - coalesce(position.ist_reviere_startjahr, 0)
    - coalesce(position.ist_reviere_endjahr, 0) as rest,
  case
    when coalesce(position.soll, 0) > 0 then
      round(
        (
          ist_werte.ist
          + coalesce(position.ist_reviere_startjahr, 0)
          + coalesce(position.ist_reviere_endjahr, 0)
        )::numeric * 100 / position.soll::numeric,
        1
      )
    else 0::numeric
  end as erfuellung_prozent,
  ist_werte.fallwild,
  coalesce(position.ist_reviere_startjahr, 0) as ist_reviere_startjahr,
  coalesce(position.ist_reviere_endjahr, 0) as ist_reviere_endjahr
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

grant select on public.vw_abschussplan_ist to authenticated;

notify pgrst, 'reload schema';

commit;
