begin;

alter table public.rechnungsvorlagen
  add column if not exists anrede text not null default 'Guten Tag Herr {{Nachname}},',
  add column if not exists zahlungshinweis text not null default 'Die Rechnung ist sofort fällig. Bitte überweisen Sie den Gesamtbetrag ohne Abzüge auf das unten angegebene Konto mit dem Verwendungszweck {{Verwendungszweck}}',
  add column if not exists vereinsname text not null default 'Jagdverein St. Peter/Mitterberg',
  add column if not exists adresse text not null default E'St. Peter 56\n9545 Radenthein\nÖsterreich',
  add column if not exists obmann text not null default 'Daniel Pontasch',
  add column if not exists kassier text not null default 'Thomas Leeb',
  add column if not exists telefon_obmann text not null default '+43 660 7041992',
  add column if not exists telefon_kassier text not null default '+43 676 5617485',
  add column if not exists email text not null default 'Daniel.Pontasch@outlook.com';

alter table public.rechnungspositionen
  drop constraint if exists rechnungspositionen_position_nr_check;
alter table public.rechnungspositionen
  add constraint rechnungspositionen_position_nr_check check (position_nr > 0);

update public.rechnungsvorlagen set
  rechnungsueberschrift = 'Rechnung Wildfleisch',
  anrede = 'Guten Tag Herr {{Nachname}},',
  einleitung = 'wir bedanken uns für die Abnahme des Wildfleisches und stellen Ihnen folgende Positionen in Rechnung.',
  zahlungshinweis = 'Die Rechnung ist sofort fällig. Bitte überweisen Sie den Gesamtbetrag ohne Abzüge auf das unten angegebene Konto mit dem Verwendungszweck {{Verwendungszweck}}',
  schlusstext = 'Mit Waidmannsheil',
  positionstitel = 'Extern',
  vereinsname = 'Jagdverein St. Peter/Mitterberg',
  adresse = E'St. Peter 56\n9545 Radenthein\nÖsterreich',
  obmann = 'Daniel Pontasch',
  kassier = 'Thomas Leeb',
  telefon_obmann = '+43 660 7041992',
  telefon_kassier = '+43 676 5617485',
  email = 'Daniel.Pontasch@outlook.com',
  bank_name = 'Volksbank Kärnten',
  iban = 'AT47 4213 0303 7199 0000',
  bic = '',
  layout = '{"template":"RE_JV_Wildfleisch_2026_18"}'::jsonb
where id = 1;

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
  v_nummer text;
  v_vorlage jsonb;
  v_anzahl integer;
begin
  if p_rechnungsdatum is null or p_person_id is null then
    raise exception 'Rechnungsempfänger und Rechnungsdatum sind erforderlich.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_abschuss_ids, 1), 0) < 1 then
    raise exception 'Es muss mindestens ein Abschuss ausgewählt werden.' using errcode = 'P0001';
  end if;
  if (select count(distinct id) from unnest(p_abschuss_ids) id) <>
     array_length(p_abschuss_ids, 1) then
    raise exception 'Ein Abschuss wurde mehrfach ausgewählt.' using errcode = 'P0001';
  end if;
  select count(*) into v_anzahl
  from public.abschuesse a
  left join public.wildhaendler w on w.id = a.wildhaendler_id
  where a.id = any(p_abschuss_ids) and a.fallwild = false
    and lower(btrim(coalesce(w.bezeichnung, ''))) not in ('klein', 'klein wildhändler');
  if v_anzahl <> array_length(p_abschuss_ids, 1) then
    raise exception 'Fallwild und Abschüsse mit Wildhändler Klein sind nicht verrechenbar.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.rechnungspositionen rp
    where rp.abschuss_id = any(p_abschuss_ids)
      and (p_rechnung_id is null or rp.rechnung_id <> p_rechnung_id)
  ) then
    raise exception 'Mindestens ein Abschuss wurde bereits verrechnet.' using errcode = '23505';
  end if;
  v_jahr := extract(year from p_rechnungsdatum)::integer;
  if p_rechnung_id is null then
    perform pg_advisory_xact_lock(hashtext('rechnungen-' || v_jahr::text));
    select coalesce(max(laufnummer), 0) + 1 into v_laufnummer
    from public.rechnungen where rechnungsjahr = v_jahr;
    select 'JV-Wildfleisch-' || v_jahr || '-' ||
      string_agg(a.nr::text, '-' order by a.datum, a.nr)
      into v_nummer
    from public.abschuesse a where a.id = any(p_abschuss_ids);
    select to_jsonb(v) - 'erstellt_am' - 'geaendert_am' into v_vorlage
    from public.rechnungsvorlagen v where v.id = 1;
    insert into public.rechnungen (
      rechnungsjahr, laufnummer, rechnungsnummer, person_id,
      rechnungsdatum, faellig_am, verwendungszweck, vorlage_snapshot
    ) values (
      v_jahr, v_laufnummer, v_nummer, p_person_id,
      p_rechnungsdatum, p_rechnungsdatum,
      v_nummer, v_vorlage
    ) returning id into v_id;
  else
    v_id := p_rechnung_id;
    update public.rechnungen set person_id = p_person_id,
      rechnungsdatum = p_rechnungsdatum, faellig_am = p_rechnungsdatum
    where id = v_id;
    if not found then raise exception 'Rechnung wurde nicht gefunden.' using errcode = 'P0001'; end if;
    delete from public.rechnungspositionen where rechnung_id = v_id;
  end if;
  insert into public.rechnungspositionen (
    rechnung_id, abschuss_id, position_nr, beschreibung, menge,
    einzelpreis, gesamtpreis, abschuss_nr, abschuss_jahr,
    abschuss_datum, wildgruppe, wildklasse
  )
  select v_id, a.id, row_number() over (order by a.datum, a.nr),
    wg.bezeichnung || ' ' || coalesce((select vorlage_snapshot ->> 'positionstitel'
      from public.rechnungen where id = v_id), 'Extern'),
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

notify pgrst, 'reload schema';
commit;
