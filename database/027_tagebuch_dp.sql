begin;

create table if not exists public.tagebuch_arten (
  id uuid primary key default gen_random_uuid(),
  nr integer not null unique check (nr > 0),
  bezeichnung text not null unique check (btrim(bezeichnung) <> ''),
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create table if not exists public.tagebuch_dp (
  id uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum date not null,
  uhrzeit time,
  ort_freitext text,
  art_id uuid not null references public.tagebuch_arten(id) on update cascade on delete restrict,
  titel text not null check (btrim(titel) <> ''),
  beschreibung text,
  weitere_personen text,
  ort_id uuid references public.orte(id) on update cascade on delete set null,
  abschuss_id uuid references public.abschuesse(id) on update cascade on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create table if not exists public.tagebuch_dp_personen (
  tagebuch_id uuid not null references public.tagebuch_dp(id) on delete cascade,
  person_id uuid not null references public.personen(id) on update cascade on delete restrict,
  primary key (tagebuch_id, person_id)
);

create table if not exists public.tagebuch_dp_bilder (
  id uuid primary key default gen_random_uuid(),
  tagebuch_id uuid not null references public.tagebuch_dp(id) on delete cascade,
  storage_path text not null unique check (btrim(storage_path) <> ''),
  dateiname text not null check (btrim(dateiname) <> ''),
  sortierung integer not null check (sortierung > 0),
  erstellt_am timestamptz not null default now(),
  unique (tagebuch_id, sortierung)
);

create index if not exists tagebuch_dp_benutzer_datum_idx
  on public.tagebuch_dp (benutzer_id, datum desc, uhrzeit desc);
create index if not exists tagebuch_dp_art_idx on public.tagebuch_dp (art_id);
create index if not exists tagebuch_dp_ort_idx on public.tagebuch_dp (ort_id);
create index if not exists tagebuch_dp_abschuss_idx on public.tagebuch_dp (abschuss_id);
create index if not exists tagebuch_dp_bilder_tagebuch_idx
  on public.tagebuch_dp_bilder (tagebuch_id, sortierung);

create or replace function public.tagebuch_art_verwendet(p_art_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.tagebuch_dp where art_id = p_art_id);
$$;

create or replace function public.tagebuch_set_geaendert_am()
returns trigger language plpgsql as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists tagebuch_arten_set_geaendert_am on public.tagebuch_arten;
create trigger tagebuch_arten_set_geaendert_am before update on public.tagebuch_arten
for each row execute function public.tagebuch_set_geaendert_am();
drop trigger if exists tagebuch_dp_set_geaendert_am on public.tagebuch_dp;
create trigger tagebuch_dp_set_geaendert_am before update on public.tagebuch_dp
for each row execute function public.tagebuch_set_geaendert_am();

insert into public.tagebuch_arten (nr, bezeichnung, aktiv) values
  (1, 'Jagd', true),
  (2, 'Kamera', true),
  (3, 'Ansitz', true),
  (4, 'Abschuss', true),
  (5, 'Revierarbeit', true),
  (6, 'Sonstiges', true)
on conflict (nr) do nothing;

insert into public.app_module (code, bezeichnung, reihenfolge, parent_code, ist_container) values
  ('tagebuch-dp', 'Tagebuch DP', 27, null, false),
  ('tagebucharten', 'Tagebucharten', 28, 'stammdaten', false)
on conflict (code) do update set
  bezeichnung = excluded.bezeichnung,
  parent_code = excluded.parent_code,
  ist_container = excluded.ist_container;

alter table public.tagebuch_arten enable row level security;
alter table public.tagebuch_dp enable row level security;
alter table public.tagebuch_dp_personen enable row level security;
alter table public.tagebuch_dp_bilder enable row level security;

drop policy if exists tagebuch_arten_lesen on public.tagebuch_arten;
create policy tagebuch_arten_lesen on public.tagebuch_arten for select to authenticated
using (public.app_hat_recht('tagebucharten', 'Lesen') or public.app_hat_recht('tagebuch-dp', 'Lesen'));
drop policy if exists tagebuch_arten_bearbeiten on public.tagebuch_arten;
create policy tagebuch_arten_bearbeiten on public.tagebuch_arten for insert to authenticated
with check (public.app_hat_recht('tagebucharten', 'Bearbeiten'));
drop policy if exists tagebuch_arten_aendern on public.tagebuch_arten;
create policy tagebuch_arten_aendern on public.tagebuch_arten for update to authenticated
using (public.app_hat_recht('tagebucharten', 'Bearbeiten'))
with check (public.app_hat_recht('tagebucharten', 'Bearbeiten'));
drop policy if exists tagebuch_arten_loeschen on public.tagebuch_arten;
create policy tagebuch_arten_loeschen on public.tagebuch_arten for delete to authenticated
using (public.app_hat_recht('tagebucharten', 'Löschen'));

drop policy if exists tagebuch_dp_lesen on public.tagebuch_dp;
create policy tagebuch_dp_lesen on public.tagebuch_dp for select to authenticated
using (benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Lesen'));
drop policy if exists tagebuch_dp_anlegen on public.tagebuch_dp;
create policy tagebuch_dp_anlegen on public.tagebuch_dp for insert to authenticated
with check (benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Bearbeiten'));
drop policy if exists tagebuch_dp_aendern on public.tagebuch_dp;
create policy tagebuch_dp_aendern on public.tagebuch_dp for update to authenticated
using (benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Bearbeiten'))
with check (benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Bearbeiten'));
drop policy if exists tagebuch_dp_loeschen on public.tagebuch_dp;
create policy tagebuch_dp_loeschen on public.tagebuch_dp for delete to authenticated
using (benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Löschen'));

drop policy if exists tagebuch_personen_referenz_lesen on public.personen;
create policy tagebuch_personen_referenz_lesen on public.personen for select to authenticated
using (public.app_hat_recht('tagebuch-dp', 'Lesen'));
drop policy if exists tagebuch_orte_referenz_lesen on public.orte;
create policy tagebuch_orte_referenz_lesen on public.orte for select to authenticated
using (public.app_hat_recht('tagebuch-dp', 'Lesen'));
drop policy if exists tagebuch_abschuesse_referenz_lesen on public.abschuesse;
create policy tagebuch_abschuesse_referenz_lesen on public.abschuesse for select to authenticated
using (public.app_hat_recht('tagebuch-dp', 'Lesen'));
drop policy if exists tagebuch_wildgruppen_referenz_lesen on public.wildgruppen;
create policy tagebuch_wildgruppen_referenz_lesen on public.wildgruppen for select to authenticated
using (public.app_hat_recht('tagebuch-dp', 'Lesen'));
drop policy if exists tagebuch_wildklassen_referenz_lesen on public.wildklassen;
create policy tagebuch_wildklassen_referenz_lesen on public.wildklassen for select to authenticated
using (public.app_hat_recht('tagebuch-dp', 'Lesen'));

drop policy if exists tagebuch_personen_lesen on public.tagebuch_dp_personen;
create policy tagebuch_personen_lesen on public.tagebuch_dp_personen for select to authenticated
using (exists (select 1 from public.tagebuch_dp t where t.id = tagebuch_id));
drop policy if exists tagebuch_personen_bearbeiten on public.tagebuch_dp_personen;
create policy tagebuch_personen_bearbeiten on public.tagebuch_dp_personen for insert to authenticated
with check (exists (select 1 from public.tagebuch_dp t where t.id = tagebuch_id and t.benutzer_id = auth.uid()
  and public.app_hat_recht('tagebuch-dp', 'Bearbeiten')));
drop policy if exists tagebuch_personen_entfernen on public.tagebuch_dp_personen;
create policy tagebuch_personen_entfernen on public.tagebuch_dp_personen for delete to authenticated
using (exists (select 1 from public.tagebuch_dp t where t.id = tagebuch_id and t.benutzer_id = auth.uid()
  and (public.app_hat_recht('tagebuch-dp', 'Bearbeiten') or public.app_hat_recht('tagebuch-dp', 'Löschen'))));

drop policy if exists tagebuch_bilder_lesen on public.tagebuch_dp_bilder;
create policy tagebuch_bilder_lesen on public.tagebuch_dp_bilder for select to authenticated
using (exists (select 1 from public.tagebuch_dp t where t.id = tagebuch_id));
drop policy if exists tagebuch_bilder_bearbeiten on public.tagebuch_dp_bilder;
create policy tagebuch_bilder_bearbeiten on public.tagebuch_dp_bilder for insert to authenticated
with check (exists (select 1 from public.tagebuch_dp t where t.id = tagebuch_id and t.benutzer_id = auth.uid()
  and public.app_hat_recht('tagebuch-dp', 'Bearbeiten')));
drop policy if exists tagebuch_bilder_entfernen on public.tagebuch_dp_bilder;
create policy tagebuch_bilder_entfernen on public.tagebuch_dp_bilder for delete to authenticated
using (exists (select 1 from public.tagebuch_dp t where t.id = tagebuch_id and t.benutzer_id = auth.uid()
  and public.app_hat_recht('tagebuch-dp', 'Löschen')));

insert into storage.buckets (id, name, public)
values ('tagebuch-dp', 'tagebuch-dp', false)
on conflict (id) do update set public = false;

drop policy if exists tagebuch_storage_lesen on storage.objects;
create policy tagebuch_storage_lesen on storage.objects for select to authenticated
using (bucket_id = 'tagebuch-dp' and exists (
  select 1 from public.tagebuch_dp t
  where t.id::text = (storage.foldername(name))[1]
    and t.benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Lesen')
));
drop policy if exists tagebuch_storage_hochladen on storage.objects;
create policy tagebuch_storage_hochladen on storage.objects for insert to authenticated
with check (bucket_id = 'tagebuch-dp' and exists (
  select 1 from public.tagebuch_dp t
  where t.id::text = (storage.foldername(name))[1]
    and t.benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Bearbeiten')
));
drop policy if exists tagebuch_storage_loeschen on storage.objects;
create policy tagebuch_storage_loeschen on storage.objects for delete to authenticated
using (bucket_id = 'tagebuch-dp' and exists (
  select 1 from public.tagebuch_dp t
  where t.id::text = (storage.foldername(name))[1]
    and t.benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Löschen')
));

grant select, insert, update, delete on public.tagebuch_arten to authenticated;
grant select, insert, update, delete on public.tagebuch_dp to authenticated;
grant select, insert, update, delete on public.tagebuch_dp_personen to authenticated;
grant select, insert, update, delete on public.tagebuch_dp_bilder to authenticated;
grant execute on function public.tagebuch_art_verwendet(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
