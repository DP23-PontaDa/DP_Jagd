begin;
create table if not exists public.jagdjahr_jagdgastkarten (
  id uuid primary key default gen_random_uuid(),
  jagdjahr_id uuid not null references public.jagdjahre(id) on delete cascade,
  kartennummer text not null check (char_length(btrim(kartennummer)) between 1 and 50),
  erstellt_am timestamptz not null default now(),
  unique (jagdjahr_id, kartennummer)
);
create index if not exists jagdjahr_jagdgastkarten_jagdjahr_idx on public.jagdjahr_jagdgastkarten(jagdjahr_id);
insert into public.jagdjahr_jagdgastkarten (jagdjahr_id, kartennummer)
select j.id, btrim(p.jagdgastkarte_nr)
from public.jagdjahre j join public.personen p on p.id = j.person_id
where p.name_kat = 'Jagdgastkarte' and nullif(btrim(p.jagdgastkarte_nr), '') is not null
on conflict (jagdjahr_id, kartennummer) do nothing;
alter table public.jagdjahr_jagdgastkarten enable row level security;
create policy jagdjahr_jagdgastkarten_lesen on public.jagdjahr_jagdgastkarten for select to authenticated using (public.app_hat_recht('personen', 'Lesen'));
create policy jagdjahr_jagdgastkarten_einfuegen on public.jagdjahr_jagdgastkarten for insert to authenticated with check (public.app_hat_recht('personen', 'Bearbeiten'));
create policy jagdjahr_jagdgastkarten_loeschen on public.jagdjahr_jagdgastkarten for delete to authenticated using (public.app_hat_recht('personen', 'Bearbeiten'));
grant select, insert, delete on public.jagdjahr_jagdgastkarten to authenticated;
alter table public.personen drop constraint if exists personen_jagdgastkarte_nr_laenge_check;
alter table public.personen drop column if exists jagdgastkarte_nr;
notify pgrst, 'reload schema';
commit;
