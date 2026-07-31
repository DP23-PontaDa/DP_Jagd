begin;

do $$
begin
  if to_regclass('public.planperiode_planpositionen') is null
     or to_regclass(
       'public.planperiode_planposition_wildklasse'
     ) is null then
    raise exception
      'Migration 007 abgebrochen: Die Tabellen des Planperioden-Snapshots fehlen.';
  end if;

  if to_regprocedure(
    'public.sperre_aktivierten_planperioden_snapshot()'
  ) is null then
    raise exception
      'Migration 007 abgebrochen: Die bestehende Snapshot-Sperrfunktion fehlt.';
  end if;

  if not exists (
    select 1
    from pg_trigger tg
    join pg_class tabelle
      on tabelle.oid = tg.tgrelid
    join pg_namespace schema
      on schema.oid = tabelle.relnamespace
    where schema.nspname = 'public'
      and tabelle.relname = 'planperiode_planpositionen'
      and tg.tgname =
        'planperiode_planpositionen_snapshot_sperre'
      and not tg.tgisinternal
  ) then
    raise exception
      'Migration 007 abgebrochen: Die Sperre für Planpositionen ist nicht vorhanden.';
  end if;
end;
$$;

-- Planpositionen selbst bleiben unveränderlich, sobald ihre Planperiode
-- aktiv oder archiviert ist. Nur das fachliche Wildklassen-Mapping wird
-- für nachträgliche Korrekturen freigegeben.
drop trigger if exists
  planperiode_planposition_mapping_snapshot_sperre
  on public.planperiode_planposition_wildklasse;

notify pgrst, 'reload schema';

commit;
