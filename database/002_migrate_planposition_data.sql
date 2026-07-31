begin;

do $$
declare
  fehlende_tabellen text;
  fehlende_spalten text;
begin
  select string_agg('public.' || erwartet.name, ', ' order by erwartet.name)
    into fehlende_tabellen
    from (
      values
        ('wildklassen'),
        ('planperiode_wildklassen'),
        ('planpositionen'),
        ('planposition_wildklasse'),
        ('planperiode_planpositionen'),
        ('planperiode_planposition_wildklasse')
    ) erwartet(name)
   where to_regclass('public.' || erwartet.name) is null;

  if fehlende_tabellen is not null then
    raise exception
      'Migration 002 abgebrochen. Fehlende Tabellen: %',
      fehlende_tabellen;
  end if;

  select string_agg(
           'public.' || erwartet.tabelle || '.' || erwartet.spalte,
           ', '
           order by erwartet.tabelle, erwartet.spalte
         )
    into fehlende_spalten
    from (
      values
        ('wildklassen', 'id'),
        ('wildklassen', 'wildgruppe_id'),
        ('wildklassen', 'code'),
        ('wildklassen', 'bezeichnung'),
        ('wildklassen', 'reihenfolge'),
        ('wildklassen', 'aktiv'),
        ('planperiode_wildklassen', 'id'),
        ('planperiode_wildklassen', 'planperiode_id'),
        ('planperiode_wildklassen', 'wildklasse_id'),
        ('planperiode_wildklassen', 'aktiv'),
        ('planperiode_wildklassen', 'reihenfolge'),
        ('planpositionen', 'id'),
        ('planpositionen', 'wildgruppe_id'),
        ('planpositionen', 'code'),
        ('planpositionen', 'bezeichnung'),
        ('planpositionen', 'reihenfolge'),
        ('planpositionen', 'aktiv'),
        ('planposition_wildklasse', 'id'),
        ('planposition_wildklasse', 'planposition_id'),
        ('planposition_wildklasse', 'wildklasse_id'),
        ('planperiode_planpositionen', 'id'),
        ('planperiode_planpositionen', 'planperiode_id'),
        ('planperiode_planpositionen', 'planposition_id'),
        ('planperiode_planpositionen', 'wildgruppe_id'),
        ('planperiode_planpositionen', 'code'),
        ('planperiode_planpositionen', 'bezeichnung'),
        ('planperiode_planpositionen', 'aktiv'),
        ('planperiode_planpositionen', 'reihenfolge'),
        ('planperiode_planpositionen', 'quelle_planperiode_wildklasse_id'),
        ('planperiode_planposition_wildklasse', 'id'),
        ('planperiode_planposition_wildklasse', 'planperiode_id'),
        ('planperiode_planposition_wildklasse', 'planperiode_planposition_id'),
        ('planperiode_planposition_wildklasse', 'wildklasse_id'),
        ('planperiode_planposition_wildklasse', 'wildklasse_code'),
        ('planperiode_planposition_wildklasse', 'wildklasse_bezeichnung')
    ) erwartet(tabelle, spalte)
    left join information_schema.columns vorhanden
      on vorhanden.table_schema = 'public'
     and vorhanden.table_name = erwartet.tabelle
     and vorhanden.column_name = erwartet.spalte
   where vorhanden.column_name is null;

  if fehlende_spalten is not null then
    raise exception
      'Migration 002 abgebrochen. Fehlende Spalten: %',
      fehlende_spalten;
  end if;
end;
$$;

insert into public.planpositionen (
  wildgruppe_id,
  code,
  bezeichnung,
  reihenfolge,
  aktiv
)
select
  wk.wildgruppe_id,
  wk.code,
  wk.bezeichnung,
  wk.reihenfolge,
  wk.aktiv
from public.wildklassen wk
where not exists (
  select 1
  from public.planpositionen pp
  where pp.wildgruppe_id = wk.wildgruppe_id
    and pp.code = wk.code
);

do $$
begin
  if exists (
    select 1
    from public.wildklassen wk
    left join public.planpositionen pp
      on pp.wildgruppe_id = wk.wildgruppe_id
     and pp.code = wk.code
    where pp.id is null
  ) then
    raise exception 'Migration 002: Nicht jede Wildklasse besitzt eine Planposition.';
  end if;

  if (select count(*) from public.wildklassen)
     <> (select count(*) from public.planpositionen) then
    raise exception
      'Migration 002: Anzahl Wildklassen (%) entspricht nicht Anzahl Planpositionen (%).',
      (select count(*) from public.wildklassen),
      (select count(*) from public.planpositionen);
  end if;
end;
$$;

insert into public.planposition_wildklasse (
  planposition_id,
  wildklasse_id
)
select
  pp.id,
  wk.id
from public.wildklassen wk
join public.planpositionen pp
  on pp.wildgruppe_id = wk.wildgruppe_id
 and pp.code = wk.code
where not exists (
  select 1
  from public.planposition_wildklasse mapping
  where mapping.planposition_id = pp.id
    and mapping.wildklasse_id = wk.id
);

do $$
begin
  if exists (
    select 1
    from public.wildklassen wk
    join public.planpositionen pp
      on pp.wildgruppe_id = wk.wildgruppe_id
     and pp.code = wk.code
    left join public.planposition_wildklasse mapping
      on mapping.planposition_id = pp.id
     and mapping.wildklasse_id = wk.id
    where mapping.id is null
  ) then
    raise exception 'Migration 002: Das globale 1:1-Mapping ist unvollständig.';
  end if;

  if exists (
    select planposition_id, wildklasse_id
    from public.planposition_wildklasse
    group by planposition_id, wildklasse_id
    having count(*) > 1
  ) then
    raise exception 'Migration 002: Doppelte globale Mappings gefunden.';
  end if;

  if exists (
    select 1
    from public.planposition_wildklasse
    where planposition_id is null or wildklasse_id is null
  ) then
    raise exception 'Migration 002: NULL-Fremdschlüssel im globalen Mapping gefunden.';
  end if;
end;
$$;

insert into public.planperiode_planpositionen (
  planperiode_id,
  planposition_id,
  wildgruppe_id,
  code,
  bezeichnung,
  aktiv,
  reihenfolge,
  quelle_planperiode_wildklasse_id
)
select
  pw.planperiode_id,
  pp.id,
  wk.wildgruppe_id,
  wk.code,
  wk.bezeichnung,
  pw.aktiv,
  pw.reihenfolge,
  pw.id
from public.planperiode_wildklassen pw
join public.wildklassen wk on wk.id = pw.wildklasse_id
join public.planpositionen pp
  on pp.wildgruppe_id = wk.wildgruppe_id
 and pp.code = wk.code
where not exists (
  select 1
  from public.planperiode_planpositionen snapshot
  where snapshot.quelle_planperiode_wildklasse_id = pw.id
);

do $$
begin
  if (select count(*) from public.planperiode_wildklassen)
     <> (select count(*) from public.planperiode_planpositionen) then
    raise exception
      'Migration 002: Anzahl Planperiode-Wildklassen (%) entspricht nicht Anzahl Snapshot-Positionen (%).',
      (select count(*) from public.planperiode_wildklassen),
      (select count(*) from public.planperiode_planpositionen);
  end if;

  if exists (
    select planperiode_id, planposition_id
    from public.planperiode_planpositionen
    group by planperiode_id, planposition_id
    having count(*) > 1
  ) then
    raise exception 'Migration 002: Doppelte Snapshot-Positionen gefunden.';
  end if;

  if exists (
    select 1
    from public.planperiode_planpositionen
    where planperiode_id is null
       or planposition_id is null
       or wildgruppe_id is null
       or quelle_planperiode_wildklasse_id is null
  ) then
    raise exception 'Migration 002: NULL-Fremdschlüssel in Snapshot-Positionen gefunden.';
  end if;
end;
$$;

insert into public.planperiode_planposition_wildklasse (
  planperiode_id,
  planperiode_planposition_id,
  wildklasse_id,
  wildklasse_code,
  wildklasse_bezeichnung
)
select
  snapshot.planperiode_id,
  snapshot.id,
  wk.id,
  wk.code,
  wk.bezeichnung
from public.planperiode_planpositionen snapshot
join public.planperiode_wildklassen pw
  on pw.id = snapshot.quelle_planperiode_wildklasse_id
join public.wildklassen wk on wk.id = pw.wildklasse_id
where not exists (
  select 1
  from public.planperiode_planposition_wildklasse mapping
  where mapping.planperiode_planposition_id = snapshot.id
    and mapping.wildklasse_id = wk.id
);

do $$
begin
  if (select count(*) from public.planperiode_planposition_wildklasse)
     <> (select count(*) from public.planperiode_planpositionen) then
    raise exception
      'Migration 002: Anzahl Snapshot-Mappings (%) entspricht nicht Anzahl Snapshot-Positionen (%).',
      (select count(*) from public.planperiode_planposition_wildklasse),
      (select count(*) from public.planperiode_planpositionen);
  end if;

  if exists (
    select 1
    from public.planperiode_planpositionen snapshot
    left join public.planperiode_planposition_wildklasse mapping
      on mapping.planperiode_planposition_id = snapshot.id
    where mapping.id is null
  ) then
    raise exception 'Migration 002: Snapshot-Position ohne Mapping gefunden.';
  end if;

  if exists (
    select 1
    from public.planperiode_planposition_wildklasse mapping
    left join public.planperiode_planpositionen snapshot
      on snapshot.id = mapping.planperiode_planposition_id
    where snapshot.id is null
  ) then
    raise exception 'Migration 002: Mapping ohne Snapshot-Position gefunden.';
  end if;

  if exists (
    select 1
    from public.planperiode_planposition_wildklasse
    where planperiode_id is null
       or planperiode_planposition_id is null
       or wildklasse_id is null
  ) then
    raise exception 'Migration 002: NULL-Fremdschlüssel im Snapshot-Mapping gefunden.';
  end if;

  if exists (
    select planperiode_planposition_id, wildklasse_id
    from public.planperiode_planposition_wildklasse
    group by planperiode_planposition_id, wildklasse_id
    having count(*) > 1
  ) then
    raise exception 'Migration 002: Doppelte Snapshot-Mappings gefunden.';
  end if;

  if exists (
    select planperiode_id, wildklasse_id
    from public.planperiode_planposition_wildklasse
    group by planperiode_id, wildklasse_id
    having count(*) > 1
  ) then
    raise exception 'Migration 002: Eine Wildklasse ist innerhalb einer Planperiode mehrfach zugeordnet.';
  end if;
end;
$$;

create unique index if not exists
  planpositionen_wildgruppe_code_unique
  on public.planpositionen (wildgruppe_id, code);

create unique index if not exists
  planposition_wildklasse_pair_unique
  on public.planposition_wildklasse (planposition_id, wildklasse_id);

create unique index if not exists
  planperiode_planpositionen_periode_position_unique
  on public.planperiode_planpositionen (planperiode_id, planposition_id);

create unique index if not exists
  planperiode_planpositionen_quelle_unique
  on public.planperiode_planpositionen (quelle_planperiode_wildklasse_id);

create unique index if not exists
  planperiode_planposition_mapping_pair_unique
  on public.planperiode_planposition_wildklasse (
    planperiode_planposition_id,
    wildklasse_id
  );

create unique index if not exists
  planperiode_planposition_mapping_periode_klasse_unique
  on public.planperiode_planposition_wildklasse (
    planperiode_id,
    wildklasse_id
  );

commit;
