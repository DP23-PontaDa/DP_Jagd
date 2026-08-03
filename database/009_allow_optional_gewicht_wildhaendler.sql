begin;

-- Gewicht und Wildhändler sind für reguläre Abschüsse optional.
-- Vorhandene positive Werte und die Fremdschlüsselbeziehung bleiben geschützt.
alter table public.abschuesse
  alter column gewicht drop not null,
  alter column wildhaendler_id drop not null,
  drop constraint if exists abschuesse_gewicht_fachlogik,
  drop constraint if exists abschuesse_wildhaendler_fachlogik;

alter table public.abschuesse
  add constraint abschuesse_gewicht_fachlogik
  check (gewicht is null or gewicht > 0);

notify pgrst, 'reload schema';

commit;
