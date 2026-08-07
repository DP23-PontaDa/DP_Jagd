begin;

alter table public.app_module
  add column if not exists parent_code text,
  add column if not exists ist_container boolean not null default false;

update public.app_module set reihenfolge = reihenfolge + 1000;
delete from public.app_module where code = 'dashboard-wildfleisch';

insert into public.app_module (code, bezeichnung, reihenfolge, parent_code, ist_container) values
  ('dashboard', 'Dashboard', 1, null, true),
  ('dashboard-abschuss', 'Dashboard – Abschuss', 2, 'dashboard', false),
  ('dashboard-jaeger', 'Dashboard – Jäger', 3, 'dashboard', false),
  ('dashboard-wildhaendler', 'Dashboard – Wildhändler', 4, 'dashboard', false),
  ('personen', 'Personen', 5, 'stammdaten', false),
  ('abschuss', 'Abschuss', 6, null, false),
  ('haar-federwild', 'Haar- und Federwild', 7, null, false),
  ('rechnungen', 'Rechnungen', 8, null, false),
  ('nachsuchen', 'Nachsuchen', 9, 'nachsuchen-container', false),
  ('fehlschuesse', 'Fehlschüsse', 10, 'nachsuchen-container', false),
  ('probeschuesse', 'Probeschüsse', 11, 'nachsuchen-container', false),
  ('nachsuchen-container', 'Nachsuchen (Menü)', 12, null, true),
  ('abschussplan', 'Abschussplan', 13, null, true),
  ('abschussplan-uebersicht', 'Abschussplan – Übersicht', 14, 'abschussplan', false),
  ('abschussplan-rotwild', 'Abschussplan – Rotwild', 15, 'abschussplan', false),
  ('abschussplan-rehwild', 'Abschussplan – Rehwild', 16, 'abschussplan', false),
  ('abschussplan-gamswild', 'Abschussplan – Gamswild', 17, 'abschussplan', false),
  ('abschussplan-jahre', 'Abschussplan – Übersicht Jahre', 18, 'abschussplan', false),
  ('stammdaten', 'Stammdaten', 19, null, true),
  ('wildgruppen', 'Wildgruppen', 20, 'stammdaten', false),
  ('wildklassen', 'Wildklassen', 21, 'stammdaten', false),
  ('planpositionen', 'Planpositionen', 22, 'stammdaten', false),
  ('wildhaendler', 'Wildhändler', 23, 'stammdaten', false),
  ('rechnungsvorlage', 'Rechnungsvorlage', 24, 'stammdaten', false),
  ('import-export', 'Import / Export', 25, 'stammdaten', false),
  ('benutzerverwaltung', 'Benutzerverwaltung', 26, 'stammdaten', false)
on conflict (code) do update set
  bezeichnung = excluded.bezeichnung,
  reihenfolge = excluded.reihenfolge,
  parent_code = excluded.parent_code,
  ist_container = excluded.ist_container;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_module'::regclass
      and conname = 'app_module_parent_fk'
  ) then
    alter table public.app_module
      add constraint app_module_parent_fk
      foreign key (parent_code) references public.app_module(code) on delete restrict;
  end if;
end;
$$;

-- Vorhandene Containerrechte einmalig auf die neuen Untermenüs übertragen.
insert into public.app_rollen_rechte (rolle_id, modul_code, lesen, bearbeiten, loeschen)
select rr.rolle_id, m.code, rr.lesen, rr.bearbeiten, rr.loeschen
from public.app_rollen_rechte rr
join public.app_module m on m.parent_code = rr.modul_code
where rr.modul_code in ('dashboard', 'abschussplan')
on conflict (rolle_id, modul_code) do nothing;

-- Nachsuchen war bereits getrennt; der Container erhält keine eigenen Rechte.
delete from public.app_rollen_rechte
where modul_code in ('dashboard', 'abschussplan', 'stammdaten', 'nachsuchen-container');

-- Jäger: ausschließlich Dashboard–Abschuss und Nachsuchen lesen.
delete from public.app_rollen_rechte rr
using public.app_rollen r
where rr.rolle_id = r.id and r.name = 'Jäger'
  and rr.modul_code in (
    'dashboard-jaeger', 'dashboard-wildhaendler',
    'fehlschuesse', 'probeschuesse'
  );

insert into public.app_rollen_rechte (rolle_id, modul_code, lesen, bearbeiten, loeschen)
select r.id, vorgabe.modul_code, true, false, false
from public.app_rollen r
cross join (values ('dashboard-abschuss'), ('nachsuchen')) as vorgabe(modul_code)
where r.name = 'Jäger'
on conflict (rolle_id, modul_code) do update set
  lesen = true, bearbeiten = false, loeschen = false;

create or replace function public.app_hat_recht(p_modul text, p_recht text)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when r.name = 'Admin' then true
      else exists (
        select 1
        from public.app_rollen_rechte rr
        join public.app_module m on m.code = rr.modul_code
        where rr.rolle_id = r.id
          and (m.code = p_modul or m.parent_code = p_modul)
          and case p_recht
            when 'Lesen' then rr.lesen
            when 'Bearbeiten' then rr.bearbeiten
            when 'Löschen' then rr.loeschen
            else false
          end
      )
    end
    from public.app_benutzerprofile p
    join public.app_rollen r on r.id = p.rolle_id
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
  from public.app_module m
  where m.ist_container = false
  order by m.reihenfolge;
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
    coalesce((wert ->> 'lesen')::boolean, false)
      or coalesce((wert ->> 'bearbeiten')::boolean, false)
      or coalesce((wert ->> 'loeschen')::boolean, false),
    coalesce((wert ->> 'bearbeiten')::boolean, false),
    coalesce((wert ->> 'loeschen')::boolean, false)
  from jsonb_array_elements(coalesce(p_rechte, '[]'::jsonb)) wert
  join public.app_module m on m.code = wert ->> 'modul_code' and m.ist_container = false
  where coalesce((wert ->> 'lesen')::boolean, false)
     or coalesce((wert ->> 'bearbeiten')::boolean, false)
     or coalesce((wert ->> 'loeschen')::boolean, false);
end;
$$;

notify pgrst, 'reload schema';
commit;
