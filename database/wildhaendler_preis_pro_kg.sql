begin;

alter table public.wildhaendler
  add column if not exists preis_pro_kg numeric(10,2) not null default 0;

update public.wildhaendler
set preis_pro_kg = 0
where preis_pro_kg is null;

alter table public.wildhaendler
  alter column preis_pro_kg set default 0,
  alter column preis_pro_kg set not null;

alter table public.wildhaendler
  drop constraint if exists wildhaendler_preis_nonnegative;

alter table public.wildhaendler
  add constraint wildhaendler_preis_nonnegative
  check (preis_pro_kg >= 0);

notify pgrst, 'reload schema';

commit;
