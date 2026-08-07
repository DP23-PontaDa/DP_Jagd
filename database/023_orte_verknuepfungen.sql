begin;

alter table public.abschuesse
  add column if not exists ort_id uuid;

alter table public.nachsuchen
  add column if not exists ort_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.abschuesse'::regclass
      and conname = 'abschuesse_ort_fk'
  ) then
    alter table public.abschuesse
      add constraint abschuesse_ort_fk
      foreign key (ort_id) references public.orte(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nachsuchen'::regclass
      and conname = 'nachsuchen_ort_fk'
  ) then
    alter table public.nachsuchen
      add constraint nachsuchen_ort_fk
      foreign key (ort_id) references public.orte(id) on delete set null;
  end if;
end;
$$;

create index if not exists abschuesse_ort_id_idx on public.abschuesse(ort_id);
create index if not exists nachsuchen_ort_id_idx on public.nachsuchen(ort_id);

-- Eindeutig passende historische Freitexte vorsichtig übernehmen.
update public.nachsuchen n
set ort_id = (
  select o.id
  from public.orte o
  where lower(btrim(o.name)) = lower(btrim(n.ort))
  order by o.nr, o.id
  limit 1
)
where n.ort_id is null and nullif(btrim(n.ort), '') is not null;

notify pgrst, 'reload schema';
commit;
