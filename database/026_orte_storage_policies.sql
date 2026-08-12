-- Private Ortsbilder: Zugriff nur für angemeldete Benutzer mit den bestehenden Orte-Rechten.
-- Der Bucket bleibt ausdrücklich nicht öffentlich.

insert into storage.buckets (id, name, public)
values ('orte', 'orte', false)
on conflict (id) do update set public = false;

drop policy if exists orte_bilder_lesen on storage.objects;
create policy orte_bilder_lesen
on storage.objects for select to authenticated
using (
  bucket_id = 'orte'
  and public.app_hat_recht('wildgruppen', 'Lesen')
);

drop policy if exists orte_bilder_hochladen on storage.objects;
create policy orte_bilder_hochladen
on storage.objects for insert to authenticated
with check (
  bucket_id = 'orte'
  and public.app_hat_recht('wildgruppen', 'Bearbeiten')
);

drop policy if exists orte_bilder_aendern on storage.objects;
create policy orte_bilder_aendern
on storage.objects for update to authenticated
using (
  bucket_id = 'orte'
  and public.app_hat_recht('wildgruppen', 'Bearbeiten')
)
with check (
  bucket_id = 'orte'
  and public.app_hat_recht('wildgruppen', 'Bearbeiten')
);

drop policy if exists orte_bilder_loeschen on storage.objects;
create policy orte_bilder_loeschen
on storage.objects for delete to authenticated
using (
  bucket_id = 'orte'
  and public.app_hat_recht('wildgruppen', 'Löschen')
);
