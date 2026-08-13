begin;

do $$
declare
  v_wildgruppe_id uuid;
  v_planposition_id uuid;
  v_wildklasse_id uuid;
  v_reihenfolge integer;
  v_snapshot record;
begin
  select id into v_wildgruppe_id
  from public.wildgruppen
  where lower(btrim(bezeichnung)) = 'rotwild'
  order by reihenfolge, id limit 1;
  if v_wildgruppe_id is null then
    raise exception 'Migration 033: Wildgruppe Rotwild wurde nicht gefunden.';
  end if;

  select id into v_planposition_id
  from public.planpositionen
  where wildgruppe_id = v_wildgruppe_id
    and lower(btrim(bezeichnung)) = 'hirsch b'
  order by aktiv desc, reihenfolge, id limit 1;
  if v_planposition_id is null then
    raise exception 'Migration 033: Planposition Hirsch B wurde nicht gefunden.';
  end if;

  select id into v_wildklasse_id
  from public.wildklassen
  where wildgruppe_id = v_wildgruppe_id
    and lower(btrim(bezeichnung)) = 'hirsch b1'
  order by aktiv desc, reihenfolge, id limit 1;

  if v_wildklasse_id is null then
    select coalesce(max(reihenfolge), 0) + 1 into v_reihenfolge
    from public.wildklassen where wildgruppe_id = v_wildgruppe_id;
    insert into public.wildklassen
      (wildgruppe_id, code, bezeichnung, reihenfolge, aktiv)
    values
      (v_wildgruppe_id, 'HIRSCH_B1', 'Hirsch B1', v_reihenfolge, true)
    returning id into v_wildklasse_id;
  else
    update public.wildklassen set aktiv = true where id = v_wildklasse_id;
  end if;

  delete from public.planposition_wildklasse
  where wildklasse_id = v_wildklasse_id and planposition_id <> v_planposition_id;
  insert into public.planposition_wildklasse (planposition_id, wildklasse_id)
  values (v_planposition_id, v_wildklasse_id)
  on conflict do nothing;

  for v_snapshot in
    select snapshot.id, snapshot.planperiode_id
    from public.planperiode_planpositionen snapshot
    join public.planperioden periode on periode.id = snapshot.planperiode_id
    where snapshot.planposition_id = v_planposition_id
      and snapshot.aktiv = true
      and periode.status = 'AKTIV'
  loop
    delete from public.planperiode_planposition_wildklasse
    where planperiode_id = v_snapshot.planperiode_id
      and wildklasse_id = v_wildklasse_id
      and planperiode_planposition_id <> v_snapshot.id;
    insert into public.planperiode_planposition_wildklasse (
      planperiode_id, planperiode_planposition_id, wildklasse_id,
      wildklasse_code, wildklasse_bezeichnung
    ) values (
      v_snapshot.planperiode_id, v_snapshot.id, v_wildklasse_id,
      'HIRSCH_B1', 'Hirsch B1'
    ) on conflict do nothing;
  end loop;
end;
$$;

create table if not exists public.planperiode_wildklasse_freigaben (
  id uuid primary key default gen_random_uuid(),
  planperiode_id uuid not null references public.planperioden(id) on delete cascade,
  planperiode_planposition_id uuid not null references public.planperiode_planpositionen(id) on delete cascade,
  wildklasse_id uuid not null references public.wildklassen(id),
  jahr integer not null check (jahr between 1900 and 2999),
  interne_freigabe integer not null default 0 check (interne_freigabe >= 0),
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  unique (planperiode_id, wildklasse_id, jahr)
);

create index if not exists planperiode_wildklasse_freigaben_periode_idx
  on public.planperiode_wildklasse_freigaben(planperiode_id, jahr);

alter table public.planperiode_wildklasse_freigaben enable row level security;
drop policy if exists planperiode_wildklasse_freigaben_lesen on public.planperiode_wildklasse_freigaben;
create policy planperiode_wildklasse_freigaben_lesen
  on public.planperiode_wildklasse_freigaben for select to authenticated using (true);
drop policy if exists planperiode_wildklasse_freigaben_schreiben on public.planperiode_wildklasse_freigaben;
create policy planperiode_wildklasse_freigaben_schreiben
  on public.planperiode_wildklasse_freigaben for all to authenticated
  using (true) with check (true);
grant select, insert, update, delete on public.planperiode_wildklasse_freigaben to authenticated;

notify pgrst, 'reload schema';
commit;
