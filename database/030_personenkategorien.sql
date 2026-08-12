-- Zentrale, read-only Kategorienquelle fuer Personenimport und -verwaltung.
-- Die gespeicherten Codes entsprechen exakt personen.name_kat.
create or replace view public.personen_kategorien as
select *
from (values
  ('Mitglied'::text,       'Mitglied'::text,       10),
  ('Jagdgast'::text,       'Jagdgast'::text,       20),
  ('Hundefuehrer'::text,   'Hundeführer'::text,   30),
  ('Hegering'::text,       'Hegering'::text,       40),
  ('Wildfleisch'::text,    'Wildfleisch'::text,    50)
) as kategorien(code, bezeichnung, reihenfolge);

grant select on public.personen_kategorien to authenticated;
