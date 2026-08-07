begin;

create table if not exists public.orte_karteneinstellungen (
  id smallint primary key default 1,
  map_lat numeric(9,6) not null,
  map_lng numeric(9,6) not null,
  map_zoom smallint not null,
  geaendert_am timestamptz not null default now(),
  constraint orte_karteneinstellungen_singleton check (id = 1),
  constraint orte_karteneinstellungen_lat check (map_lat between -90 and 90),
  constraint orte_karteneinstellungen_lng check (map_lng between -180 and 180),
  constraint orte_karteneinstellungen_zoom check (map_zoom between 1 and 19)
);

create or replace function public.orte_karteneinstellungen_set_geaendert_am()
returns trigger
language plpgsql
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists orte_karteneinstellungen_set_geaendert_am
  on public.orte_karteneinstellungen;
create trigger orte_karteneinstellungen_set_geaendert_am
before update on public.orte_karteneinstellungen
for each row execute function public.orte_karteneinstellungen_set_geaendert_am();

alter table public.orte_karteneinstellungen enable row level security;

drop policy if exists orte_karteneinstellungen_authenticated_select
  on public.orte_karteneinstellungen;
create policy orte_karteneinstellungen_authenticated_select
on public.orte_karteneinstellungen for select to authenticated using (true);

drop policy if exists orte_karteneinstellungen_authenticated_write
  on public.orte_karteneinstellungen;
create policy orte_karteneinstellungen_authenticated_write
on public.orte_karteneinstellungen for all to authenticated
using (true) with check (true);

grant select, insert, update on public.orte_karteneinstellungen to authenticated;

notify pgrst, 'reload schema';
commit;
