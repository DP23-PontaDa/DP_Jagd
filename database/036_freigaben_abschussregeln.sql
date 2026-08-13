begin;

alter table public.wildklassen
  add column if not exists stehzeit_jahre integer not null default 0
  check (stehzeit_jahre >= 0);

create table if not exists public.abschussregeln (
  id uuid primary key default gen_random_uuid(),
  nr integer not null unique,
  gueltig_ab date not null,
  wildklasse_id uuid not null references public.wildklassen(id) on delete restrict,
  regel_typ text not null check (regel_typ in (
    'STEHZEIT', 'JAEHRLICH', 'SONDERFREIGABE', 'NICHT_PASSEND',
    'KAHLWILD_PFLICHT', 'VORZIEHEN', 'INDIVIDUELLE_AUSNAHME'
  )),
  regel_wert integer not null default 0 check (regel_wert >= 0),
  aktiv boolean not null default true,
  bemerkung text,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create table if not exists public.jaeger_freigaben (
  id uuid primary key default gen_random_uuid(),
  jaeger_id uuid not null references public.personen(id) on delete cascade,
  wildklasse_id uuid not null references public.wildklassen(id) on delete restrict,
  regel_typ text not null check (regel_typ in (
    'SONDERFREIGABE', 'VORZIEHEN', 'INDIVIDUELLE_AUSNAHME'
  )),
  frei_ab date,
  regel_wert integer check (regel_wert is null or regel_wert >= 0),
  originaljahr integer check (originaljahr is null or originaljahr between 1900 and 2999),
  freigabejahr integer check (freigabejahr is null or freigabejahr between 1900 and 2999),
  bemerkung text,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create index if not exists abschussregeln_klasse_gueltig_idx
  on public.abschussregeln(wildklasse_id, gueltig_ab desc);
create index if not exists jaeger_freigaben_jaeger_klasse_idx
  on public.jaeger_freigaben(jaeger_id, wildklasse_id);

alter table public.abschussregeln enable row level security;
alter table public.jaeger_freigaben enable row level security;

-- Die Berechnung liest die bestehende zentrale Jägerauswahl und die echten
-- Abschüsse. Zusätzliche permissive SELECT-Policies geben dafür nur Leserechte.
drop policy if exists freigaben_personen_lesen on public.personen;
create policy freigaben_personen_lesen on public.personen for select to authenticated
  using (public.app_hat_recht('abschussplan-freigaben', 'Lesen'));
drop policy if exists freigaben_abschuesse_lesen on public.abschuesse;
create policy freigaben_abschuesse_lesen on public.abschuesse for select to authenticated
  using (public.app_hat_recht('abschussplan-freigaben', 'Lesen'));
drop policy if exists freigaben_wildklassen_lesen on public.wildklassen;
create policy freigaben_wildklassen_lesen on public.wildklassen for select to authenticated
  using (
    public.app_hat_recht('abschussplan-freigaben', 'Lesen')
    or public.app_hat_recht('abschussregeln', 'Lesen')
  );

drop policy if exists abschussregeln_lesen on public.abschussregeln;
create policy abschussregeln_lesen on public.abschussregeln for select to authenticated
  using (public.app_hat_recht('abschussregeln', 'Lesen'));
drop policy if exists abschussregeln_schreiben on public.abschussregeln;
drop policy if exists abschussregeln_einfuegen on public.abschussregeln;
create policy abschussregeln_einfuegen on public.abschussregeln for insert to authenticated
  with check (public.app_hat_recht('abschussregeln', 'Bearbeiten'));
drop policy if exists abschussregeln_aendern on public.abschussregeln;
create policy abschussregeln_aendern on public.abschussregeln for update to authenticated
  using (public.app_hat_recht('abschussregeln', 'Bearbeiten'))
  with check (public.app_hat_recht('abschussregeln', 'Bearbeiten'));
drop policy if exists abschussregeln_loeschen on public.abschussregeln;
create policy abschussregeln_loeschen on public.abschussregeln for delete to authenticated
  using (public.app_hat_recht('abschussregeln', 'Löschen'));

drop policy if exists jaeger_freigaben_lesen on public.jaeger_freigaben;
create policy jaeger_freigaben_lesen on public.jaeger_freigaben for select to authenticated
  using (public.app_hat_recht('abschussplan-freigaben', 'Lesen'));
drop policy if exists jaeger_freigaben_schreiben on public.jaeger_freigaben;
drop policy if exists jaeger_freigaben_einfuegen on public.jaeger_freigaben;
create policy jaeger_freigaben_einfuegen on public.jaeger_freigaben for insert to authenticated
  with check (public.app_hat_recht('abschussplan-freigaben', 'Bearbeiten'));
drop policy if exists jaeger_freigaben_aendern on public.jaeger_freigaben;
create policy jaeger_freigaben_aendern on public.jaeger_freigaben for update to authenticated
  using (public.app_hat_recht('abschussplan-freigaben', 'Bearbeiten'))
  with check (public.app_hat_recht('abschussplan-freigaben', 'Bearbeiten'));
drop policy if exists jaeger_freigaben_loeschen on public.jaeger_freigaben;
create policy jaeger_freigaben_loeschen on public.jaeger_freigaben for delete to authenticated
  using (public.app_hat_recht('abschussplan-freigaben', 'Löschen'));

grant select, insert, update, delete on public.abschussregeln to authenticated;
grant select, insert, update, delete on public.jaeger_freigaben to authenticated;

insert into public.app_module (code, bezeichnung, reihenfolge, parent_code, ist_container)
select 'abschussplan-freigaben', 'Abschussplan – Freigaben',
  coalesce(max(reihenfolge), 0) + 1, 'abschussplan', false
from public.app_module
on conflict (code) do update set
  bezeichnung = excluded.bezeichnung,
  parent_code = excluded.parent_code,
  ist_container = excluded.ist_container;

insert into public.app_module (code, bezeichnung, reihenfolge, parent_code, ist_container)
select 'abschussregeln', 'Abschussregeln',
  coalesce(max(reihenfolge), 0) + 1, 'stammdaten', false
from public.app_module
on conflict (code) do update set
  bezeichnung = excluded.bezeichnung,
  parent_code = excluded.parent_code,
  ist_container = excluded.ist_container;

insert into public.app_rollen_rechte
  (rolle_id, modul_code, lesen, bearbeiten, loeschen)
select rolle.id, modul.code, true, true, true
from public.app_rollen rolle
cross join public.app_module modul
where rolle.name = 'Admin'
  and modul.code in ('abschussplan-freigaben', 'abschussregeln')
on conflict (rolle_id, modul_code) do update set
  lesen = true, bearbeiten = true, loeschen = true;

notify pgrst, 'reload schema';
commit;
