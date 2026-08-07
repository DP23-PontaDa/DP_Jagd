begin;

-- Bereits gespeicherte Rechnungen wieder auf das verbindliche Format bringen.
with rechnungswerte as (
  select
    r.id,
    'RE_JV_Wildfleisch_' || r.rechnungsjahr || '_' ||
      string_agg(rp.abschuss_nr::text, '_' order by rp.position_nr) as rechnungsnummer,
    'JV-Wildfleisch-' || r.rechnungsjahr || '-' ||
      string_agg(rp.abschuss_nr::text, '-' order by rp.position_nr) as verwendungszweck
  from public.rechnungen r
  join public.rechnungspositionen rp on rp.rechnung_id = r.id
  group by r.id, r.rechnungsjahr
)
update public.rechnungen r
set
  rechnungsnummer = wert.rechnungsnummer,
  verwendungszweck = wert.verwendungszweck
from rechnungswerte wert
where wert.id = r.id
  and (r.rechnungsnummer is distinct from wert.rechnungsnummer
    or r.verwendungszweck is distinct from wert.verwendungszweck);

create or replace function public.save_rechnung(
  p_rechnung_id uuid,
  p_person_id uuid,
  p_rechnungsdatum date,
  p_abschuss_ids uuid[]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_jahr integer;
  v_laufnummer integer;
  v_rechnungsnummer text;
  v_verwendungszweck text;
  v_vorlage jsonb;
  v_anzahl integer;
begin
  if p_rechnungsdatum is null or p_person_id is null then
    raise exception 'Rechnungsempfänger und Rechnungsdatum sind erforderlich.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_abschuss_ids, 1), 0) not between 1 and 2 then
    raise exception 'Es müssen ein oder zwei Abschüsse ausgewählt werden.' using errcode = 'P0001';
  end if;
  if (select count(distinct id) from unnest(p_abschuss_ids) id) <>
     array_length(p_abschuss_ids, 1) then
    raise exception 'Ein Abschuss wurde mehrfach ausgewählt.' using errcode = 'P0001';
  end if;

  select count(*) into v_anzahl
  from public.abschuesse a
  join public.wildhaendler w on w.id = a.wildhaendler_id
  join public.wildgruppen wg on wg.id = a.wildgruppe_id
  where a.id = any(p_abschuss_ids)
    and a.fallwild = false
    and w.rechnung_moeglich = true
    and wg.rechnung_moeglich = true;
  if v_anzahl <> array_length(p_abschuss_ids, 1) then
    raise exception 'Für mindestens einen Abschuss ist laut Wildgruppe oder Wildhändler keine Rechnung möglich.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.rechnungspositionen rp
    where rp.abschuss_id = any(p_abschuss_ids)
      and (p_rechnung_id is null or rp.rechnung_id <> p_rechnung_id)
  ) then
    raise exception 'Mindestens ein Abschuss wurde bereits verrechnet.' using errcode = '23505';
  end if;

  v_jahr := extract(year from p_rechnungsdatum)::integer;
  select
    'RE_JV_Wildfleisch_' || v_jahr || '_' ||
      string_agg(a.nr::text, '_' order by a.datum, a.nr),
    'JV-Wildfleisch-' || v_jahr || '-' ||
      string_agg(a.nr::text, '-' order by a.datum, a.nr)
  into v_rechnungsnummer, v_verwendungszweck
  from public.abschuesse a
  where a.id = any(p_abschuss_ids);

  if p_rechnung_id is null then
    perform pg_advisory_xact_lock(hashtext('rechnungen-' || v_jahr::text));
    select coalesce(max(laufnummer), 0) + 1 into v_laufnummer
    from public.rechnungen where rechnungsjahr = v_jahr;
    select to_jsonb(v) - 'erstellt_am' - 'geaendert_am' into v_vorlage
    from public.rechnungsvorlagen v where v.id = 1;
    insert into public.rechnungen (
      rechnungsjahr, laufnummer, rechnungsnummer, person_id,
      rechnungsdatum, faellig_am, verwendungszweck, vorlage_snapshot
    ) values (
      v_jahr, v_laufnummer, v_rechnungsnummer, p_person_id,
      p_rechnungsdatum, p_rechnungsdatum + 14,
      v_verwendungszweck, v_vorlage
    ) returning id into v_id;
  else
    v_id := p_rechnung_id;
    update public.rechnungen set
      rechnungsjahr = v_jahr,
      rechnungsnummer = v_rechnungsnummer,
      verwendungszweck = v_verwendungszweck,
      person_id = p_person_id,
      rechnungsdatum = p_rechnungsdatum,
      faellig_am = p_rechnungsdatum + 14
    where id = v_id;
    if not found then
      raise exception 'Rechnung wurde nicht gefunden.' using errcode = 'P0001';
    end if;
    delete from public.rechnungspositionen where rechnung_id = v_id;
  end if;

  insert into public.rechnungspositionen (
    rechnung_id, abschuss_id, position_nr, beschreibung, menge,
    einzelpreis, gesamtpreis, abschuss_nr, abschuss_jahr,
    abschuss_datum, wildgruppe, wildklasse
  )
  select
    v_id, a.id, row_number() over (order by a.datum, a.nr),
    coalesce((select vorlage_snapshot ->> 'positionstitel'
              from public.rechnungen where id = v_id), 'Wildfleisch')
      || ' – ' || wg.bezeichnung || ' – ' || wk.bezeichnung,
    coalesce(a.gewicht, 1),
    case when a.gewicht is not null and a.gewicht > 0
      then round(coalesce(a.gesamtpreis, 0) / a.gewicht, 2)
      else coalesce(a.gesamtpreis, 0) end,
    coalesce(a.gesamtpreis, 0), a.nr, a.jahr, a.datum,
    wg.bezeichnung, wk.bezeichnung
  from public.abschuesse a
  join public.wildgruppen wg on wg.id = a.wildgruppe_id
  join public.wildklassen wk on wk.id = a.wildklasse_id
  where a.id = any(p_abschuss_ids)
  order by a.datum, a.nr;

  update public.rechnungen r set gesamtbetrag = (
    select coalesce(sum(rp.gesamtpreis), 0)
    from public.rechnungspositionen rp where rp.rechnung_id = v_id
  ) where r.id = v_id;
  return v_id;
end;
$$;

grant execute on function public.save_rechnung(uuid, uuid, date, uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
