-- Zahlungseingang für einen Klein-Abschuss direkt am Abschuss pflegen.
-- Es wird ausdrücklich keine Rechnung und keine Rechnungsposition erzeugt.
create or replace function public.set_klein_abschuss_zahlungseingang(
  p_abschuss_id uuid,
  p_zahlungseingang date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_hat_recht('rechnungen', 'Bearbeiten') then
    raise exception 'Keine Berechtigung zum Bearbeiten von Rechnungen.';
  end if;

  if not exists (
    select 1
    from public.abschuesse as a
    join public.wildhaendler as w on w.id = a.wildhaendler_id
    where a.id = p_abschuss_id
      and (
        lower(trim(coalesce(w.code, ''))) = 'klein'
        or lower(trim(coalesce(w.bezeichnung, ''))) in ('klein', 'klein wildhändler')
      )
  ) then
    raise exception 'Der Abschuss wurde nicht gefunden oder gehört nicht zum Wildhändler Klein.';
  end if;

  update public.abschuesse
  set zahlungseingang = p_zahlungseingang
  where id = p_abschuss_id;

  return p_abschuss_id;
end;
$$;

revoke all on function public.set_klein_abschuss_zahlungseingang(uuid, date) from public;
grant execute on function public.set_klein_abschuss_zahlungseingang(uuid, date) to authenticated;
