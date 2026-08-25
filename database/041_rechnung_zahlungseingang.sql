-- Zahlungseingang einer Rechnung an der fachlich führenden Quelle pflegen:
-- allen über Rechnungspositionen verknüpften Abschüssen.
create or replace function public.set_rechnung_zahlungseingang(
  p_rechnung_id uuid,
  p_zahlungseingang date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anzahl integer;
begin
  if not public.app_hat_recht('rechnungen', 'Bearbeiten') then
    raise exception 'Keine Berechtigung zum Bearbeiten von Rechnungen.';
  end if;

  if not exists (
    select 1 from public.rechnungen where id = p_rechnung_id
  ) then
    raise exception 'Die Rechnung wurde nicht gefunden.';
  end if;

  if not exists (
    select 1
    from public.rechnungspositionen
    where rechnung_id = p_rechnung_id
  ) then
    raise exception 'Die Rechnung enthält keine verknüpften Abschüsse.';
  end if;

  update public.abschuesse as a
  set zahlungseingang = p_zahlungseingang
  where exists (
    select 1
    from public.rechnungspositionen as rp
    where rp.rechnung_id = p_rechnung_id
      and rp.abschuss_id = a.id
  );

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function public.set_rechnung_zahlungseingang(uuid, date) from public;
grant execute on function public.set_rechnung_zahlungseingang(uuid, date) to authenticated;
