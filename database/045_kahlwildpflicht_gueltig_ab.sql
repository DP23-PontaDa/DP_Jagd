begin;

alter table public.wildklassen
  add column if not exists kahlwildpflicht_gueltig_ab integer;

alter table public.wildklassen
  drop constraint if exists wildklassen_kahlwildpflicht_gueltig_ab_check;

alter table public.wildklassen
  add constraint wildklassen_kahlwildpflicht_gueltig_ab_check
  check (
    kahlwildpflicht_gueltig_ab is null
    or kahlwildpflicht_gueltig_ab between 1900 and 2999
  );

comment on column public.wildklassen.kahlwildpflicht_gueltig_ab is
  'Erstes Kalenderjahr, in dem Abschüsse dieser Wildklasse eine Kahlwildpflicht erzeugen.';

create table if not exists public.wildklasse_kahlwildpflicht (
  id uuid primary key default gen_random_uuid(),
  wildklasse_id uuid not null references public.wildklassen(id) on delete cascade,
  gueltig_ab_jahr integer not null check (gueltig_ab_jahr between 1900 and 2999),
  anzahl integer not null check (anzahl >= 0),
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  constraint wildklasse_kahlwildpflicht_klasse_jahr_unique unique (wildklasse_id, gueltig_ab_jahr)
);

create index if not exists wildklasse_kahlwildpflicht_klasse_jahr_idx
  on public.wildklasse_kahlwildpflicht(wildklasse_id, gueltig_ab_jahr desc);

create or replace function public.wildklasse_kahlwildpflicht_set_geaendert_am()
returns trigger language plpgsql as $$
begin
  new.geaendert_am = now();
  return new;
end;
$$;

drop trigger if exists wildklasse_kahlwildpflicht_set_geaendert_am on public.wildklasse_kahlwildpflicht;
create trigger wildklasse_kahlwildpflicht_set_geaendert_am
before update on public.wildklasse_kahlwildpflicht
for each row execute function public.wildklasse_kahlwildpflicht_set_geaendert_am();

alter table public.wildklasse_kahlwildpflicht enable row level security;
drop policy if exists wildklasse_kahlwildpflicht_lesen on public.wildklasse_kahlwildpflicht;
create policy wildklasse_kahlwildpflicht_lesen on public.wildklasse_kahlwildpflicht
  for select to authenticated using (
    public.app_hat_recht('wildklassen', 'Lesen')
    or public.app_hat_recht('abschussplan-freigaben', 'Lesen')
  );
drop policy if exists wildklasse_kahlwildpflicht_bearbeiten on public.wildklasse_kahlwildpflicht;
drop policy if exists wildklasse_kahlwildpflicht_einfuegen on public.wildklasse_kahlwildpflicht;
create policy wildklasse_kahlwildpflicht_einfuegen on public.wildklasse_kahlwildpflicht
  for insert to authenticated
  with check (public.app_hat_recht('wildklassen', 'Bearbeiten'));
drop policy if exists wildklasse_kahlwildpflicht_aendern on public.wildklasse_kahlwildpflicht;
create policy wildklasse_kahlwildpflicht_aendern on public.wildklasse_kahlwildpflicht
  for update to authenticated using (public.app_hat_recht('wildklassen', 'Bearbeiten'))
  with check (public.app_hat_recht('wildklassen', 'Bearbeiten'));
drop policy if exists wildklasse_kahlwildpflicht_loeschen on public.wildklasse_kahlwildpflicht;
create policy wildklasse_kahlwildpflicht_loeschen on public.wildklasse_kahlwildpflicht
  for delete to authenticated using (public.app_hat_recht('wildklassen', 'Löschen'));
grant select, insert, update, delete on public.wildklasse_kahlwildpflicht to authenticated;

insert into public.wildklasse_kahlwildpflicht (wildklasse_id, gueltig_ab_jahr, anzahl)
select id, kahlwildpflicht_gueltig_ab, kahlwildpflicht
from public.wildklassen
where kahlwildpflicht > 0 and kahlwildpflicht_gueltig_ab is not null
on conflict (wildklasse_id, gueltig_ab_jahr) do nothing;

notify pgrst, 'reload schema';

commit;
