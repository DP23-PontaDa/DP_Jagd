begin;

alter table public.abschuesse
  add column if not exists interner_hirsch_b1 boolean not null default false;

comment on column public.abschuesse.interner_hirsch_b1 is
  'Kennzeichnet einen Abschuss der Wildklasse Hirsch B1 als interne B1-Freigabe.';

create or replace function public.abschuesse_normalisiere_internen_hirsch_b1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_wildklasse text;
begin
  select lower(btrim(bezeichnung)) into v_wildklasse
  from public.wildklassen
  where id = new.wildklasse_id;

  if v_wildklasse is distinct from 'hirsch b1' then
    new.interner_hirsch_b1 := false;
  end if;
  return new;
end;
$$;

drop trigger if exists abschuesse_normalisiere_internen_hirsch_b1
  on public.abschuesse;
create trigger abschuesse_normalisiere_internen_hirsch_b1
before insert or update of wildklasse_id, interner_hirsch_b1
on public.abschuesse
for each row execute function public.abschuesse_normalisiere_internen_hirsch_b1();

notify pgrst, 'reload schema';
commit;
