begin;

alter table public.app_benutzerprofile
  add column if not exists benutzername text;

with kandidaten as (
  select
    id,
    regexp_replace(
      lower(coalesce(nullif(split_part(email, '@', 1), ''), nullif(name, ''), 'benutzer')),
      '[^a-z0-9._-]+', '_', 'g'
    ) as basis,
    row_number() over (
      partition by regexp_replace(
        lower(coalesce(nullif(split_part(email, '@', 1), ''), nullif(name, ''), 'benutzer')),
        '[^a-z0-9._-]+', '_', 'g'
      )
      order by erstellt_am, id
    ) as nummer
  from public.app_benutzerprofile
  where benutzername is null or btrim(benutzername) = ''
)
update public.app_benutzerprofile p
set benutzername = case
  when k.nummer = 1 then k.basis
  else k.basis || '_' || k.nummer::text
end
from kandidaten k
where p.id = k.id;

update public.app_benutzerprofile
set benutzername = 'benutzer_' || left(replace(id::text, '-', ''), 8)
where length(benutzername) < 3;

update public.app_benutzerprofile
set benutzername = left(benutzername, 40) || '_' || left(replace(id::text, '-', ''), 8)
where length(benutzername) > 50;

alter table public.app_benutzerprofile
  alter column benutzername set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_benutzerprofile'::regclass
      and conname = 'app_benutzerprofile_benutzername_format'
  ) then
    alter table public.app_benutzerprofile
      add constraint app_benutzerprofile_benutzername_format
      check (benutzername ~ '^[A-Za-z0-9ÄÖÜäöüß._-]{3,50}$') not valid;
  end if;
end;
$$;

alter table public.app_benutzerprofile
  validate constraint app_benutzerprofile_benutzername_format;

create unique index if not exists app_benutzerprofile_benutzername_lower_uidx
  on public.app_benutzerprofile (lower(benutzername));

create or replace function public.app_neues_profil_fuer_auth_benutzer()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_rolle uuid;
  v_benutzername text;
begin
  select id into v_rolle from public.app_rollen where name = 'Jäger';
  v_benutzername := coalesce(
    nullif(new.raw_user_meta_data ->> 'benutzername', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'benutzer_' || left(replace(new.id::text, '-', ''), 8)
  );
  insert into public.app_benutzerprofile
    (id, name, benutzername, email, rolle_id, aktiv)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), v_benutzername),
    v_benutzername,
    coalesce(new.email, ''),
    v_rolle,
    true
  ) on conflict (id) do nothing;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
