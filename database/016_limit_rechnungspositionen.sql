begin;

create or replace function public.pruefe_max_zwei_rechnungspositionen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and (
      select count(*) from public.rechnungspositionen rp
      where rp.rechnung_id = new.rechnung_id
    ) >= 2 then
    raise exception 'Eine Rechnung darf höchstens zwei Abschüsse enthalten.'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.rechnung_id is distinct from old.rechnung_id and (
      select count(*) from public.rechnungspositionen rp
      where rp.rechnung_id = new.rechnung_id and rp.id <> old.id
    ) >= 2 then
    raise exception 'Eine Rechnung darf höchstens zwei Abschüsse enthalten.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists rechnungspositionen_max_zwei on public.rechnungspositionen;
create trigger rechnungspositionen_max_zwei
before insert or update of rechnung_id on public.rechnungspositionen
for each row execute function public.pruefe_max_zwei_rechnungspositionen();

commit;
