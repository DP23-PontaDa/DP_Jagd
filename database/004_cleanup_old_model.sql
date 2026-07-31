begin;

-- Die bestehenden Ausgabespalten bleiben aus Kompatibilitätsgründen erhalten.
-- Inhaltlich stammen klasse_code und klasse künftig aus der unveränderlichen
-- Planposition der jeweiligen Planperiode.
create or replace view public.vw_abschussplan_positionen as
select
  ap.id as plan_id,
  pp.bezeichnung as planperiode,
  wg.bezeichnung as wildgruppe,
  ap.plan_typ,
  ap.jahr,
  snapshot.code as klasse_code,
  snapshot.bezeichnung as klasse,
  app.soll
from public.abschussplan_positionen app
join public.abschussplaene ap
  on app.plan_id = ap.id
join public.planperioden pp
  on ap.planperiode_id = pp.id
join public.wildgruppen wg
  on ap.wildgruppe_id = wg.id
join public.planperiode_planpositionen snapshot
  on app.planperiode_planposition_id = snapshot.id
order by
  pp.startjahr desc,
  wg.reihenfolge,
  snapshot.reihenfolge;

do $$
declare
  abhaengige_views text;
begin
  if to_regclass('public.abschussplan_positionen') is null then
    raise exception 'Migration 004: Tabelle abschussplan_positionen fehlt.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'abschussplan_positionen'
      and column_name = 'planperiode_planposition_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'Migration 004: Neue Planpositionsreferenz ist nicht vollständig aktiviert.';
  end if;

  if exists (
    select 1
    from public.abschussplan_positionen
    where planperiode_planposition_id is null
  ) then
    raise exception 'Migration 004: Abschussplanposition ohne neue Referenz gefunden.';
  end if;

  select string_agg(
           format(
             '%I.%I => %s',
             view_schema,
             view_name,
             pg_get_viewdef(format('%I.%I', view_schema, view_name)::regclass, true)
           ),
           E'\n'
         )
    into abhaengige_views
    from (
      select distinct
        view_namespace.nspname as view_schema,
        view_class.relname as view_name
      from pg_depend dependency
      join pg_rewrite rewrite_rule
        on rewrite_rule.oid = dependency.objid
      join pg_class view_class
        on view_class.oid = rewrite_rule.ev_class
       and view_class.relkind in ('v', 'm')
      join pg_namespace view_namespace
        on view_namespace.oid = view_class.relnamespace
      join pg_class source_class
        on source_class.oid = dependency.refobjid
      join pg_namespace source_namespace
        on source_namespace.oid = source_class.relnamespace
      join pg_attribute source_column
        on source_column.attrelid = source_class.oid
       and source_column.attnum = dependency.refobjsubid
      where source_namespace.nspname = 'public'
        and source_class.relname = 'abschussplan_positionen'
        and source_column.attname = 'klasse_id'
    ) views;

  if abhaengige_views is not null then
    raise exception
      E'Migration 004: Abhängige Views müssen zuerst auf planperiode_planposition_id umgestellt werden:\n%',
      abhaengige_views;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'abschussplan_positionen'
      and column_name = 'klasse_id'
  ) then
    alter table public.abschussplan_positionen drop column klasse_id;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.planperiode_wildklassen') is not null then
    if exists (
      select 1
      from pg_constraint con
      where con.contype = 'f'
        and con.confrelid = 'public.planperiode_wildklassen'::regclass
    ) then
      raise exception 'Migration 004: planperiode_wildklassen besitzt noch Fremdschlüsselreferenzen.';
    end if;

    drop table public.planperiode_wildklassen restrict;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
