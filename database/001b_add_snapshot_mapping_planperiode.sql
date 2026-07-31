begin;

do $$
begin
  if to_regclass('public.planperioden') is null
     or to_regclass('public.planperiode_planpositionen') is null
     or to_regclass('public.planperiode_planposition_wildklasse') is null then
    raise exception
      'Migration 001b abgebrochen: Eine benötigte Tabelle fehlt.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planperiode_planpositionen'
      and column_name = 'planperiode_id'
  ) then
    raise exception
      'Migration 001b abgebrochen: planperiode_planpositionen.planperiode_id fehlt.';
  end if;
end;
$$;

alter table public.planperiode_planposition_wildklasse
  add column if not exists planperiode_id uuid;

update public.planperiode_planposition_wildklasse mapping
   set planperiode_id = snapshot.planperiode_id
  from public.planperiode_planpositionen snapshot
 where snapshot.id = mapping.planperiode_planposition_id
   and mapping.planperiode_id is null;

do $$
begin
  if exists (
    select 1
    from public.planperiode_planposition_wildklasse mapping
    left join public.planperiode_planpositionen snapshot
      on snapshot.id = mapping.planperiode_planposition_id
    where snapshot.id is null
       or mapping.planperiode_id is null
       or mapping.planperiode_id <> snapshot.planperiode_id
  ) then
    raise exception
      'Migration 001b abgebrochen: Snapshot-Mapping kann keiner eindeutigen Planperiode zugeordnet werden.';
  end if;
end;
$$;

create unique index if not exists
  planperiode_planpositionen_id_periode_unique
  on public.planperiode_planpositionen (id, planperiode_id);

alter table public.planperiode_planposition_wildklasse
  drop constraint if exists
    planperiode_planposition_mapping_snapshot_periode_fk;

alter table public.planperiode_planposition_wildklasse
  add constraint planperiode_planposition_mapping_snapshot_periode_fk
  foreign key (planperiode_planposition_id, planperiode_id)
  references public.planperiode_planpositionen (id, planperiode_id)
  on update cascade
  on delete cascade;

alter table public.planperiode_planposition_wildklasse
  drop constraint if exists
    planperiode_planposition_mapping_planperiode_fk;

alter table public.planperiode_planposition_wildklasse
  add constraint planperiode_planposition_mapping_planperiode_fk
  foreign key (planperiode_id)
  references public.planperioden (id)
  on update cascade
  on delete cascade;

alter table public.planperiode_planposition_wildklasse
  alter column planperiode_id set not null;

create index if not exists
  planperiode_planposition_mapping_planperiode_idx
  on public.planperiode_planposition_wildklasse (planperiode_id);

commit;
