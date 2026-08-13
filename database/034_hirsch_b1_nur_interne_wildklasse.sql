begin;

do $$
declare
  v_wildgruppe_id uuid;
  v_hirsch_b_planposition_id uuid;
  v_hirsch_b1_wildklasse_id uuid;
  v_snapshot record;
begin
  select id into v_wildgruppe_id
  from public.wildgruppen
  where lower(btrim(bezeichnung)) = 'rotwild'
  order by reihenfolge, id
  limit 1;

  select id into v_hirsch_b_planposition_id
  from public.planpositionen
  where wildgruppe_id = v_wildgruppe_id
    and lower(btrim(bezeichnung)) = 'hirsch b'
  order by aktiv desc, reihenfolge, id
  limit 1;

  select id into v_hirsch_b1_wildklasse_id
  from public.wildklassen
  where wildgruppe_id = v_wildgruppe_id
    and lower(btrim(bezeichnung)) = 'hirsch b1'
  order by aktiv desc, reihenfolge, id
  limit 1;

  if v_wildgruppe_id is null
     or v_hirsch_b_planposition_id is null
     or v_hirsch_b1_wildklasse_id is null then
    raise exception
      'Migration 034 abgebrochen: Rotwild, Planposition Hirsch B oder Wildklasse Hirsch B1 fehlt.';
  end if;

  -- Hirsch B1 bleibt eine aktive Wildklasse, ist aber ausschließlich der
  -- offiziellen Planposition Hirsch B zugeordnet.
  update public.wildklassen
  set aktiv = true
  where id = v_hirsch_b1_wildklasse_id;

  delete from public.planposition_wildklasse
  where wildklasse_id = v_hirsch_b1_wildklasse_id;

  delete from public.planposition_wildklasse mapping
  using public.planpositionen planposition
  where mapping.planposition_id = planposition.id
    and planposition.wildgruppe_id = v_wildgruppe_id
    and lower(btrim(planposition.bezeichnung)) = 'hirsch b1';

  insert into public.planposition_wildklasse (planposition_id, wildklasse_id)
  values (v_hirsch_b_planposition_id, v_hirsch_b1_wildklasse_id)
  on conflict do nothing;

  -- Für jede bestehende Planperiode die Wildklasse B1 an den offiziellen
  -- Hirsch-B-Snapshot hängen. Dadurch zählen B und B1 gemeinsam in IST,
  -- Rest, Prozent und Fallwild.
  for v_snapshot in
    select snapshot.id, snapshot.planperiode_id
    from public.planperiode_planpositionen snapshot
    join public.planperioden periode
      on periode.id = snapshot.planperiode_id
    where snapshot.planposition_id = v_hirsch_b_planposition_id
      and periode.status <> 'ARCHIV'
  loop
    delete from public.planperiode_planposition_wildklasse
    where planperiode_id = v_snapshot.planperiode_id
      and wildklasse_id = v_hirsch_b1_wildklasse_id;

    insert into public.planperiode_planposition_wildklasse (
      planperiode_id,
      planperiode_planposition_id,
      wildklasse_id,
      wildklasse_code,
      wildklasse_bezeichnung
    ) values (
      v_snapshot.planperiode_id,
      v_snapshot.id,
      v_hirsch_b1_wildklasse_id,
      'HIRSCH_B1',
      'Hirsch B1'
    );

    -- Bereits gespeicherte interne Freigaben bleiben erhalten, werden aber
    -- sicher auf die offizielle Hirsch-B-Snapshotposition ausgerichtet.
    if to_regclass('public.planperiode_wildklasse_freigaben') is not null then
      update public.planperiode_wildklasse_freigaben
      set planperiode_planposition_id = v_snapshot.id,
          geaendert_am = now()
      where planperiode_id = v_snapshot.planperiode_id
        and wildklasse_id = v_hirsch_b1_wildklasse_id;
    end if;
  end loop;

  -- Falsch angelegte offizielle Hirsch-B1-Sollpositionen werden entfernt.
  -- Abschüsse werden nicht berührt, da sie an der Wildklasse hängen.
  delete from public.abschussplan_positionen position
  using public.planperiode_planpositionen snapshot,
        public.planpositionen planposition,
        public.abschussplaene plan,
        public.planperioden periode
  where position.planperiode_planposition_id = snapshot.id
    and snapshot.planposition_id = planposition.id
    and position.plan_id = plan.id
    and plan.planperiode_id = periode.id
    and periode.status <> 'ARCHIV'
    and planposition.wildgruppe_id = v_wildgruppe_id
    and lower(btrim(planposition.bezeichnung)) = 'hirsch b1';

  delete from public.planperiode_planposition_wildklasse mapping
  using public.planperiode_planpositionen snapshot,
        public.planpositionen planposition,
        public.planperioden periode
  where mapping.planperiode_planposition_id = snapshot.id
    and snapshot.planposition_id = planposition.id
    and snapshot.planperiode_id = periode.id
    and periode.status <> 'ARCHIV'
    and planposition.wildgruppe_id = v_wildgruppe_id
    and lower(btrim(planposition.bezeichnung)) = 'hirsch b1';

  delete from public.planperiode_planpositionen snapshot
  using public.planpositionen planposition,
        public.planperioden periode
  where snapshot.planposition_id = planposition.id
    and snapshot.planperiode_id = periode.id
    and periode.status <> 'ARCHIV'
    and planposition.wildgruppe_id = v_wildgruppe_id
    and lower(btrim(planposition.bezeichnung)) = 'hirsch b1';

  -- Archivierte Snapshots bleiben aus Gründen der unveränderlichen Historie
  -- bestehen. Deshalb wird die frühere Stammdatenposition deaktiviert und
  -- nicht gelöscht; für neue und aktive Pläne ist sie damit nicht sichtbar.
  update public.planpositionen
  set aktiv = false
  where wildgruppe_id = v_wildgruppe_id
    and lower(btrim(bezeichnung)) = 'hirsch b1';
end;
$$;

notify pgrst, 'reload schema';
commit;
