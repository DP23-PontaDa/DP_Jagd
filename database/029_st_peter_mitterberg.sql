begin;

create table if not exists public.journal_kategorien (
  id uuid primary key default gen_random_uuid(),
  nr integer not null unique check (nr > 0),
  bezeichnung text not null unique check (btrim(bezeichnung) <> ''),
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create table if not exists public.st_peter_mitterberg (
  id uuid primary key default gen_random_uuid(),
  datum date not null,
  uhrzeit time,
  kategorie_id uuid not null references public.journal_kategorien(id) on update cascade on delete restrict,
  titel text not null check (btrim(titel) <> ''),
  ort_freitext text,
  beschreibung text,
  weitere_personen text,
  ort_id uuid references public.orte(id) on update cascade on delete set null,
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create table if not exists public.st_peter_mitterberg_personen (
  journal_id uuid not null references public.st_peter_mitterberg(id) on delete cascade,
  person_id uuid not null references public.personen(id) on update cascade on delete restrict,
  primary key (journal_id, person_id)
);

create table if not exists public.journal_hashtags (
  id uuid primary key default gen_random_uuid(),
  bezeichnung text not null,
  normalisiert text not null unique,
  erstellt_am timestamptz not null default now(),
  check (btrim(bezeichnung) <> '' and btrim(normalisiert) <> '')
);

create table if not exists public.st_peter_mitterberg_hashtags (
  journal_id uuid not null references public.st_peter_mitterberg(id) on delete cascade,
  hashtag_id uuid not null references public.journal_hashtags(id) on delete restrict,
  primary key (journal_id, hashtag_id)
);

create table if not exists public.st_peter_mitterberg_anhaenge (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.st_peter_mitterberg(id) on delete cascade,
  storage_path text not null unique check (btrim(storage_path) <> ''),
  dateiname text not null check (btrim(dateiname) <> ''),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  sortierung integer not null check (sortierung > 0),
  erstellt_am timestamptz not null default now(),
  unique (journal_id, sortierung)
);

create index if not exists st_peter_mitterberg_datum_idx on public.st_peter_mitterberg (datum desc, uhrzeit desc);
create index if not exists st_peter_mitterberg_kategorie_idx on public.st_peter_mitterberg (kategorie_id);
create index if not exists st_peter_mitterberg_ort_idx on public.st_peter_mitterberg (ort_id);
create index if not exists st_peter_mitterberg_anhaenge_idx on public.st_peter_mitterberg_anhaenge (journal_id, sortierung);

create or replace function public.journal_set_geaendert_am()
returns trigger language plpgsql as $$
begin new.geaendert_am := now(); return new; end;
$$;
drop trigger if exists journal_kategorien_set_geaendert_am on public.journal_kategorien;
create trigger journal_kategorien_set_geaendert_am before update on public.journal_kategorien
for each row execute function public.journal_set_geaendert_am();
drop trigger if exists st_peter_mitterberg_set_geaendert_am on public.st_peter_mitterberg;
create trigger st_peter_mitterberg_set_geaendert_am before update on public.st_peter_mitterberg
for each row execute function public.journal_set_geaendert_am();

create or replace function public.journal_kategorie_verwendet(p_kategorie_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.st_peter_mitterberg where kategorie_id = p_kategorie_id); $$;

insert into public.journal_kategorien (nr, bezeichnung, aktiv) values
  (1, 'Ausschusssitzung', true), (2, 'Hegering RAD', true),
  (3, 'Vereinsschießen', true), (4, 'Grundbesitzer', true),
  (5, 'Kärntner Jägerschaft', true), (6, 'Veranstaltung', true),
  (7, 'Revierangelegenheit', true), (8, 'Arbeitseinsatz', true),
  (9, 'Problem', true), (10, 'Wolf', true), (11, 'Gemeinde', true),
  (12, 'Sonstiges', true)
on conflict (nr) do nothing;

insert into public.app_module (code, bezeichnung, reihenfolge, parent_code, ist_container) values
  ('st-peter-mitterberg', 'St. Peter/Mitterberg', 29, null, false),
  ('journal-kategorien', 'Journal-Kategorien', 30, 'stammdaten', false)
on conflict (code) do update set bezeichnung = excluded.bezeichnung,
  parent_code = excluded.parent_code, ist_container = excluded.ist_container;

alter table public.journal_kategorien enable row level security;
alter table public.st_peter_mitterberg enable row level security;
alter table public.st_peter_mitterberg_personen enable row level security;
alter table public.journal_hashtags enable row level security;
alter table public.st_peter_mitterberg_hashtags enable row level security;
alter table public.st_peter_mitterberg_anhaenge enable row level security;

drop policy if exists journal_kategorien_lesen on public.journal_kategorien;
create policy journal_kategorien_lesen on public.journal_kategorien for select to authenticated
using (public.app_hat_recht('journal-kategorien', 'Lesen') or public.app_hat_recht('st-peter-mitterberg', 'Lesen'));
drop policy if exists journal_kategorien_anlegen on public.journal_kategorien;
create policy journal_kategorien_anlegen on public.journal_kategorien for insert to authenticated
with check (public.app_hat_recht('journal-kategorien', 'Bearbeiten'));
drop policy if exists journal_kategorien_aendern on public.journal_kategorien;
create policy journal_kategorien_aendern on public.journal_kategorien for update to authenticated
using (public.app_hat_recht('journal-kategorien', 'Bearbeiten'))
with check (public.app_hat_recht('journal-kategorien', 'Bearbeiten'));
drop policy if exists journal_kategorien_loeschen on public.journal_kategorien;
create policy journal_kategorien_loeschen on public.journal_kategorien for delete to authenticated
using (public.app_hat_recht('journal-kategorien', 'Löschen'));

drop policy if exists st_peter_mitterberg_lesen on public.st_peter_mitterberg;
create policy st_peter_mitterberg_lesen on public.st_peter_mitterberg for select to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Lesen'));
drop policy if exists st_peter_mitterberg_anlegen on public.st_peter_mitterberg;
create policy st_peter_mitterberg_anlegen on public.st_peter_mitterberg for insert to authenticated
with check (public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten'));
drop policy if exists st_peter_mitterberg_aendern on public.st_peter_mitterberg;
create policy st_peter_mitterberg_aendern on public.st_peter_mitterberg for update to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten'))
with check (public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten'));
drop policy if exists st_peter_mitterberg_loeschen on public.st_peter_mitterberg;
create policy st_peter_mitterberg_loeschen on public.st_peter_mitterberg for delete to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Löschen'));

drop policy if exists journal_personen_lesen on public.st_peter_mitterberg_personen;
create policy journal_personen_lesen on public.st_peter_mitterberg_personen for select to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Lesen'));
drop policy if exists journal_personen_anlegen on public.st_peter_mitterberg_personen;
create policy journal_personen_anlegen on public.st_peter_mitterberg_personen for insert to authenticated
with check (public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten'));
drop policy if exists journal_personen_entfernen on public.st_peter_mitterberg_personen;
create policy journal_personen_entfernen on public.st_peter_mitterberg_personen for delete to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten') or public.app_hat_recht('st-peter-mitterberg', 'Löschen'));

drop policy if exists journal_hashtags_lesen on public.journal_hashtags;
create policy journal_hashtags_lesen on public.journal_hashtags for select to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Lesen'));
drop policy if exists journal_hashtags_anlegen on public.journal_hashtags;
create policy journal_hashtags_anlegen on public.journal_hashtags for insert to authenticated
with check (public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten'));
drop policy if exists journal_tag_mapping_lesen on public.st_peter_mitterberg_hashtags;
create policy journal_tag_mapping_lesen on public.st_peter_mitterberg_hashtags for select to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Lesen'));
drop policy if exists journal_tag_mapping_anlegen on public.st_peter_mitterberg_hashtags;
create policy journal_tag_mapping_anlegen on public.st_peter_mitterberg_hashtags for insert to authenticated
with check (public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten'));
drop policy if exists journal_tag_mapping_entfernen on public.st_peter_mitterberg_hashtags;
create policy journal_tag_mapping_entfernen on public.st_peter_mitterberg_hashtags for delete to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten') or public.app_hat_recht('st-peter-mitterberg', 'Löschen'));

drop policy if exists journal_anhaenge_lesen on public.st_peter_mitterberg_anhaenge;
create policy journal_anhaenge_lesen on public.st_peter_mitterberg_anhaenge for select to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Lesen'));
drop policy if exists journal_anhaenge_anlegen on public.st_peter_mitterberg_anhaenge;
create policy journal_anhaenge_anlegen on public.st_peter_mitterberg_anhaenge for insert to authenticated
with check (public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten'));
drop policy if exists journal_anhaenge_entfernen on public.st_peter_mitterberg_anhaenge;
create policy journal_anhaenge_entfernen on public.st_peter_mitterberg_anhaenge for delete to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Löschen'));

drop policy if exists journal_personen_referenz_lesen on public.personen;
create policy journal_personen_referenz_lesen on public.personen for select to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Lesen'));
drop policy if exists journal_orte_referenz_lesen on public.orte;
create policy journal_orte_referenz_lesen on public.orte for select to authenticated
using (public.app_hat_recht('st-peter-mitterberg', 'Lesen'));

insert into storage.buckets (id, name, public) values
  ('st-peter-mitterberg', 'st-peter-mitterberg', false)
on conflict (id) do update set public = false;
drop policy if exists journal_storage_lesen on storage.objects;
create policy journal_storage_lesen on storage.objects for select to authenticated
using (bucket_id = 'st-peter-mitterberg' and public.app_hat_recht('st-peter-mitterberg', 'Lesen'));
drop policy if exists journal_storage_hochladen on storage.objects;
create policy journal_storage_hochladen on storage.objects for insert to authenticated
with check (bucket_id = 'st-peter-mitterberg' and public.app_hat_recht('st-peter-mitterberg', 'Bearbeiten'));
drop policy if exists journal_storage_loeschen on storage.objects;
create policy journal_storage_loeschen on storage.objects for delete to authenticated
using (bucket_id = 'st-peter-mitterberg' and public.app_hat_recht('st-peter-mitterberg', 'Löschen'));

grant select, insert, update, delete on public.journal_kategorien to authenticated;
grant select, insert, update, delete on public.st_peter_mitterberg to authenticated;
grant select, insert, delete on public.st_peter_mitterberg_personen to authenticated;
grant select, insert on public.journal_hashtags to authenticated;
grant select, insert, delete on public.st_peter_mitterberg_hashtags to authenticated;
grant select, insert, delete on public.st_peter_mitterberg_anhaenge to authenticated;
grant execute on function public.journal_kategorie_verwendet(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
