begin;

alter table public.abschuesse
  add column if not exists geweihgewicht numeric(8,3),
  drop constraint if exists abschuesse_geweihgewicht_positiv;

alter table public.abschuesse
  add constraint abschuesse_geweihgewicht_positiv
  check (geweihgewicht is null or geweihgewicht > 0);

create table if not exists public.allgemeine_abschussregeln (
  id uuid primary key default gen_random_uuid(),
  nr integer not null unique check (nr > 0),
  wildklasse_id uuid not null references public.wildklassen(id) on delete restrict,
  jahr_von integer not null check (jahr_von between 1900 and 2999),
  jahr_bis integer not null check (jahr_bis between 1900 and 2999),
  bedingung_feld text not null check (btrim(bedingung_feld) <> ''),
  vergleichsoperator text not null check (vergleichsoperator in ('<', '<=', '=', '>=', '>')),
  grenzwert numeric not null,
  einheit text,
  ergebnis_typ text not null default 'STEHZEIT_JAHRE',
  stehzeit_jahre integer not null check (stehzeit_jahre >= 0),
  bezeichnung text not null check (btrim(bezeichnung) <> ''),
  bemerkung text,
  prioritaet integer not null default 0,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  constraint allgemeine_abschussregeln_zeitraum_check check (jahr_bis >= jahr_von),
  constraint allgemeine_abschussregeln_fachlich_unique unique (
    wildklasse_id, jahr_von, jahr_bis, bedingung_feld,
    vergleichsoperator, grenzwert, stehzeit_jahre
  )
);

alter table public.allgemeine_abschussregeln
  add column if not exists nr integer,
  add column if not exists einheit text,
  add column if not exists ergebnis_typ text not null default 'STEHZEIT_JAHRE',
  add column if not exists bemerkung text;

with nummern as (
  select id,
    coalesce((select max(vorhanden.nr) from public.allgemeine_abschussregeln vorhanden), 0) +
      row_number() over (order by erstellt_am, id)::integer as nr_neu
  from public.allgemeine_abschussregeln
  where nr is null
)
update public.allgemeine_abschussregeln regel
set nr = nummern.nr_neu
from nummern
where regel.id = nummern.id;

alter table public.allgemeine_abschussregeln
  alter column nr set not null;

create unique index if not exists allgemeine_abschussregeln_nr_unique
  on public.allgemeine_abschussregeln(nr);

create index if not exists allgemeine_abschussregeln_klasse_zeitraum_idx
  on public.allgemeine_abschussregeln(wildklasse_id, jahr_von, jahr_bis)
  where aktiv = true;

create or replace function public.allgemeine_abschussregeln_set_geaendert_am()
returns trigger language plpgsql as $$
begin
  new.geaendert_am = now();
  return new;
end;
$$;

drop trigger if exists allgemeine_abschussregeln_set_geaendert_am
  on public.allgemeine_abschussregeln;
create trigger allgemeine_abschussregeln_set_geaendert_am
before update on public.allgemeine_abschussregeln
for each row execute function public.allgemeine_abschussregeln_set_geaendert_am();

alter table public.allgemeine_abschussregeln enable row level security;

drop policy if exists allgemeine_abschussregeln_lesen on public.allgemeine_abschussregeln;
create policy allgemeine_abschussregeln_lesen
  on public.allgemeine_abschussregeln for select to authenticated
  using (
    public.app_hat_recht('abschussplan-freigaben', 'Lesen')
    or public.app_hat_recht('abschussregeln', 'Lesen')
    or public.app_hat_recht('allgemeine-abschussregeln', 'Lesen')
    or public.app_hat_recht('abschuss', 'Lesen')
  );

drop policy if exists allgemeine_abschussregeln_einfuegen on public.allgemeine_abschussregeln;
create policy allgemeine_abschussregeln_einfuegen
  on public.allgemeine_abschussregeln for insert to authenticated
  with check (public.app_hat_recht('allgemeine-abschussregeln', 'Bearbeiten'));

drop policy if exists allgemeine_abschussregeln_aendern on public.allgemeine_abschussregeln;
create policy allgemeine_abschussregeln_aendern
  on public.allgemeine_abschussregeln for update to authenticated
  using (public.app_hat_recht('allgemeine-abschussregeln', 'Bearbeiten'))
  with check (public.app_hat_recht('allgemeine-abschussregeln', 'Bearbeiten'));

drop policy if exists allgemeine_abschussregeln_loeschen on public.allgemeine_abschussregeln;
create policy allgemeine_abschussregeln_loeschen
  on public.allgemeine_abschussregeln for delete to authenticated
  using (public.app_hat_recht('allgemeine-abschussregeln', 'Löschen'));

grant select, insert, update, delete on public.allgemeine_abschussregeln to authenticated;

insert into public.allgemeine_abschussregeln (
  nr, wildklasse_id, jahr_von, jahr_bis, bedingung_feld,
  vergleichsoperator, grenzwert, einheit, ergebnis_typ,
  stehzeit_jahre, bezeichnung, prioritaet
)
select
  coalesce((select max(nr) + 1 from public.allgemeine_abschussregeln), 1),
  wk.id, 2023, 2023, 'geweihgewicht', '<', 3.6, 'kg', 'STEHZEIT_JAHRE', 2,
  'Historische Sonderregel 2023 – Geweihgewicht unter 3,6 kg – Stehzeit 2 Jahre',
  100
from public.wildklassen wk
where lower(btrim(wk.bezeichnung)) = 'hirsch a'
order by wk.aktiv desc nulls last
limit 1
on conflict (
  wildklasse_id, jahr_von, jahr_bis, bedingung_feld,
  vergleichsoperator, grenzwert, stehzeit_jahre
) do update set
  bezeichnung = excluded.bezeichnung,
  prioritaet = excluded.prioritaet,
  aktiv = true,
  geaendert_am = now();

insert into public.app_module (code, bezeichnung, reihenfolge, parent_code, ist_container)
select 'allgemeine-abschussregeln', 'Allgemeine Abschussregeln',
  coalesce(max(reihenfolge), 0) + 1, 'stammdaten', false
from public.app_module
on conflict (code) do update set
  bezeichnung = excluded.bezeichnung,
  parent_code = excluded.parent_code,
  ist_container = excluded.ist_container;

insert into public.app_rollen_rechte
  (rolle_id, modul_code, lesen, bearbeiten, loeschen)
select rolle.id, 'allgemeine-abschussregeln', true, true, true
from public.app_rollen rolle
where rolle.name = 'Admin'
on conflict (rolle_id, modul_code) do update set
  lesen = true, bearbeiten = true, loeschen = true;

notify pgrst, 'reload schema';

commit;
