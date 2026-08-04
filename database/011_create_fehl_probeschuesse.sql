begin;

create table if not exists public.fehlschuesse (
  id uuid primary key default gen_random_uuid(),
  nr bigint not null,
  datum date not null,
  jahr integer generated always as (extract(year from datum)::integer) stored,
  jaeger_id uuid not null references public.personen (id)
    on update cascade on delete restrict,
  wildgruppe_id uuid not null references public.wildgruppen (id)
    on update cascade on delete restrict,
  wildklasse_id uuid not null,
  ort text,
  info text,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  constraint fehlschuesse_jahr_nr_unique unique (jahr, nr),
  constraint fehlschuesse_nr_positive check (nr > 0),
  constraint fehlschuesse_wildklasse_gruppe_fk
    foreign key (wildklasse_id, wildgruppe_id)
    references public.wildklassen (id, wildgruppe_id)
    on update cascade on delete restrict
);

create table if not exists public.probeschuesse (
  id uuid primary key default gen_random_uuid(),
  nr bigint not null,
  datum date not null,
  jahr integer generated always as (extract(year from datum)::integer) stored,
  jaeger_id uuid not null references public.personen (id)
    on update cascade on delete restrict,
  ort text,
  info text,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  constraint probeschuesse_jahr_nr_unique unique (jahr, nr),
  constraint probeschuesse_nr_positive check (nr > 0)
);

create or replace function public.schussmodul_set_geaendert_am()
returns trigger language plpgsql as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists fehlschuesse_set_geaendert_am on public.fehlschuesse;
create trigger fehlschuesse_set_geaendert_am
before update on public.fehlschuesse
for each row execute function public.schussmodul_set_geaendert_am();

drop trigger if exists probeschuesse_set_geaendert_am on public.probeschuesse;
create trigger probeschuesse_set_geaendert_am
before update on public.probeschuesse
for each row execute function public.schussmodul_set_geaendert_am();

create index if not exists fehlschuesse_datum_idx on public.fehlschuesse (datum desc);
create index if not exists probeschuesse_datum_idx on public.probeschuesse (datum desc);

alter table public.fehlschuesse enable row level security;
alter table public.probeschuesse enable row level security;

drop policy if exists fehlschuesse_authenticated_all on public.fehlschuesse;
create policy fehlschuesse_authenticated_all on public.fehlschuesse
for all to authenticated using (true) with check (true);
drop policy if exists probeschuesse_authenticated_all on public.probeschuesse;
create policy probeschuesse_authenticated_all on public.probeschuesse
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.fehlschuesse to authenticated;
grant select, insert, update, delete on public.probeschuesse to authenticated;

notify pgrst, 'reload schema';
commit;
