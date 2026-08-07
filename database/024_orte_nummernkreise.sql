begin;

-- Bestehende Datensätze werden niemals automatisch umnummeriert. Die
-- Migration meldet unzulässige Nummern und beendet sich vor der Constraint.
do $$
declare
  v_anzahl bigint;
  v_beispiele text;
begin
  select count(*)
    into v_anzahl
  from public.orte
  where reviereinrichtung is null
     or nr is null
     or (reviereinrichtung = true and (nr < 1 or nr >= 501))
     or (reviereinrichtung = false and nr < 501);

  if v_anzahl > 0 then
    select string_agg(format('ID %s: Nr. %s (%s)', id, nr,
      case
        when reviereinrichtung = true then 'Reviereinrichtung'
        when reviereinrichtung = false then 'Abschussort'
        else 'Typ fehlt'
      end), E'\n')
      into v_beispiele
    from (
      select id, nr, reviereinrichtung
      from public.orte
      where reviereinrichtung is null
         or nr is null
         or (reviereinrichtung = true and (nr < 1 or nr >= 501))
         or (reviereinrichtung = false and nr < 501)
      order by nr, id
      limit 20
    ) ungueltig;

    raise exception using
      errcode = 'P0001',
      message = format(
        'Migration 024 abgebrochen: %s Ort(e) liegen außerhalb des neuen Nummernkreises.',
        v_anzahl
      ),
      detail = v_beispiele,
      hint = 'Bestandsdaten fachlich prüfen. Es wurde keine Nummer automatisch verändert.';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orte'::regclass
      and conname = 'orte_nummernkreis_check'
  ) then
    alter table public.orte
      add constraint orte_nummernkreis_check check (
        nr is not null
        and (
          (reviereinrichtung is true and nr between 1 and 500)
          or
          (reviereinrichtung is false and nr >= 501)
        )
      );
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
