begin;

alter table public.wildklassen
  add column if not exists stehzeit_nicht_passend_jahre integer not null default 0
    check (stehzeit_nicht_passend_jahre >= 0),
  add column if not exists kahlwildpflicht integer not null default 0
    check (kahlwildpflicht >= 0);

alter table public.abschussregeln
  add column if not exists jaeger_id uuid references public.personen(id) on delete cascade,
  add column if not exists frei_ab date,
  add column if not exists originaljahr integer check (originaljahr is null or originaljahr between 1900 and 2999),
  add column if not exists freigabejahr integer check (freigabejahr is null or freigabejahr between 1900 and 2999);

alter table public.abschussregeln alter column gueltig_ab drop not null;
alter table public.abschussregeln alter column regel_wert drop not null;

-- Bereits gepflegte allgemeine Regeln einmalig in die Wildklassen übernehmen.
update public.wildklassen wk set stehzeit_jahre = quelle.regel_wert
from (
  select distinct on (wildklasse_id) wildklasse_id, regel_wert
  from public.abschussregeln
  where aktiv = true and regel_typ in ('STEHZEIT', 'JAEHRLICH') and regel_wert is not null
  order by wildklasse_id, gueltig_ab desc nulls last, geaendert_am desc
) quelle where wk.id = quelle.wildklasse_id;

update public.wildklassen wk set stehzeit_nicht_passend_jahre = quelle.regel_wert
from (
  select distinct on (wildklasse_id) wildklasse_id, regel_wert
  from public.abschussregeln
  where aktiv = true and regel_typ = 'NICHT_PASSEND' and regel_wert is not null
  order by wildklasse_id, gueltig_ab desc nulls last, geaendert_am desc
) quelle where wk.id = quelle.wildklasse_id;

update public.wildklassen wk set kahlwildpflicht = quelle.regel_wert
from (
  select distinct on (wildklasse_id) wildklasse_id, regel_wert
  from public.abschussregeln
  where aktiv = true and regel_typ = 'KAHLWILD_PFLICHT' and regel_wert is not null
  order by wildklasse_id, gueltig_ab desc nulls last, geaendert_am desc
) quelle where wk.id = quelle.wildklasse_id;

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

-- Bisherige allgemeine Regelzeilen werden nur archiviert; ihre Werte werden
-- künftig direkt an der Wildklasse gepflegt.
update public.abschussregeln
set regel_typ = 'INDIVIDUELLE_AUSNAHME', aktiv = false
where jaeger_id is null;

alter table public.abschussregeln
  add constraint abschussregeln_regel_typ_check check (regel_typ in (
    'VORZIEHEN', 'SONDERFREIGABE', 'INDIVIDUELLES_FREI_DATUM', 'INDIVIDUELLE_AUSNAHME'
  ));

-- Vorhandene individuelle Regeln aus der bisherigen Pflegeebene übernehmen.
insert into public.abschussregeln (
  nr, jaeger_id, wildklasse_id, regel_typ, frei_ab, originaljahr,
  freigabejahr, bemerkung, aktiv, erstellt_am, geaendert_am
)
select
  (select coalesce(max(ar.nr), 0) from public.abschussregeln ar) +
    (row_number() over (order by jf.erstellt_am, jf.id))::integer,
  jf.jaeger_id,
  jf.wildklasse_id,
  case jf.regel_typ
    when 'VORZIEHEN' then 'VORZIEHEN'
    when 'SONDERFREIGABE' then 'SONDERFREIGABE'
    else 'INDIVIDUELLE_AUSNAHME'
  end,
  jf.frei_ab,
  jf.originaljahr,
  jf.freigabejahr,
  jf.bemerkung,
  jf.aktiv,
  jf.erstellt_am,
  jf.geaendert_am
from public.jaeger_freigaben jf
where not exists (
  select 1 from public.abschussregeln ar
  where ar.jaeger_id = jf.jaeger_id
    and ar.wildklasse_id = jf.wildklasse_id
    and ar.regel_typ = case jf.regel_typ
      when 'VORZIEHEN' then 'VORZIEHEN'
      when 'SONDERFREIGABE' then 'SONDERFREIGABE'
      else 'INDIVIDUELLE_AUSNAHME'
    end
    and ar.frei_ab is not distinct from jf.frei_ab
    and ar.freigabejahr is not distinct from jf.freigabejahr
);

create index if not exists abschussregeln_jaeger_wildklasse_idx
  on public.abschussregeln(jaeger_id, wildklasse_id, freigabejahr);

drop policy if exists abschussregeln_personen_lesen on public.personen;
create policy abschussregeln_personen_lesen on public.personen for select to authenticated
  using (public.app_hat_recht('abschussregeln', 'Lesen'));

-- Freigaben ist eine reine Auswertung. Schreibrechte bleiben nur bei Abschussregeln.
update public.app_rollen_rechte
set bearbeiten = false, loeschen = false
where modul_code = 'abschussplan-freigaben';

notify pgrst, 'reload schema';
commit;
