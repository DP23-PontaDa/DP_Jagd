begin;

-- Tagebuch DP wird zu einem Menücontainer; der bisherige Eintrag bleibt die
-- Berechtigung für die Eingabemaske.
insert into public.app_module (code, bezeichnung, reihenfolge, parent_code, ist_container)
select 'tagebuch-dp-container', 'Tagebuch DP (Menü)', coalesce(max(reihenfolge), 0) + 1, null, true
from public.app_module
on conflict (code) do update set
  bezeichnung = excluded.bezeichnung,
  parent_code = null,
  ist_container = true;

update public.app_module
set bezeichnung = 'Tagebuch DP – Einträge', parent_code = 'tagebuch-dp-container'
where code = 'tagebuch-dp';

insert into public.app_module (code, bezeichnung, reihenfolge, parent_code, ist_container)
select 'tagebuch-dp-zusammenfassung', 'Tagebuch DP – Zusammenfassung',
       coalesce(max(reihenfolge), 0) + 1, 'tagebuch-dp-container', false
from public.app_module
on conflict (code) do update set
  bezeichnung = excluded.bezeichnung,
  parent_code = excluded.parent_code,
  ist_container = false;

-- Wer die Einträge bisher lesen durfte, darf auch die persönliche
-- Zusammenfassung lesen. Die Seite selbst enthält keine Schreibaktionen.
insert into public.app_rollen_rechte (rolle_id, modul_code, lesen, bearbeiten, loeschen)
select rolle_id, 'tagebuch-dp-zusammenfassung', lesen, false, false
from public.app_rollen_rechte
where modul_code = 'tagebuch-dp' and lesen = true
on conflict (rolle_id, modul_code) do update set
  lesen = excluded.lesen,
  bearbeiten = false,
  loeschen = false;

-- Ein geschützter Datenweg liefert genau die Tagebucheinträge des aktuell
-- angemeldeten Benutzers. Der Zeitraum wird bereits in SQL angewendet.
create or replace function public.tagebuch_dp_zusammenfassung_daten(
  p_von date default null,
  p_bis date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ergebnis jsonb;
begin
  if not public.app_hat_recht('tagebuch-dp-zusammenfassung', 'Lesen') then
    raise exception 'Das Recht Lesen fehlt.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'arten', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nr', a.nr, 'bezeichnung', a.bezeichnung
      ) order by a.nr)
      from public.tagebuch_arten a
      where a.aktiv = true
    ), '[]'::jsonb),
    'eintraege', coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'datum', t.datum,
      'art_id', t.art_id,
      'art', a.bezeichnung,
      'ort_id', t.ort_id,
      'ort', case when o.id is null then null else jsonb_build_object(
        'id', o.id, 'name', o.name, 'art', o.art,
        'reviereinrichtung', o.reviereinrichtung,
        'latitude', o.latitude, 'longitude', o.longitude
      ) end,
      'abschuss_id', t.abschuss_id,
      'wildgruppe', case when wg.id is null then null else jsonb_build_object(
        'id', wg.id, 'bezeichnung', wg.bezeichnung,
        'abschussplan', coalesce(wg.abschussplan, false)
      ) end,
      'hashtags', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id, 'bezeichnung', h.bezeichnung
        ) order by h.bezeichnung)
        from public.tagebuch_dp_hashtags th
        join public.tagebuch_hashtags h on h.id = th.hashtag_id
        where th.tagebuch_id = t.id
      ), '[]'::jsonb)
    ) order by t.datum), '[]'::jsonb)
  ) into v_ergebnis
  from public.tagebuch_dp t
  join public.tagebuch_arten a on a.id = t.art_id
  left join public.orte o on o.id = t.ort_id
  left join public.abschuesse ab on ab.id = t.abschuss_id
  left join public.wildgruppen wg on wg.id = ab.wildgruppe_id
  where t.benutzer_id = auth.uid()
    and (p_von is null or t.datum >= p_von)
    and (p_bis is null or t.datum <= p_bis);

  return coalesce(v_ergebnis, jsonb_build_object('arten', '[]'::jsonb, 'eintraege', '[]'::jsonb));
end;
$$;

revoke all on function public.tagebuch_dp_zusammenfassung_daten(date, date) from public;
grant execute on function public.tagebuch_dp_zusammenfassung_daten(date, date) to authenticated;

notify pgrst, 'reload schema';
commit;
