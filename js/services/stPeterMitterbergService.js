window.StPeterMitterbergService = (() => {
  const db = window.db || window.supabase;
  const BUCKET = "st-peter-mitterberg";
  const DATEITYPEN = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  const MAX_DATEIGROESSE = 15 * 1024 * 1024;

  function pruefen(result, text) { if (result.error) { console.error(text, result.error); throw new Error(result.error.message || text); } return result.data; }
  function selectText() {
    return `id,datum,uhrzeit,kategorie_id,titel,ort_freitext,beschreibung,weitere_personen,ort_id,erstellt_am,geaendert_am,
      kategorie:journal_kategorien!st_peter_mitterberg_kategorie_id_fkey(id,nr,bezeichnung,aktiv),
      ort_stammdaten:orte!st_peter_mitterberg_ort_id_fkey(id,name,art,reviereinrichtung,latitude,longitude),
      personen:st_peter_mitterberg_personen(person_id,person:personen(id,vorname,nachname)),
      hashtags:st_peter_mitterberg_hashtags(hashtag_id,hashtag:journal_hashtags(id,bezeichnung,normalisiert))`;
  }
  async function laden() {
    return pruefen(await db.from("st_peter_mitterberg").select(selectText()).order("datum", { ascending: false }).order("uhrzeit", { ascending: false, nullsFirst: false }), "Journal-Einträge konnten nicht geladen werden.") || [];
  }
  async function personenLaden() {
    return pruefen(await db.from("personen").select("id,vorname,nachname").eq("aktiv", true).order("nachname").order("vorname"), "Personen konnten nicht geladen werden.") || [];
  }
  function payload(daten) {
    return { datum: daten.datum, uhrzeit: daten.uhrzeit || null, kategorie_id: daten.kategorie_id,
      titel: daten.titel.trim(), ort_freitext: daten.ort_freitext?.trim() || null,
      beschreibung: daten.beschreibung?.trim() || null, weitere_personen: daten.weitere_personen?.trim() || null,
      ort_id: daten.ort_id || null };
  }
  async function personenErsetzen(id, personIds) {
    pruefen(await db.from("st_peter_mitterberg_personen").delete().eq("journal_id", id), "Personenzuordnungen konnten nicht aktualisiert werden.");
    const ids = [...new Set((personIds || []).filter(Boolean))];
    if (ids.length) pruefen(await db.from("st_peter_mitterberg_personen").insert(ids.map((personId) => ({ journal_id: id, person_id: personId }))), "Personenzuordnungen konnten nicht gespeichert werden.");
  }
  async function hashtagsErsetzen(id, hashtags) {
    pruefen(await db.from("st_peter_mitterberg_hashtags").delete().eq("journal_id", id), "Hashtag-Zuordnungen konnten nicht aktualisiert werden.");
    const map = new Map();
    (hashtags || []).forEach((wert) => { const bezeichnung = String(wert).replace(/^#+/, "").trim().replace(/\s+/g, " "); const normalisiert = bezeichnung.toLocaleLowerCase("de"); if (normalisiert && !map.has(normalisiert)) map.set(normalisiert, bezeichnung); });
    if (!map.size) return;
    const keys = [...map.keys()];
    const tags = pruefen(await db.from("journal_hashtags").select("id,bezeichnung,normalisiert").in("normalisiert", keys), "Hashtags konnten nicht geladen werden.") || [];
    const vorhanden = new Set(tags.map((tag) => tag.normalisiert));
    const fehlend = keys.filter((key) => !vorhanden.has(key)).map((normalisiert) => ({ normalisiert, bezeichnung: map.get(normalisiert) }));
    if (fehlend.length) tags.push(...(pruefen(await db.from("journal_hashtags").insert(fehlend).select("id,bezeichnung,normalisiert"), "Hashtags konnten nicht gespeichert werden.") || []));
    pruefen(await db.from("st_peter_mitterberg_hashtags").insert(tags.map((tag) => ({ journal_id: id, hashtag_id: tag.id }))), "Hashtags konnten nicht zugeordnet werden.");
  }
  async function speichern(id, daten, personIds, hashtags) {
    const result = id ? await db.from("st_peter_mitterberg").update(payload(daten)).eq("id", id).select("id").single()
      : await db.from("st_peter_mitterberg").insert(payload(daten)).select("id").single();
    const eintrag = pruefen(result, "Journal-Eintrag konnte nicht gespeichert werden.");
    await personenErsetzen(eintrag.id, personIds); await hashtagsErsetzen(eintrag.id, hashtags); return eintrag;
  }
  async function anhaengeLaden() {
    const rows = pruefen(await db.from("st_peter_mitterberg_anhaenge").select("id,journal_id,storage_path,dateiname,mime_type,sortierung,erstellt_am").order("journal_id").order("sortierung"), "Anhänge konnten nicht geladen werden.") || [];
    const pfade = rows.map((row) => row.storage_path); if (!pfade.length) return rows;
    const signed = await db.storage.from(BUCKET).createSignedUrls(pfade, 3600); pruefen(signed, "Anhänge konnten nicht geöffnet werden.");
    const urls = new Map((signed.data || []).map((item) => [item.path, item.signedUrl]));
    return rows.map((row) => ({ ...row, url: urls.get(row.storage_path) || "" }));
  }
  function dateiValidieren(datei) {
    if (!(datei instanceof File) || !DATEITYPEN.has(datei.type)) throw new Error("Erlaubt sind JPEG-, PNG-, WebP-Bilder und PDF-Dokumente.");
    if (!datei.size || datei.size > MAX_DATEIGROESSE) throw new Error(`„${datei.name}“ ist leer oder größer als 15 MB.`);
  }
  function sichererName(name) { return String(name || "datei").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-"); }
  function uuid(index) { try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (error) { /* Fallback */ } return `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`; }
  async function anhaengeHochladen(id, dateien, start) {
    dateien.forEach(dateiValidieren);
    for (let index = 0; index < dateien.length; index += 1) {
      const datei = dateien[index]; const path = `${id}/${uuid(index)}-${sichererName(datei.name)}`;
      pruefen(await db.storage.from(BUCKET).upload(path, datei, { contentType: datei.type, upsert: false }), `„${datei.name}“ konnte nicht hochgeladen werden.`);
      const meta = await db.from("st_peter_mitterberg_anhaenge").insert({ journal_id: id, storage_path: path, dateiname: datei.name, mime_type: datei.type, sortierung: start + index + 1 });
      if (meta.error) { await db.storage.from(BUCKET).remove([path]); pruefen(meta, `„${datei.name}“ konnte nicht zugeordnet werden.`); }
    }
  }
  async function anhangLoeschen(anhang) {
    pruefen(await db.storage.from(BUCKET).remove([anhang.storage_path]), "Datei konnte nicht aus Storage gelöscht werden.");
    pruefen(await db.from("st_peter_mitterberg_anhaenge").delete().eq("id", anhang.id), "Anhang konnte nicht gelöscht werden.");
  }
  async function loeschen(id, anhaenge) {
    const pfade = (anhaenge || []).map((row) => row.storage_path).filter(Boolean);
    if (pfade.length) pruefen(await db.storage.from(BUCKET).remove(pfade), "Anhänge konnten nicht aus Storage gelöscht werden.");
    pruefen(await db.from("st_peter_mitterberg").delete().eq("id", id), "Journal-Eintrag konnte nicht gelöscht werden.");
  }
  return { laden, personenLaden, speichern, anhaengeLaden, anhaengeHochladen, anhangLoeschen, loeschen, dateiValidieren };
})();
