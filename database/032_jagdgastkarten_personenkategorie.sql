begin;

-- Falls die zuvor verworfene 1:n-Tabelle bereits angelegt wurde, darf je Person
-- höchstens ein Kartendatensatz existieren. Nur dann ist eine verlustfreie
-- Rückführung in public.personen möglich.
do $$
declare v_mehrfach integer;
begin
  if to_regclass('public.jagdgastkarten') is not null then
    execute 'select count(*) from (
      select personen_id from public.jagdgastkarten
      group by personen_id having count(*) > 1
    ) mehrfach' into v_mehrfach;
    if v_mehrfach > 0 then
      raise exception 'Korrektur abgebrochen: Für mindestens eine Person bestehen mehrere Jagdgastkarten. Bitte diese vor der Rückführung fachlich auflösen.';
    end if;

    execute 'update public.personen p
      set name_kat = ''Jagdgastkarte'', jagdgastkarte = k.kartennummer
      from public.jagdgastkarten k where k.personen_id = p.id';
    execute 'delete from public.jagdjahre j using public.jagdgastkarten k
      where j.person_id = k.personen_id';
    execute 'insert into public.jagdjahre (person_id, jahr, aktiv, jaeger_gast_id, bemerkung)
      select personen_id, jahr, true, null, '''' from public.jagdgastkarten';
    execute 'drop table public.jagdgastkarten';
  end if;
end;
$$;

-- Frühere Plural-Kategorie auf den verbindlichen Wert vereinheitlichen.
update public.personen
set name_kat = 'Jagdgastkarte'
where name_kat = 'Jagdgastkarten';

-- Personen-Nr. muss über alle Kategorien eindeutig sein.
do $$
declare v_duplikate text;
begin
  select string_agg(personen_nr::text, ', ' order by personen_nr)
  into v_duplikate
  from (
    select personen_nr from public.personen
    where personen_nr is not null
    group by personen_nr having count(*) > 1
  ) d;
  if v_duplikate is not null then
    raise exception 'Personen-Nr. bereits mehrfach vergeben: %', v_duplikate;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.personen'::regclass
      and contype = 'u'
      and conkey = array[(select attnum from pg_attribute
        where attrelid = 'public.personen'::regclass and attname = 'personen_nr')]::smallint[]
  ) then
    alter table public.personen
      add constraint personen_personen_nr_unique unique (personen_nr);
  end if;
end;
$$;

-- Kein eigenes Rechtemodul: Jagdgastkarten verwenden weiterhin Personenrechte.
delete from public.app_rollen_rechte where modul_code = 'jagdgastkarten';
delete from public.app_module where code = 'jagdgastkarten';

notify pgrst, 'reload schema';
commit;
