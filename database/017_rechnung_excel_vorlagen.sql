begin;

alter table public.rechnungsvorlagen
  add column if not exists strasse text not null default '',
  add column if not exists plz text not null default '',
  add column if not exists ort text not null default '',
  add column if not exists logo_storage_path text;

update public.rechnungsvorlagen
set strasse = case when strasse = '' then split_part(adresse, E'\n', 1) else strasse end,
    plz = case when plz = '' then split_part(split_part(adresse, E'\n', 2), ' ', 1) else plz end,
    ort = case when ort = '' then btrim(substring(split_part(adresse, E'\n', 2) from position(' ' in split_part(adresse, E'\n', 2)) + 1)) else ort end
where id = 1;

create table if not exists public.rechnung_excel_vorlagen (
  id uuid primary key default gen_random_uuid(),
  dateiname text not null,
  storage_path text not null unique,
  mime_type text not null,
  dateigroesse bigint not null check (dateigroesse > 0),
  tabellenblatt text not null default 'Tabelle1',
  aktiv boolean not null default false,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);

create unique index if not exists rechnung_excel_vorlagen_eine_aktive
  on public.rechnung_excel_vorlagen (aktiv) where aktiv = true;

alter table public.rechnungen
  add column if not exists excel_vorlage_id uuid
  references public.rechnung_excel_vorlagen(id) on delete restrict;

create or replace function public.setze_aktive_excel_vorlage_an_rechnung()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.excel_vorlage_id is null then
    select id into new.excel_vorlage_id
    from public.rechnung_excel_vorlagen where aktiv = true;
  end if;
  return new;
end;
$$;

drop trigger if exists rechnungen_setze_excel_vorlage on public.rechnungen;
create trigger rechnungen_setze_excel_vorlage
before insert on public.rechnungen
for each row execute function public.setze_aktive_excel_vorlage_an_rechnung();

alter table public.rechnung_excel_vorlagen enable row level security;
drop policy if exists rechnung_excel_vorlagen_authenticated_all on public.rechnung_excel_vorlagen;
create policy rechnung_excel_vorlagen_authenticated_all
  on public.rechnung_excel_vorlagen for all to authenticated
  using (true) with check (true);
grant select, insert, update, delete on public.rechnung_excel_vorlagen to authenticated;

insert into storage.buckets (id, name, public)
values ('rechnungsvorlagen', 'rechnungsvorlagen', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists rechnungsvorlagen_storage_select on storage.objects;
create policy rechnungsvorlagen_storage_select on storage.objects
for select to authenticated using (bucket_id = 'rechnungsvorlagen');
drop policy if exists rechnungsvorlagen_storage_insert on storage.objects;
create policy rechnungsvorlagen_storage_insert on storage.objects
for insert to authenticated with check (bucket_id = 'rechnungsvorlagen');
drop policy if exists rechnungsvorlagen_storage_update on storage.objects;
create policy rechnungsvorlagen_storage_update on storage.objects
for update to authenticated using (bucket_id = 'rechnungsvorlagen') with check (bucket_id = 'rechnungsvorlagen');
drop policy if exists rechnungsvorlagen_storage_delete on storage.objects;
create policy rechnungsvorlagen_storage_delete on storage.objects
for delete to authenticated using (bucket_id = 'rechnungsvorlagen');

create or replace function public.aktiviere_rechnung_excel_vorlage(
  p_dateiname text,
  p_storage_path text,
  p_mime_type text,
  p_dateigroesse bigint
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  update public.rechnung_excel_vorlagen set aktiv = false where aktiv = true;
  insert into public.rechnung_excel_vorlagen (
    dateiname, storage_path, mime_type, dateigroesse, aktiv
  ) values (
    p_dateiname, p_storage_path, p_mime_type, p_dateigroesse, true
  ) returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.aktiviere_rechnung_excel_vorlage(text, text, text, bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
