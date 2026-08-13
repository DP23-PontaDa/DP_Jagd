begin;

do $$
declare v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.abschussregeln'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%regel_typ%'
  limit 1;
  if v_constraint is not null then
    execute format('alter table public.abschussregeln drop constraint %I', v_constraint);
  end if;
end $$;

alter table public.abschussregeln
  add constraint abschussregeln_regel_typ_check check (regel_typ in (
    'VORZIEHEN', 'SONDERFREIGABE', 'INDIVIDUELLES_FREI_DATUM',
    'INDIVIDUELLE_AUSNAHME', 'SPERRE'
  ));

notify pgrst, 'reload schema';
commit;
