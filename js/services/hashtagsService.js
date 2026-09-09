window.HashtagsService = (() => {
  const relation = (wert) => Array.isArray(wert) ? wert[0] : wert;
  const normalisieren = (wert) => HashtagService.normalisieren(wert);
  function tags(row) {
    return (row.hashtags || []).map((zuordnung) => relation(zuordnung.hashtag)).filter(Boolean)
      .map((tag) => ({ bezeichnung: tag.bezeichnung, normalisiert: normalisieren(tag.normalisiert || tag.bezeichnung) }));
  }
  function tagebuchEintrag(row) {
    return { id:row.id, quelle:"tagebuch-dp", quelleName:"Tagebuch DP", datum:row.datum,
      art:relation(row.art)?.bezeichnung || "", titel:row.titel || "", beschreibung:row.beschreibung || "", hashtags:tags(row) };
  }
  function journalEintrag(row) {
    return { id:row.id, quelle:"st-peter-mitterberg", quelleName:"St. Peter/Mitterberg", datum:row.datum,
      art:relation(row.kategorie)?.bezeichnung || "", titel:row.titel || "", beschreibung:row.beschreibung || "", hashtags:tags(row) };
  }
  async function laden() {
    const aufgaben=[];
    if (BerechtigungService.darf("tagebuch-dp","Lesen")) aufgaben.push(TagebuchDpService.laden().then((rows)=>rows.map(tagebuchEintrag)));
    if (BerechtigungService.darf("st-peter-mitterberg","Lesen")) aufgaben.push(StPeterMitterbergService.laden().then((rows)=>rows.map(journalEintrag)));
    return (await Promise.all(aufgaben)).flat().sort((a,b)=>String(b.datum).localeCompare(String(a.datum)) || a.titel.localeCompare(b.titel,"de"));
  }
  return { laden, normalisieren };
})();
