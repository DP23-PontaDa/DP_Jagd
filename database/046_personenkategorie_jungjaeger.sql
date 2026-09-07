begin;

-- Die zentrale Kategorienquelle wird erweitert. Bestehende Personen bleiben unverändert.
create or replace view public.personen_kategorien as
select *
from (values
  ('Mitglied'::text,       'Mitglied'::text,       10),
  ('Jungjäger'::text,      'Jungjäger'::text,      15),
  ('Jagdgast'::text,       'Jagdgast'::text,       20),
  ('Jagdgastkarte'::text,  'Jagdgastkarte'::text,  25),
  ('Hundefuehrer'::text,   'Hundeführer'::text,    30),
  ('Hegering'::text,       'Hegering'::text,       40),
  ('Wildfleisch'::text,    'Wildfleisch'::text,    50)
) as kategorien(code, bezeichnung, reihenfolge);

grant select on public.personen_kategorien to authenticated;
notify pgrst, 'reload schema';

commit;
