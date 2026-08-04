begin;

create table if not exists public.nachsuchen (
  id uuid primary key default gen_random_uuid(),
  nr bigint not null,
  datum date not null,
  jahr integer generated always as (
    extract(year from datum)::integer
  ) stored,
  jaeger_id uuid not null,
  hundefuehrer_id uuid not null,
  wildgruppe_id uuid not null,
  wildklasse_id uuid not null,
  ort text,
  info text,
  wild_gefunden boolean not null default false,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  constraint nachsuchen_jahr_nr_unique unique (jahr, nr),
  constraint nachsuchen_nr_positive check (nr > 0),
  constraint nachsuchen_jaeger_fk
    foreign key (jaeger_id) references public.personen (id)
    on update cascade on delete restrict,
  constraint nachsuchen_hundefuehrer_fk
    foreign key (hundefuehrer_id) references public.personen (id)
    on update cascade on delete restrict,
  constraint nachsuchen_wildgruppe_fk
    foreign key (wildgruppe_id) references public.wildgruppen (id)
    on update cascade on delete restrict,
  constraint nachsuchen_wildklasse_gruppe_fk
    foreign key (wildklasse_id, wildgruppe_id)
    references public.wildklassen (id, wildgruppe_id)
    on update cascade on delete restrict
);

create index if not exists nachsuchen_datum_idx
  on public.nachsuchen (datum desc);
create index if not exists nachsuchen_jaeger_idx
  on public.nachsuchen (jaeger_id);
create index if not exists nachsuchen_hundefuehrer_idx
  on public.nachsuchen (hundefuehrer_id);

create or replace function public.nachsuchen_set_geaendert_am()
returns trigger
language plpgsql
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists nachsuchen_set_geaendert_am on public.nachsuchen;
create trigger nachsuchen_set_geaendert_am
before update on public.nachsuchen
for each row execute function public.nachsuchen_set_geaendert_am();

alter table public.nachsuchen enable row level security;

drop policy if exists nachsuchen_authenticated_all on public.nachsuchen;
create policy nachsuchen_authenticated_all
on public.nachsuchen
for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.nachsuchen to authenticated;

notify pgrst, 'reload schema';

commit;
