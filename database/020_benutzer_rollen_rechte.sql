begin;

create table if not exists public.app_rollen (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('Admin', 'Bearbeiter', 'Ausschuss', 'Jäger')),
  reihenfolge integer not null unique check (reihenfolge > 0)
);

create table if not exists public.app_module (
  code text primary key,
  bezeichnung text not null unique,
  reihenfolge integer not null unique check (reihenfolge > 0)
);

create table if not exists public.app_rollen_rechte (
  rolle_id uuid not null references public.app_rollen(id) on delete cascade,
  modul_code text not null references public.app_module(code) on delete cascade,
  lesen boolean not null default false,
  bearbeiten boolean not null default false,
  loeschen boolean not null default false,
  primary key (rolle_id, modul_code)
);

create table if not exists public.app_benutzerprofile (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  rolle_id uuid not null references public.app_rollen(id) on delete restrict,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

insert into public.app_rollen (name, reihenfolge) values
  ('Admin', 1), ('Bearbeiter', 2), ('Ausschuss', 3), ('Jäger', 4)
on conflict (name) do update set reihenfolge = excluded.reihenfolge;

insert into public.app_module (code, bezeichnung, reihenfolge) values
  ('dashboard', 'Dashboard', 1),
  ('personen', 'Personen', 2),
  ('abschuss', 'Abschuss', 3),
  ('haar-federwild', 'Haar- und Federwild', 4),
  ('rechnungen', 'Rechnungen', 5),
  ('nachsuchen', 'Nachsuchen', 6),
  ('fehlschuesse', 'Fehlschüsse', 7),
  ('probeschuesse', 'Probeschüsse', 8),
  ('abschussplan', 'Abschussplan', 9),
  ('stammdaten', 'Stammdaten', 10),
  ('wildgruppen', 'Wildgruppen', 11),
  ('wildklassen', 'Wildklassen', 12),
  ('planpositionen', 'Planpositionen', 13),
  ('wildhaendler', 'Wildhändler', 14),
  ('rechnungsvorlage', 'Rechnungsvorlage', 15),
  ('import-export', 'Import / Export', 16),
  ('benutzerverwaltung', 'Benutzerverwaltung', 17)
on conflict (code) do update set
  bezeichnung = excluded.bezeichnung,
  reihenfolge = excluded.reihenfolge;

-- Initiale Matrix. Admin wird in der Prüffunktion immer vollständig berechtigt.
with vorgabe(rolle, modul, lesen, bearbeiten, loeschen) as (values
  ('Bearbeiter', 'dashboard', true, false, false),
  ('Bearbeiter', 'abschuss', true, true, false),
  ('Bearbeiter', 'haar-federwild', true, true, false),
  ('Bearbeiter', 'rechnungen', true, true, false),
  ('Bearbeiter', 'nachsuchen', true, true, false),
  ('Bearbeiter', 'fehlschuesse', true, true, false),
  ('Bearbeiter', 'probeschuesse', true, true, false),
  ('Bearbeiter', 'abschussplan', true, true, false),
  ('Ausschuss', 'dashboard', true, false, false),
  ('Ausschuss', 'abschuss', true, false, false),
  ('Ausschuss', 'nachsuchen', true, false, false),
  ('Ausschuss', 'fehlschuesse', true, false, false),
  ('Ausschuss', 'probeschuesse', true, false, false),
  ('Ausschuss', 'abschussplan', true, false, false),
  ('Jäger', 'dashboard', true, false, false)
)
insert into public.app_rollen_rechte (rolle_id, modul_code, lesen, bearbeiten, loeschen)
select r.id, v.modul, v.lesen, v.bearbeiten, v.loeschen
from vorgabe v join public.app_rollen r on r.name = v.rolle
on conflict (rolle_id, modul_code) do nothing;

-- Der erste vorhandene Auth-Benutzer wird Admin, weitere Benutzer starten als Jäger.
with auth_reihenfolge as (
  select u.*, row_number() over (order by u.created_at, u.id) as nummer
  from auth.users u
)
insert into public.app_benutzerprofile (id, name, email, rolle_id, aktiv)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'name', split_part(coalesce(u.email, ''), '@', 1)),
  coalesce(u.email, ''),
  case when u.nummer = 1 then admin_rolle.id else jaeger_rolle.id end,
  true
from auth_reihenfolge u
cross join public.app_rollen admin_rolle
cross join public.app_rollen jaeger_rolle
where admin_rolle.name = 'Admin' and jaeger_rolle.name = 'Jäger'
on conflict (id) do nothing;

create or replace function public.app_neues_profil_fuer_auth_benutzer()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_rolle uuid;
begin
  select id into v_rolle from public.app_rollen where name = 'Jäger';
  insert into public.app_benutzerprofile (id, name, email, rolle_id, aktiv)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    v_rolle,
    true
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists app_auth_benutzer_profil_anlegen on auth.users;
create trigger app_auth_benutzer_profil_anlegen
after insert on auth.users for each row execute function public.app_neues_profil_fuer_auth_benutzer();

create or replace function public.app_ist_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.app_benutzerprofile p
    join public.app_rollen r on r.id = p.rolle_id
    where p.id = auth.uid() and p.aktiv = true and r.name = 'Admin'
  );
$$;

create or replace function public.app_hat_recht(p_modul text, p_recht text)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when r.name = 'Admin' then true
      when p_recht = 'Lesen' then rr.lesen
      when p_recht = 'Bearbeiten' then rr.bearbeiten
      when p_recht = 'Löschen' then rr.loeschen
      else false
    end
    from public.app_benutzerprofile p
    join public.app_rollen r on r.id = p.rolle_id
    left join public.app_rollen_rechte rr
      on rr.rolle_id = r.id and rr.modul_code = p_modul
    where p.id = auth.uid() and p.aktiv = true
  ), false);
$$;

create or replace function public.app_meine_rechte()
returns table(modul_code text, lesen boolean, bearbeiten boolean, loeschen boolean)
language sql stable security definer set search_path = public
as $$
  select m.code,
    public.app_hat_recht(m.code, 'Lesen'),
    public.app_hat_recht(m.code, 'Bearbeiten'),
    public.app_hat_recht(m.code, 'Löschen')
  from public.app_module m order by m.reihenfolge;
$$;

create or replace function public.app_speichere_rollen_rechte(
  p_rolle_id uuid,
  p_rechte jsonb
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.app_hat_recht('benutzerverwaltung', 'Bearbeiten') then
    raise exception 'Das Recht Bearbeiten fehlt.' using errcode = '42501';
  end if;
  if exists (select 1 from public.app_rollen where id = p_rolle_id and name = 'Admin') then
    raise exception 'Admin besitzt immer Lesen, Bearbeiten und Löschen.' using errcode = 'P0001';
  end if;
  delete from public.app_rollen_rechte where rolle_id = p_rolle_id;
  insert into public.app_rollen_rechte (rolle_id, modul_code, lesen, bearbeiten, loeschen)
  select
    p_rolle_id,
    wert ->> 'modul_code',
    coalesce((wert ->> 'lesen')::boolean, false),
    coalesce((wert ->> 'bearbeiten')::boolean, false),
    coalesce((wert ->> 'loeschen')::boolean, false)
  from jsonb_array_elements(coalesce(p_rechte, '[]'::jsonb)) wert
  join public.app_module m on m.code = wert ->> 'modul_code'
  where coalesce((wert ->> 'lesen')::boolean, false)
     or coalesce((wert ->> 'bearbeiten')::boolean, false)
     or coalesce((wert ->> 'loeschen')::boolean, false);
end;
$$;

create or replace function public.app_admin_schutz()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id from public.app_rollen where name = 'Admin';
  if tg_op = 'DELETE' then
    if old.rolle_id = v_admin_id then
      raise exception 'Admin darf nicht gelöscht werden.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.rolle_id = v_admin_id and
     (new.rolle_id is distinct from old.rolle_id or new.aktiv is distinct from true) then
    raise exception 'Admin darf nicht deaktiviert oder einer anderen Rolle zugeordnet werden.' using errcode = 'P0001';
  end if;
  new.geaendert_am := now();
  return new;
end;
$$;

drop trigger if exists app_benutzerprofile_admin_schutz on public.app_benutzerprofile;
create trigger app_benutzerprofile_admin_schutz
before update or delete on public.app_benutzerprofile
for each row execute function public.app_admin_schutz();

alter table public.app_rollen enable row level security;
alter table public.app_module enable row level security;
alter table public.app_rollen_rechte enable row level security;
alter table public.app_benutzerprofile enable row level security;

drop policy if exists rollen_lesen on public.app_rollen;
create policy rollen_lesen on public.app_rollen for select to authenticated using (true);
drop policy if exists rollen_admin on public.app_rollen;
create policy rollen_admin on public.app_rollen for all to authenticated using (public.app_ist_admin()) with check (public.app_ist_admin());
drop policy if exists module_lesen on public.app_module;
create policy module_lesen on public.app_module for select to authenticated using (true);
drop policy if exists module_admin on public.app_module;
create policy module_admin on public.app_module for all to authenticated using (public.app_ist_admin()) with check (public.app_ist_admin());
drop policy if exists rollen_rechte_lesen on public.app_rollen_rechte;
create policy rollen_rechte_lesen on public.app_rollen_rechte for select to authenticated using (true);
drop policy if exists rollen_rechte_admin on public.app_rollen_rechte;
create policy rollen_rechte_admin on public.app_rollen_rechte for all to authenticated using (public.app_ist_admin()) with check (public.app_ist_admin());
drop policy if exists profiles_lesen on public.app_benutzerprofile;
create policy profiles_lesen on public.app_benutzerprofile for select to authenticated
using (id = auth.uid() or public.app_hat_recht('benutzerverwaltung', 'Lesen'));
drop policy if exists profiles_admin on public.app_benutzerprofile;
create policy profiles_admin on public.app_benutzerprofile for update to authenticated
using (public.app_hat_recht('benutzerverwaltung', 'Bearbeiten'))
with check (
  public.app_hat_recht('benutzerverwaltung', 'Bearbeiten') and
  (public.app_ist_admin() or rolle_id <> (select id from public.app_rollen where name = 'Admin'))
);

-- Vorhandene pauschale Policies der Fachtabellen durch zentrale Rechte ersetzen.
do $$
declare
  eintrag record;
  policy_eintrag record;
  lesen_bedingung text;
  bearbeiten_bedingung text;
  loeschen_bedingung text;
begin
  for eintrag in
    select * from (values
      ('personen', 'personen'),
      ('wildgruppen', 'wildgruppen'),
      ('wildklassen', 'wildklassen'),
      ('planpositionen', 'planpositionen'),
      ('planposition_wildklasse', 'planpositionen'),
      ('wildhaendler', 'wildhaendler'),
      ('planperioden', 'abschussplan'),
      ('planperiode_planpositionen', 'abschussplan'),
      ('planperiode_planposition_wildklasse', 'abschussplan'),
      ('planperiode_wildklassen', 'abschussplan'),
      ('abschussplaene', 'abschussplan'),
      ('abschussplan_positionen', 'abschussplan'),
      ('abschuesse', 'abschuss'),
      ('nachsuchen', 'nachsuchen'),
      ('fehlerschuesse', 'fehlschuesse'),
      ('fehlschuesse', 'fehlschuesse'),
      ('probeschuesse', 'probeschuesse'),
      ('rechnungen', 'rechnungen'),
      ('rechnungspositionen', 'rechnungen'),
      ('rechnungsvorlagen', 'rechnungsvorlage'),
      ('rechnung_excel_vorlagen', 'rechnungsvorlage')
    ) as t(tabelle, modul)
  loop
    if to_regclass('public.' || eintrag.tabelle) is null then continue; end if;
    execute format('alter table public.%I enable row level security', eintrag.tabelle);
    for policy_eintrag in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = eintrag.tabelle
    loop
      execute format('drop policy if exists %I on public.%I', policy_eintrag.policyname, eintrag.tabelle);
    end loop;
    lesen_bedingung := format(
      '(public.app_hat_recht(%L, %L)%s)', eintrag.modul, 'Lesen',
      case when eintrag.tabelle in (
        'abschuesse', 'wildgruppen', 'wildklassen', 'wildhaendler', 'personen',
        'planperioden', 'planperiode_planpositionen',
        'planperiode_planposition_wildklasse', 'planperiode_wildklassen',
        'abschussplaene', 'abschussplan_positionen'
      )
        then format(' or public.app_hat_recht(%L, %L)', 'dashboard', 'Lesen') else '' end
    );
    if eintrag.tabelle = 'abschuesse' then
      lesen_bedingung := '(' || lesen_bedingung ||
        ' or public.app_hat_recht(''haar-federwild'', ''Lesen'')' ||
        ' or public.app_hat_recht(''rechnungen'', ''Lesen'')' ||
        ' or public.app_hat_recht(''import-export'', ''Lesen''))';
      bearbeiten_bedingung := '(public.app_hat_recht(''abschuss'', ''Bearbeiten'')' ||
        ' or public.app_hat_recht(''haar-federwild'', ''Bearbeiten'')' ||
        ' or public.app_hat_recht(''import-export'', ''Bearbeiten''))';
      loeschen_bedingung := '(public.app_hat_recht(''abschuss'', ''Löschen'')' ||
        ' or public.app_hat_recht(''haar-federwild'', ''Löschen''))';
    else
      bearbeiten_bedingung := format('(public.app_hat_recht(%L, %L))', eintrag.modul, 'Bearbeiten');
      loeschen_bedingung := format('(public.app_hat_recht(%L, %L))', eintrag.modul, 'Löschen');
    end if;
    if eintrag.tabelle = 'personen' then
      lesen_bedingung := '(' || lesen_bedingung ||
        ' or public.app_hat_recht(''abschuss'', ''Lesen'')' ||
        ' or public.app_hat_recht(''rechnungen'', ''Lesen'')' ||
        ' or public.app_hat_recht(''nachsuchen'', ''Lesen'')' ||
        ' or public.app_hat_recht(''fehlschuesse'', ''Lesen'')' ||
        ' or public.app_hat_recht(''probeschuesse'', ''Lesen'')' ||
        ' or public.app_hat_recht(''import-export'', ''Lesen''))';
      bearbeiten_bedingung := '(' || bearbeiten_bedingung ||
        ' or public.app_hat_recht(''import-export'', ''Bearbeiten''))';
    end if;
    if eintrag.tabelle in ('wildgruppen', 'wildklassen') then
      lesen_bedingung := '(' || lesen_bedingung ||
        ' or public.app_hat_recht(''abschuss'', ''Lesen'')' ||
        ' or public.app_hat_recht(''haar-federwild'', ''Lesen'')' ||
        ' or public.app_hat_recht(''rechnungen'', ''Lesen'')' ||
        ' or public.app_hat_recht(''nachsuchen'', ''Lesen'')' ||
        ' or public.app_hat_recht(''fehlschuesse'', ''Lesen'')' ||
        ' or public.app_hat_recht(''abschussplan'', ''Lesen'')' ||
        ' or public.app_hat_recht(''import-export'', ''Lesen''))';
    end if;
    if eintrag.tabelle = 'wildhaendler' then
      lesen_bedingung := '(' || lesen_bedingung ||
        ' or public.app_hat_recht(''abschuss'', ''Lesen'')' ||
        ' or public.app_hat_recht(''rechnungen'', ''Lesen'')' ||
        ' or public.app_hat_recht(''import-export'', ''Lesen''))';
    end if;
    if eintrag.tabelle in (
      'planperioden', 'planperiode_planpositionen',
      'planperiode_planposition_wildklasse', 'planperiode_wildklassen',
      'abschussplaene', 'abschussplan_positionen'
    ) then
      lesen_bedingung := '(' || lesen_bedingung ||
        ' or public.app_hat_recht(''abschuss'', ''Lesen''))';
    end if;
    if eintrag.tabelle in ('rechnungsvorlagen', 'rechnung_excel_vorlagen') then
      lesen_bedingung := '(' || lesen_bedingung ||
        ' or public.app_hat_recht(''rechnungen'', ''Lesen''))';
    end if;
    if eintrag.tabelle in ('planpositionen', 'planposition_wildklasse') then
      lesen_bedingung := '(' || lesen_bedingung ||
        ' or public.app_hat_recht(''abschussplan'', ''Lesen''))';
    end if;
    execute format('create policy %I on public.%I for select to authenticated using %s',
      eintrag.tabelle || '_lesen', eintrag.tabelle, lesen_bedingung);
    execute format('create policy %I on public.%I for insert to authenticated with check %s',
      eintrag.tabelle || '_bearbeiten_insert', eintrag.tabelle, bearbeiten_bedingung);
    execute format('create policy %I on public.%I for update to authenticated using %s with check %s',
      eintrag.tabelle || '_bearbeiten_update', eintrag.tabelle,
      bearbeiten_bedingung, bearbeiten_bedingung);
    execute format('create policy %I on public.%I for delete to authenticated using %s',
      eintrag.tabelle || '_loeschen', eintrag.tabelle, loeschen_bedingung);
  end loop;
end;
$$;

-- Views müssen die Rechte der aufrufenden Person verwenden.
do $$
declare
  view_eintrag record;
begin
  for view_eintrag in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = true)', view_eintrag.relname);
  end loop;
end;
$$;

drop policy if exists rechnungsvorlagen_storage_select on storage.objects;
create policy rechnungsvorlagen_storage_select on storage.objects
for select to authenticated using (
  bucket_id = 'rechnungsvorlagen' and (
    public.app_hat_recht('rechnungsvorlage', 'Lesen') or
    public.app_hat_recht('rechnungen', 'Lesen')
  )
);
drop policy if exists rechnungsvorlagen_storage_insert on storage.objects;
create policy rechnungsvorlagen_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'rechnungsvorlagen' and public.app_hat_recht('rechnungsvorlage', 'Bearbeiten')
);
drop policy if exists rechnungsvorlagen_storage_update on storage.objects;
create policy rechnungsvorlagen_storage_update on storage.objects
for update to authenticated using (
  bucket_id = 'rechnungsvorlagen' and public.app_hat_recht('rechnungsvorlage', 'Bearbeiten')
) with check (
  bucket_id = 'rechnungsvorlagen' and public.app_hat_recht('rechnungsvorlage', 'Bearbeiten')
);
drop policy if exists rechnungsvorlagen_storage_delete on storage.objects;
create policy rechnungsvorlagen_storage_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'rechnungsvorlagen' and public.app_hat_recht('rechnungsvorlage', 'Löschen')
);

grant select on public.app_rollen, public.app_module, public.app_rollen_rechte, public.app_benutzerprofile to authenticated;
grant insert, update, delete on public.app_rollen_rechte to authenticated;
grant update on public.app_benutzerprofile to authenticated;
grant execute on function public.app_ist_admin() to authenticated;
grant execute on function public.app_hat_recht(text, text) to authenticated;
grant execute on function public.app_meine_rechte() to authenticated;
grant execute on function public.app_speichere_rollen_rechte(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

