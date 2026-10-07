begin;

-- Jagdgastkarten werden aktuell als Personen-Datensätze der Kategorie
-- "Jagdgastkarte" geführt. Die Nummer bleibt damit beim einzelnen
-- Karten-Eintrag und wird nicht zwischen anderen Kategorien geteilt.
alter table public.personen
  add column if not exists jagdgastkarte_nr text;

alter table public.personen
  drop constraint if exists personen_jagdgastkarte_nr_laenge_check;

alter table public.personen
  add constraint personen_jagdgastkarte_nr_laenge_check
  check (
    jagdgastkarte_nr is null
    or char_length(btrim(jagdgastkarte_nr)) between 1 and 50
  );

-- Bestehende Kartennummern werden verlustfrei in das neue, ausdrücklich
-- benannte Feld übernommen. Leere historische Werte bleiben weiterhin NULL.
update public.personen
set jagdgastkarte_nr = nullif(btrim(jagdgastkarte), '')
where name_kat = 'Jagdgastkarte'
  and jagdgastkarte_nr is null
  and nullif(btrim(jagdgastkarte), '') is not null;

comment on column public.personen.jagdgastkarte_nr is
  'Kartennummer des einzelnen Jagdgastkarten-Eintrags; Text zur Erhaltung führender Nullen.';

notify pgrst, 'reload schema';

commit;
