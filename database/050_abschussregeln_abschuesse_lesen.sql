begin;

-- Der Status einer Vorziehung wird reversibel aus den vorhandenen Abschüssen
-- ermittelt. Dazu benötigt die Abschussregel-Übersicht ausschließlich Leserechte.
drop policy if exists freigaben_abschuesse_lesen on public.abschuesse;
create policy freigaben_abschuesse_lesen on public.abschuesse
  for select to authenticated
  using (
    public.app_hat_recht('abschussplan-freigaben', 'Lesen')
    or public.app_hat_recht('abschussregeln', 'Lesen')
  );

notify pgrst, 'reload schema';

commit;
