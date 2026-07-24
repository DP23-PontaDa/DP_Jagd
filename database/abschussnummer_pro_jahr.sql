begin;

-- Vorhandene globale Eindeutigkeit der Abschussnummer entfernen.
alter table public.abschuesse
  drop constraint if exists abschuesse_nr_unique;

-- Auch abweichend benannte UNIQUE-Constraints entfernen, sofern sie
-- ausschließlich die Spalte nr absichern.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.abschuesse'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = c.conrelid
            and a.attname = 'nr'
            and not a.attisdropped
        )
      ]::smallint[]
  loop
    execute format(
      'alter table public.abschuesse drop constraint %I',
      constraint_name
    );
  end loop;
end;
$$;

alter table public.abschuesse
  add column if not exists jahr integer
  generated always as (extract(year from datum)::integer) stored;

alter table public.abschuesse
  drop constraint if exists abschuesse_nr_not_blank;

-- nr war in der ersten Ausbaustufe als Text angelegt. Der alte Text-Constraint
-- muss vor der Typumstellung entfernt werden, da btrim für BIGINT nicht existiert.
-- Die Umstellung ist für gültige Abschussnummern verlustfrei.
alter table public.abschuesse
  alter column nr type bigint
  using btrim(nr::text)::bigint;

alter table public.abschuesse
  drop constraint if exists abschuesse_nr_positive_ganzzahl;

alter table public.abschuesse
  add constraint abschuesse_nr_positive_ganzzahl
  check (nr > 0) not valid;

-- Die Migration verändert keine bestehenden Nummern. Bereits vorhandene
-- Doppelbelegungen innerhalb desselben Jahres müssen vor dem Anlegen des
-- Constraints fachlich bereinigt werden.
do $$
declare
  konflikt record;
begin
  select jahr, nr, count(*) as anzahl
    into konflikt
    from public.abschuesse
   group by jahr, nr
  having count(*) > 1
   limit 1;

  if found then
    raise exception
      'Abschussnummer % ist im Jahr % bereits % mal vorhanden.',
      konflikt.nr,
      konflikt.jahr,
      konflikt.anzahl;
  end if;
end;
$$;

alter table public.abschuesse
  drop constraint if exists abschuesse_jahr_nr_unique;

alter table public.abschuesse
  add constraint abschuesse_jahr_nr_unique
  unique (jahr, nr);

create index if not exists abschuesse_jahr_datum_idx
  on public.abschuesse (jahr, datum desc);

notify pgrst, 'reload schema';

commit;
