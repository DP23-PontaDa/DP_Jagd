begin;

create table if not exists public.planperiode_wildklassen (
  id uuid primary key default gen_random_uuid(),
  planperiode_id uuid not null,
  wildklasse_id uuid not null,
  aktiv boolean not null default true,
  reihenfolge integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint planperiode_wildklassen_planperiode_fk
    foreign key (planperiode_id)
    references public.planperioden (id)
    on update cascade
    on delete cascade,

  constraint planperiode_wildklassen_wildklasse_fk
    foreign key (wildklasse_id)
    references public.wildklassen (id)
    on update cascade
    on delete restrict,

  constraint planperiode_wildklassen_planperiode_wildklasse_unique
    unique (planperiode_id, wildklasse_id)
);

create index if not exists planperiode_wildklassen_planperiode_idx
  on public.planperiode_wildklassen (planperiode_id);

create index if not exists planperiode_wildklassen_wildklasse_idx
  on public.planperiode_wildklassen (wildklasse_id);

create or replace function public.planperiode_wildklassen_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists planperiode_wildklassen_set_updated_at
  on public.planperiode_wildklassen;

create trigger planperiode_wildklassen_set_updated_at
before update on public.planperiode_wildklassen
for each row
execute function public.planperiode_wildklassen_set_updated_at();

insert into public.planperiode_wildklassen (
  planperiode_id,
  wildklasse_id,
  aktiv,
  reihenfolge
)
select
  planperiode.id,
  wildklasse.id,
  wildklasse.aktiv,
  wildklasse.reihenfolge
from public.planperioden as planperiode
cross join public.wildklassen as wildklasse
on conflict (planperiode_id, wildklasse_id) do nothing;

commit;
