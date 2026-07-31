begin;

do $$
declare
  spalte_vorhanden boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wildhaendler'
      and column_name = 'reihenfolge'
  )
  into spalte_vorhanden;

  if not spalte_vorhanden then
    alter table public.wildhaendler
      add column reihenfolge integer;

    with nummeriert as (
      select
        id,
        row_number() over (
          order by bezeichnung, code, id
        )::integer as neue_reihenfolge
      from public.wildhaendler
    )
    update public.wildhaendler as wildhaendler
    set reihenfolge = nummeriert.neue_reihenfolge
    from nummeriert
    where wildhaendler.id = nummeriert.id;

    alter table public.wildhaendler
      alter column reihenfolge set default 1,
      alter column reihenfolge set not null;
  end if;
end;
$$;

commit;
