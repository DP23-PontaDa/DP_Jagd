begin;

alter table public.wildklassen
  add column if not exists kuerzel text;

alter table public.wildklassen
  drop constraint if exists wildklassen_kuerzel_laenge_check;

alter table public.wildklassen
  add constraint wildklassen_kuerzel_laenge_check
  check (kuerzel is null or char_length(btrim(kuerzel)) between 1 and 12);

comment on column public.wildklassen.kuerzel is
  'Frei pflegbares Kürzel für kompakte Jahres- und Kalenderdarstellungen.';

notify pgrst, 'reload schema';

commit;
