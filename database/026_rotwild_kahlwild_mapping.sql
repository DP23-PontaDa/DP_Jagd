begin;

-- Kahlwild bleibt eine Planposition. Für die Abschusserfassung werden ihr
-- die vier tatsächlichen Wildklassen zugeordnet. Historische Snapshots werden
-- ausdrücklich nicht verändert.
do $$
declare
  v_wildgruppe_id uuid;
  v_planposition_id uuid;
  v_anzahl integer;
  v_snapshot record;
begin
  select id
    into v_wildgruppe_id
  from public.wildgruppen
  where lower(btrim(bezeichnung)) = 'rotwild'
     or upper(btrim(code)) = 'RW'
  order by case when lower(btrim(bezeichnung)) = 'rotwild' then 0 else 1 end
  limit 1;

  if v_wildgruppe_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Migration 026 abgebrochen: Wildgruppe Rotwild wurde nicht gefunden.';
  end if;

  select id
    into v_planposition_id
  from public.planpositionen
  where wildgruppe_id = v_wildgruppe_id
    and lower(btrim(bezeichnung)) = 'kahlwild'
  order by aktiv desc, reihenfolge, id
  limit 1;

  if v_planposition_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Migration 026 abgebrochen: Rotwild-Planposition Kahlwild wurde nicht gefunden.';
  end if;

  select count(*)
    into v_anzahl
  from public.wildklassen
  where wildgruppe_id = v_wildgruppe_id
    and aktiv = true
    and lower(btrim(bezeichnung)) in (
      'tier', 'schmaltier', 'kalb männlich', 'kalb weiblich'
    );

  if v_anzahl <> 4 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Migration 026 abgebrochen: Erwartet wurden 4 aktive Kahlwild-Wildklassen, gefunden wurden %s.',
        v_anzahl
      ),
      hint = 'Erforderlich: Tier, Schmaltier, Kalb männlich und Kalb weiblich.';
  end if;

  -- Globale Vorlage für künftig angelegte Planperioden korrigieren.
  delete from public.planposition_wildklasse mapping
  using public.wildklassen wildklasse
  where mapping.wildklasse_id = wildklasse.id
    and mapping.planposition_id <> v_planposition_id
    and wildklasse.wildgruppe_id = v_wildgruppe_id
    and lower(btrim(wildklasse.bezeichnung)) in (
      'tier', 'schmaltier', 'kalb männlich', 'kalb weiblich'
    );

  delete from public.planposition_wildklasse
  where planposition_id = v_planposition_id;

  insert into public.planposition_wildklasse (
    planposition_id,
    wildklasse_id
  )
  select v_planposition_id, wildklasse.id
  from public.wildklassen wildklasse
  where wildklasse.wildgruppe_id = v_wildgruppe_id
    and wildklasse.aktiv = true
    and lower(btrim(wildklasse.bezeichnung)) in (
      'tier', 'schmaltier', 'kalb männlich', 'kalb weiblich'
    )
  order by wildklasse.reihenfolge, wildklasse.code;

  -- Nur Snapshot-Mappings aktuell aktiver Planperioden anpassen.
  for v_snapshot in
    select snapshot.id, snapshot.planperiode_id
    from public.planperiode_planpositionen snapshot
    join public.planperioden periode
      on periode.id = snapshot.planperiode_id
    where snapshot.planposition_id = v_planposition_id
      and snapshot.wildgruppe_id = v_wildgruppe_id
      and snapshot.aktiv = true
      and periode.status = 'AKTIV'
  loop
    -- Dieselbe Wildklasse darf innerhalb einer Planperiode nur einmal
    -- zugeordnet sein. Eventuelle alte Zuordnungen werden fachlich auf die
    -- Sammelposition Kahlwild verschoben.
    delete from public.planperiode_planposition_wildklasse mapping
    using public.wildklassen wildklasse
    where mapping.planperiode_id = v_snapshot.planperiode_id
      and mapping.wildklasse_id = wildklasse.id
      and wildklasse.wildgruppe_id = v_wildgruppe_id
      and lower(btrim(wildklasse.bezeichnung)) in (
        'tier', 'schmaltier', 'kalb männlich', 'kalb weiblich'
      );

    delete from public.planperiode_planposition_wildklasse
    where planperiode_id = v_snapshot.planperiode_id
      and planperiode_planposition_id = v_snapshot.id;

    insert into public.planperiode_planposition_wildklasse (
      planperiode_id,
      planperiode_planposition_id,
      wildklasse_id,
      wildklasse_code,
      wildklasse_bezeichnung
    )
    select
      v_snapshot.planperiode_id,
      v_snapshot.id,
      wildklasse.id,
      wildklasse.code,
      wildklasse.bezeichnung
    from public.wildklassen wildklasse
    where wildklasse.wildgruppe_id = v_wildgruppe_id
      and wildklasse.aktiv = true
      and lower(btrim(wildklasse.bezeichnung)) in (
        'tier', 'schmaltier', 'kalb männlich', 'kalb weiblich'
      )
    order by wildklasse.reihenfolge, wildklasse.code;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
