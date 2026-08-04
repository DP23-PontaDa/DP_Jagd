begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wildgruppen'
      and column_name = 'abschussplan'
  ) then
    alter table public.wildgruppen
      add column abschussplan boolean not null default false;

    -- Bestehende Wildgruppen mit globalen Planpositionen sind Plan-Wild.
    update public.wildgruppen as wildgruppe
    set abschussplan = true
    where exists (
      select 1
      from public.planpositionen as planposition
      where planposition.wildgruppe_id = wildgruppe.id
    );
  end if;
end;
$$;

commit;
