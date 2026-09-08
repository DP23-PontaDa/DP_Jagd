begin;

alter table public.journal_kategorien
  add column if not exists farbe text;

alter table public.journal_kategorien
  drop constraint if exists journal_kategorien_farbe_hex_check;

alter table public.journal_kategorien
  add constraint journal_kategorien_farbe_hex_check
  check (farbe is null or farbe ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.journal_kategorien.farbe is
  'Optionale Schriftfarbe der Journal-Kategorie im Format #RRGGBB, insbesondere für Key Dates.';

notify pgrst, 'reload schema';

commit;
