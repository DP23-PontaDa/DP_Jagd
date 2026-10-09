begin;

-- Ausschuss und Bearbeiter erhalten denselben Menüzugang wie Jäger.
-- Die RPCs aus Migration 058 geben Nicht-Admins dennoch ausschließlich
-- Daten der jeweils im Benutzerprofil zugeordneten Person zurück.
insert into public.app_rollen_rechte (rolle_id, modul_code, lesen, bearbeiten, loeschen)
select r.id, 'jaeger-bericht', true, false, false
from public.app_rollen r
where r.name in ('Jäger', 'Ausschuss', 'Bearbeiter')
on conflict (rolle_id, modul_code) do update
set lesen = true,
    bearbeiten = false,
    loeschen = false;

notify pgrst, 'reload schema';
commit;
