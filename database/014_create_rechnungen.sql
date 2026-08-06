begin;

create table if not exists public.rechnungsvorlagen (
  id smallint primary key default 1 check (id = 1),
  rechnungsueberschrift text not null default 'Rechnung Wildfleisch',
  einleitung text not null default 'Wir erlauben uns, folgende Lieferung in Rechnung zu stellen:',
  schlusstext text not null default 'Vielen Dank für Ihren Einkauf.',
  fusszeile text not null default '',
  positionstitel text not null default 'Wildfleisch',
  absender_name text not null default '',
  absender_adresse text not null default '',
  absender_plz_ort text not null default '',
  iban text not null default '',
  bic text not null default '',
  bank_name text not null default '',
  layout jsonb not null default '{"primaryColor":"#167c68"}'::jsonb,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

insert into public.rechnungsvorlagen (id) values (1)
on conflict (id) do nothing;

create table if not exists public.rechnungen (
  id uuid primary key default gen_random_uuid(),
  rechnungsjahr integer not null,
  laufnummer integer not null check (laufnummer > 0),
  rechnungsnummer text not null,
  person_id uuid not null references public.personen(id) on delete restrict,
  rechnungsdatum date not null,
  faellig_am date not null,
  verwendungszweck text not null,
  gesamtbetrag numeric(12,2) not null default 0 check (gesamtbetrag >= 0),
  vorlage_snapshot jsonb not null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  constraint rechnungen_jahr_laufnummer_unique unique (rechnungsjahr, laufnummer),
  constraint rechnungen_nummer_unique unique (rechnungsnummer)
);

create table if not exists public.rechnungspositionen (
  id uuid primary key default gen_random_uuid(),
  rechnung_id uuid not null references public.rechnungen(id) on delete cascade,
  abschuss_id uuid not null references public.abschuesse(id) on delete restrict,
  position_nr smallint not null check (position_nr between 1 and 2),
  beschreibung text not null,
  menge numeric(10,2) not null default 1 check (menge >= 0),
  einzelpreis numeric(12,2) not null default 0 check (einzelpreis >= 0),
  gesamtpreis numeric(12,2) not null default 0 check (gesamtpreis >= 0),
  abschuss_nr bigint not null,
  abschuss_jahr integer not null,
  abschuss_datum date not null,
  wildgruppe text not null,
  wildklasse text not null,
  erstellt_am timestamptz not null default now(),
  constraint rechnungspositionen_rechnung_position_unique
    unique (rechnung_id, position_nr),
  constraint rechnungspositionen_abschuss_unique unique (abschuss_id)
);

create or replace function public.rechnung_set_geaendert_am()
returns trigger language plpgsql as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists rechnungen_set_geaendert_am on public.rechnungen;
create trigger rechnungen_set_geaendert_am before update on public.rechnungen
for each row execute function public.rechnung_set_geaendert_am();

drop trigger if exists rechnungsvorlagen_set_geaendert_am on public.rechnungsvorlagen;
create trigger rechnungsvorlagen_set_geaendert_am
before update on public.rechnungsvorlagen
for each row execute function public.rechnung_set_geaendert_am();

create or replace function public.rechnungsposition_abschuss_pruefen()
returns trigger language plpgsql as $$
declare
  ungueltig boolean;
begin
  select a.fallwild = true or
         lower(btrim(coalesce(w.bezeichnung, ''))) in ('klein', 'klein wildhändler')
    into ungueltig
    from public.abschuesse a
    left join public.wildhaendler w on w.id = a.wildhaendler_id
   where a.id = new.abschuss_id;
  if ungueltig is null then
    raise exception 'Der ausgewählte Abschuss wurde nicht gefunden.' using errcode = 'P0001';
  end if;
  if ungueltig then
    raise exception 'Für Fallwild oder Wildhändler Klein darf keine Rechnung erstellt werden.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists rechnungsposition_abschuss_pruefen
  on public.rechnungspositionen;
create trigger rechnungsposition_abschuss_pruefen
before insert or update of abschuss_id on public.rechnungspositionen
for each row execute function public.rechnungsposition_abschuss_pruefen();

create or replace function public.rechnung_iso11649_reference(p_wert text)
returns text language plpgsql immutable as $$
declare
  v_basis text := left(regexp_replace(upper(coalesce(p_wert, 'RECHNUNG')), '[^A-Z0-9]', '', 'g'), 21);
  v_prueftext text;
  v_zeichen text;
  v_ziffern text := '';
  v_rest integer := 0;
  v_index integer;
begin
  v_prueftext := v_basis || 'RF00';
  for v_index in 1..length(v_prueftext) loop
    v_zeichen := substr(v_prueftext, v_index, 1);
    if v_zeichen between 'A' and 'Z' then
      v_ziffern := v_ziffern || (ascii(v_zeichen) - 55)::text;
    else
      v_ziffern := v_ziffern || v_zeichen;
    end if;
  end loop;
  for v_index in 1..length(v_ziffern) loop
    v_rest := (v_rest * 10 + substr(v_ziffern, v_index, 1)::integer) % 97;
  end loop;
  return 'RF' || lpad((98 - v_rest)::text, 2, '0') || v_basis;
end;
$$;

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
  if coalesce(array_length(p_abschuss_ids, 1), 0) not between 1 and 2 then
    raise exception 'Es müssen ein oder zwei Abschüsse ausgewählt werden.' using errcode = 'P0001';
  end if;
  if (select count(distinct id) from unnest(p_abschuss_ids) id) <>
     array_length(p_abschuss_ids, 1) then
    raise exception 'Ein Abschuss wurde mehrfach ausgewählt.' using errcode = 'P0001';
  end if;

  select count(*) into v_anzahl
  from public.abschuesse a
  left join public.wildhaendler w on w.id = a.wildhaendler_id
  where a.id = any(p_abschuss_ids)
    and a.fallwild = false
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
    v_nummer := 'RE-' || v_jahr || '-' || lpad(v_laufnummer::text, 4, '0');
    select to_jsonb(v) - 'erstellt_am' - 'geaendert_am' into v_vorlage
    from public.rechnungsvorlagen v where v.id = 1;
    insert into public.rechnungen (
      rechnungsjahr, laufnummer, rechnungsnummer, person_id,
      rechnungsdatum, faellig_am, verwendungszweck, vorlage_snapshot
    ) values (
      v_jahr, v_laufnummer, v_nummer, p_person_id,
      p_rechnungsdatum, p_rechnungsdatum + 14,
      public.rechnung_iso11649_reference(v_nummer), v_vorlage
    ) returning id into v_id;
  else
    v_id := p_rechnung_id;
    update public.rechnungen set
      person_id = p_person_id,
      rechnungsdatum = p_rechnungsdatum,
      faellig_am = p_rechnungsdatum + 14
    where id = v_id;
    if not found then raise exception 'Rechnung wurde nicht gefunden.' using errcode = 'P0001'; end if;
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

alter table public.rechnungsvorlagen enable row level security;
alter table public.rechnungen enable row level security;
alter table public.rechnungspositionen enable row level security;

drop policy if exists rechnungsvorlagen_authenticated_all on public.rechnungsvorlagen;
create policy rechnungsvorlagen_authenticated_all on public.rechnungsvorlagen
for all to authenticated using (true) with check (true);
drop policy if exists rechnungen_authenticated_all on public.rechnungen;
create policy rechnungen_authenticated_all on public.rechnungen
for all to authenticated using (true) with check (true);
drop policy if exists rechnungspositionen_authenticated_all on public.rechnungspositionen;
create policy rechnungspositionen_authenticated_all on public.rechnungspositionen
for all to authenticated using (true) with check (true);

grant select, insert, update on public.rechnungsvorlagen to authenticated;
grant select, insert, update, delete on public.rechnungen to authenticated;
grant select, insert, update, delete on public.rechnungspositionen to authenticated;
grant execute on function public.save_rechnung(uuid, uuid, date, uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
