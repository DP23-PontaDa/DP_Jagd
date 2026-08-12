begin;

create table if not exists public.tagebuch_hashtags (
  id uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bezeichnung text not null check (btrim(bezeichnung) <> ''),
  normalisiert text not null check (btrim(normalisiert) <> ''),
  erstellt_am timestamptz not null default now(),
  unique (benutzer_id, normalisiert)
);

create table if not exists public.tagebuch_dp_hashtags (
  tagebuch_id uuid not null references public.tagebuch_dp(id) on delete cascade,
  hashtag_id uuid not null references public.tagebuch_hashtags(id) on delete restrict,
  primary key (tagebuch_id, hashtag_id)
);

create index if not exists tagebuch_hashtags_benutzer_idx
  on public.tagebuch_hashtags (benutzer_id, normalisiert);
create index if not exists tagebuch_dp_hashtags_tag_idx
  on public.tagebuch_dp_hashtags (hashtag_id);

alter table public.tagebuch_hashtags enable row level security;
alter table public.tagebuch_dp_hashtags enable row level security;

drop policy if exists tagebuch_hashtags_lesen on public.tagebuch_hashtags;
create policy tagebuch_hashtags_lesen on public.tagebuch_hashtags for select to authenticated
using (benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Lesen'));
drop policy if exists tagebuch_hashtags_anlegen on public.tagebuch_hashtags;
create policy tagebuch_hashtags_anlegen on public.tagebuch_hashtags for insert to authenticated
with check (benutzer_id = auth.uid() and public.app_hat_recht('tagebuch-dp', 'Bearbeiten'));

drop policy if exists tagebuch_dp_hashtags_lesen on public.tagebuch_dp_hashtags;
create policy tagebuch_dp_hashtags_lesen on public.tagebuch_dp_hashtags for select to authenticated
using (exists (
  select 1 from public.tagebuch_dp t
  where t.id = tagebuch_id and t.benutzer_id = auth.uid()
    and public.app_hat_recht('tagebuch-dp', 'Lesen')
));
drop policy if exists tagebuch_dp_hashtags_anlegen on public.tagebuch_dp_hashtags;
create policy tagebuch_dp_hashtags_anlegen on public.tagebuch_dp_hashtags for insert to authenticated
with check (exists (
  select 1 from public.tagebuch_dp t
  where t.id = tagebuch_id and t.benutzer_id = auth.uid()
    and public.app_hat_recht('tagebuch-dp', 'Bearbeiten')
));
drop policy if exists tagebuch_dp_hashtags_entfernen on public.tagebuch_dp_hashtags;
create policy tagebuch_dp_hashtags_entfernen on public.tagebuch_dp_hashtags for delete to authenticated
using (exists (
  select 1 from public.tagebuch_dp t
  where t.id = tagebuch_id and t.benutzer_id = auth.uid()
    and (public.app_hat_recht('tagebuch-dp', 'Bearbeiten') or public.app_hat_recht('tagebuch-dp', 'Löschen'))
));

grant select, insert on public.tagebuch_hashtags to authenticated;
grant select, insert, delete on public.tagebuch_dp_hashtags to authenticated;

notify pgrst, 'reload schema';
commit;
