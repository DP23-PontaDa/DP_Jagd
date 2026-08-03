-- Migration: Abschuss-Ausbaustufe mit Wildhändlern und Jägern
-- Mehrfach ausführbar. Bestehende Händler- und Abschussdaten bleiben erhalten.

begin;

create extension if not exists pgcrypto;

create table if not exists public.wildhaendler (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  bezeichnung text not null,
  preis_pro_kg numeric(10,2) not null default 0,
  aktiv boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint wildhaendler_code_unique unique (code)
);

alter table public.wildhaendler
  add column if not exists preis_pro_kg numeric(10,2) not null default 0;

alter table public.wildhaendler
  drop constraint if exists wildhaendler_preis_nonnegative;

alter table public.wildhaendler
  add constraint wildhaendler_preis_nonnegative
  check (preis_pro_kg >= 0);

-- Bestehende Daten aus abnehmer übernehmen. Die Zuordnung bestehender
-- Abschüsse erfolgt anschließend über den eindeutigen Code.
do $$
begin
  if to_regclass('public.abnehmer') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'abnehmer'
        and column_name = 'created_at'
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'abnehmer'
        and column_name = 'updated_at'
    ) then
      execute $sql$
        insert into public.wildhaendler
          (id, code, bezeichnung, aktiv, created_at, updated_at)
        select id, code, bezeichnung, aktiv,
               coalesce(created_at, now()), coalesce(updated_at, now())
        from public.abnehmer
        on conflict (code) do update
          set bezeichnung = excluded.bezeichnung,
              aktiv = excluded.aktiv,
              updated_at = excluded.updated_at
      $sql$;
    else
      execute $sql$
        insert into public.wildhaendler (id, code, bezeichnung, aktiv)
        select id, code, bezeichnung, aktiv
        from public.abnehmer
        on conflict (code) do update
          set bezeichnung = excluded.bezeichnung,
              aktiv = excluded.aktiv,
              updated_at = now()
      $sql$;
    end if;
  end if;
end;
$$;

create or replace function public.wildhaendler_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists wildhaendler_set_updated_at on public.wildhaendler;

create trigger wildhaendler_set_updated_at
before update on public.wildhaendler
for each row
execute function public.wildhaendler_set_updated_at();

create index if not exists wildhaendler_aktiv_bezeichnung_idx
  on public.wildhaendler (aktiv, bezeichnung);

-- Die vorhandene Personen-Rollenlogik liegt in personen.name_kat.
-- Mitglied entspricht dabei einem Jäger; Jagdgast bleibt eine eigene Rolle.
-- Dadurch stehen keine Rollenbezeichnungen im JavaScript.
create or replace view public.abschuss_jaeger as
select
  p.id,
  p.vorname,
  p.nachname
from public.personen p
where p.aktiv = true
  and p.name_kat in ('Mitglied', 'Jagdgast');

create unique index if not exists wildklassen_id_wildgruppe_unique
  on public.wildklassen (id, wildgruppe_id);

create table if not exists public.abschuesse (
  id uuid primary key default gen_random_uuid(),
  nr bigint not null,
  datum date not null,
  jahr integer generated always as (
    extract(year from datum)::integer
  ) stored,
  jaeger_id uuid not null,
  wildgruppe_id uuid not null,
  wildklasse_id uuid not null,
  gewicht numeric(10,2),
  preis_pro_kg numeric(10,2),
  gesamtpreis numeric(12,2) not null default 0,
  wildhaendler_id uuid,
  zahlungseingang date,
  zusatzinfo text,
  bemerkung text,
  fallwild boolean not null default false,
  untersuchungsprotokoll_nr text,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  constraint abschuesse_jahr_nr_unique unique (jahr, nr),
  constraint abschuesse_nr_positive_ganzzahl check (nr > 0),
  constraint abschuesse_gewicht_fachlogik check (
    gewicht is null or gewicht > 0
  ),
  constraint abschuesse_preis_nonnegative
    check (preis_pro_kg is null or preis_pro_kg >= 0),
  constraint abschuesse_gesamtpreis_nonnegative
    check (gesamtpreis >= 0),
  constraint abschuesse_jaeger_fk
    foreign key (jaeger_id)
    references public.personen (id)
    on update cascade on delete restrict,
  constraint abschuesse_wildgruppe_fk
    foreign key (wildgruppe_id)
    references public.wildgruppen (id)
    on update cascade on delete restrict,
  constraint abschuesse_wildklasse_gruppe_fk
    foreign key (wildklasse_id, wildgruppe_id)
    references public.wildklassen (id, wildgruppe_id)
    on update cascade on delete restrict,
  constraint abschuesse_wildhaendler_fk
    foreign key (wildhaendler_id)
    references public.wildhaendler (id)
    on update cascade on delete restrict
);

-- Erweiterung einer bereits vorhandenen Abschusstabelle.
alter table public.abschuesse
  add column if not exists jaeger_id uuid,
  add column if not exists wildhaendler_id uuid;

-- Alte Händlerreferenzen verlustfrei über den Händlercode migrieren.
do $$
declare
  nicht_migriert boolean;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'abschuesse'
      and column_name = 'abnehmer_id'
  ) and to_regclass('public.abnehmer') is not null then
    execute $sql$
      update public.abschuesse a
      set wildhaendler_id = w.id
      from public.abnehmer alt
      join public.wildhaendler w on w.code = alt.code
      where a.abnehmer_id = alt.id
        and a.wildhaendler_id is null
    $sql$;

    execute $sql$
      select exists (
        select 1
        from public.abschuesse
        where abnehmer_id is not null
          and wildhaendler_id is null
      )
    $sql$ into nicht_migriert;

    if nicht_migriert then
      raise exception
        'Nicht alle bisherigen Händlerreferenzen konnten migriert werden.';
    end if;
  end if;
end;
$$;

alter table public.abschuesse
  alter column gewicht drop not null,
  alter column wildhaendler_id drop not null;

alter table public.abschuesse
  drop constraint if exists abschuesse_abnehmer_fk,
  drop constraint if exists abschuesse_gewicht_positive,
  drop constraint if exists abschuesse_gewicht_fachlogik,
  drop constraint if exists abschuesse_wildhaendler_fachlogik,
  drop constraint if exists abschuesse_jaeger_fk,
  drop constraint if exists abschuesse_wildhaendler_fk;

alter table public.abschuesse
  add constraint abschuesse_gewicht_fachlogik check (
    gewicht is null or gewicht > 0
  ),
  add constraint abschuesse_jaeger_fk
    foreign key (jaeger_id)
    references public.personen (id)
    on update cascade on delete restrict,
  add constraint abschuesse_wildhaendler_fk
    foreign key (wildhaendler_id)
    references public.wildhaendler (id)
    on update cascade on delete restrict;

-- Bestehende Abschüsse besitzen historisch keinen Jäger. Dieser NOT-VALID-
-- Constraint erhält diese Datensätze, erzwingt jaeger_id aber für alle neuen
-- oder geänderten Abschüsse. Sobald Altdaten zugeordnet sind, kann die Spalte
-- mit den beiden auskommentierten Befehlen endgültig auf NOT NULL gesetzt werden.
alter table public.abschuesse
  drop constraint if exists abschuesse_jaeger_required;

alter table public.abschuesse
  add constraint abschuesse_jaeger_required
  check (jaeger_id is not null) not valid;

do $$
begin
  if not exists (
    select 1
    from public.abschuesse
    where jaeger_id is null
  ) then
    alter table public.abschuesse
      validate constraint abschuesse_jaeger_required;
    alter table public.abschuesse
      alter column jaeger_id set not null;
  end if;
end;
$$;

-- Nach manueller Zuordnung aller historischen Abschüsse ausführen:
-- alter table public.abschuesse validate constraint abschuesse_jaeger_required;
-- alter table public.abschuesse alter column jaeger_id set not null;

create index if not exists abschuesse_datum_idx
  on public.abschuesse (datum desc);
create index if not exists abschuesse_jaeger_idx
  on public.abschuesse (jaeger_id);
create index if not exists abschuesse_wildgruppe_idx
  on public.abschuesse (wildgruppe_id);
create index if not exists abschuesse_wildklasse_idx
  on public.abschuesse (wildklasse_id);
create index if not exists abschuesse_wildhaendler_idx
  on public.abschuesse (wildhaendler_id);

create or replace function public.abschuesse_set_gesamtpreis()
returns trigger
language plpgsql
as $$
begin
  if new.fallwild then
    new.gesamtpreis := 0;
  else
    new.gesamtpreis :=
      round(coalesce(new.gewicht, 0) * coalesce(new.preis_pro_kg, 0), 2);
  end if;
  return new;
end;
$$;

drop trigger if exists abschuesse_set_gesamtpreis on public.abschuesse;
create trigger abschuesse_set_gesamtpreis
before insert or update of gewicht, preis_pro_kg, fallwild
on public.abschuesse
for each row execute function public.abschuesse_set_gesamtpreis();

create or replace function public.abschuesse_set_geaendert_am()
returns trigger
language plpgsql
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists abschuesse_set_geaendert_am on public.abschuesse;
create trigger abschuesse_set_geaendert_am
before update on public.abschuesse
for each row execute function public.abschuesse_set_geaendert_am();

create or replace function public.abschuesse_validate_wildhaendler()
returns trigger
language plpgsql
as $$
declare
  wildhaendler_bezeichnung text;
begin
  select w.bezeichnung
    into wildhaendler_bezeichnung
    from public.wildhaendler w
   where w.id = new.wildhaendler_id;

  if lower(btrim(coalesce(wildhaendler_bezeichnung, ''))) =
       lower('Klein Wildhändler')
     and btrim(coalesce(new.untersuchungsprotokoll_nr, '')) = '' then
    raise exception 'Untersuchungsprotokoll Nr ist erforderlich'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists abschuesse_validate_abnehmer on public.abschuesse;
drop trigger if exists abschuesse_validate_wildhaendler on public.abschuesse;

create trigger abschuesse_validate_wildhaendler
before insert or update of wildhaendler_id, untersuchungsprotokoll_nr, fallwild
on public.abschuesse
for each row execute function public.abschuesse_validate_wildhaendler();

drop function if exists public.abschuesse_validate_abnehmer();

-- Die alte Spalte/Tabelle erst entfernen, nachdem alle Werte übernommen wurden.
alter table public.abschuesse
  drop column if exists abnehmer_id;

drop table if exists public.abnehmer;

notify pgrst, 'reload schema';

commit;
