begin;

alter table public.personen
  add column if not exists anrede text not null default 'Herr';

update public.personen set anrede = 'Herr'
where anrede is null or btrim(anrede) not in ('Herr', 'Frau');

alter table public.personen
  drop constraint if exists personen_anrede_check;
alter table public.personen
  add constraint personen_anrede_check check (anrede in ('Herr', 'Frau'));

notify pgrst, 'reload schema';
commit;
