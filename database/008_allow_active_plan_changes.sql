begin;

do $$
begin
  if to_regclass('public.planperioden') is null
     or to_regclass('public.planperiode_planpositionen') is null
     or to_regclass(
       'public.planperiode_planposition_wildklasse'
     ) is null
     or to_regclass('public.abschussplaene') is null
     or to_regclass('public.abschussplan_positionen') is null then
    raise exception
      'Migration 008 abgebrochen: Benötigte Tabellen fehlen.';
  end if;
end;
$$;

create or replace function public.sperre_aktivierten_planperioden_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  betroffene_planperiode uuid;
  vorherige_planperiode uuid;
  betroffener_plan uuid;
  planperioden_status text;
begin
  if tg_table_name = 'abschussplan_positionen' then
    betroffener_plan := case
      when tg_op = 'DELETE' then old.plan_id
      else new.plan_id
    end;

    select plan.planperiode_id
      into betroffene_planperiode
      from public.abschussplaene plan
     where plan.id = betroffener_plan;

    if tg_op = 'UPDATE' then
      select plan.planperiode_id
        into vorherige_planperiode
        from public.abschussplaene plan
       where plan.id = old.plan_id;
    end if;
  else
    betroffene_planperiode := case
      when tg_op = 'DELETE' then old.planperiode_id
      else new.planperiode_id
    end;

    if tg_op = 'UPDATE' then
      vorherige_planperiode := old.planperiode_id;
    end if;
  end if;

  select status
    into planperioden_status
    from public.planperioden
   where id in (betroffene_planperiode, vorherige_planperiode)
     and status = 'ARCHIV'
   limit 1;

  if planperioden_status is not null then
    raise exception
      'Eine archivierte Planperiode ist vollständig schreibgeschützt.'
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
before insert or update or delete
on public.planperiode_planposition_wildklasse
for each row execute function public.sperre_aktivierten_planperioden_snapshot();

drop trigger if exists abschussplan_positionen_snapshot_sperre
  on public.abschussplan_positionen;
create trigger abschussplan_positionen_snapshot_sperre
before insert or update or delete on public.abschussplan_positionen
for each row execute function public.sperre_aktivierten_planperioden_snapshot();

notify pgrst, 'reload schema';

commit;
