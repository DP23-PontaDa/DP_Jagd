begin;

do $$
begin
  if to_regclass('public.abschussplan_positionen') is null
     or to_regclass('public.abschussplaene') is null
     or to_regclass('public.planperiode_planpositionen') is null
     or to_regclass('public.planperiode_planposition_wildklasse') is null then
    raise exception 'Migration 003: Eine benötigte Tabelle fehlt.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'abschussplan_positionen'
      and column_name = 'klasse_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'abschussplan_positionen'
      and column_name = 'planperiode_planposition_id'
  ) then
    raise exception 'Migration 003: Weder klasse_id noch planperiode_planposition_id ist vorhanden.';
  end if;
end;
$$;

alter table public.abschussplan_positionen
  add column if not exists planperiode_planposition_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'abschussplan_positionen'
      and column_name = 'klasse_id'
  ) then
    update public.abschussplan_positionen position
       set planperiode_planposition_id = mapping.planperiode_planposition_id
      from public.abschussplaene plan
      join public.planperiode_planposition_wildklasse mapping
        on mapping.planperiode_id = plan.planperiode_id
     where plan.id = position.plan_id
       and mapping.wildklasse_id = position.klasse_id
       and position.planperiode_planposition_id is null;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.abschussplan_positionen
    where planperiode_planposition_id is null
  ) then
    raise exception 'Migration 003: Nicht alle Abschussplanpositionen konnten zugeordnet werden.';
  end if;

  if exists (
    select 1
    from public.abschussplan_positionen position
    join public.abschussplaene plan on plan.id = position.plan_id
    join public.planperiode_planpositionen snapshot
      on snapshot.id = position.planperiode_planposition_id
    where snapshot.planperiode_id <> plan.planperiode_id
       or snapshot.wildgruppe_id <> plan.wildgruppe_id
  ) then
    raise exception 'Migration 003: Plan und Snapshot-Position gehören nicht zu derselben Periode/Wildgruppe.';
  end if;

  if exists (
    select plan_id, planperiode_planposition_id
    from public.abschussplan_positionen
    group by plan_id, planperiode_planposition_id
    having count(*) > 1
  ) then
    raise exception 'Migration 003: Doppelte Planpositionen innerhalb eines Abschussplans gefunden.';
  end if;
end;
$$;

alter table public.abschussplan_positionen
  drop constraint if exists abschussplan_positionen_planperiode_planposition_fk;

alter table public.abschussplan_positionen
  add constraint abschussplan_positionen_planperiode_planposition_fk
  foreign key (planperiode_planposition_id)
  references public.planperiode_planpositionen (id)
  on update cascade
  on delete restrict;

alter table public.abschussplan_positionen
  alter column planperiode_planposition_id set not null;

create unique index if not exists
  abschussplan_positionen_plan_planposition_unique
  on public.abschussplan_positionen (plan_id, planperiode_planposition_id);

create index if not exists
  abschussplan_positionen_planposition_idx
  on public.abschussplan_positionen (planperiode_planposition_id);

create or replace function public.sperre_aktivierten_planperioden_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  betroffene_planperiode uuid;
  planperioden_status text;
begin
  betroffene_planperiode := case
    when tg_op = 'DELETE' then old.planperiode_id
    else new.planperiode_id
  end;

  select status
    into planperioden_status
    from public.planperioden
   where id = betroffene_planperiode;

  if planperioden_status in ('AKTIV', 'ARCHIV') then
    raise exception
      'Der Snapshot einer aktivierten oder archivierten Planperiode ist unveränderlich.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists planperiode_planpositionen_snapshot_sperre
  on public.planperiode_planpositionen;
create trigger planperiode_planpositionen_snapshot_sperre
before insert or update or delete on public.planperiode_planpositionen
for each row execute function public.sperre_aktivierten_planperioden_snapshot();

drop trigger if exists planperiode_planposition_mapping_snapshot_sperre
  on public.planperiode_planposition_wildklasse;
create trigger planperiode_planposition_mapping_snapshot_sperre
before insert or update or delete on public.planperiode_planposition_wildklasse
for each row execute function public.sperre_aktivierten_planperioden_snapshot();

commit;
