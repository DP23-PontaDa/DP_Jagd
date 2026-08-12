window.TagebuchDpService = (() => {
  const db = window.db || window.supabase;
  const BUCKET = "tagebuch-dp";
  const BILD_TYPEN = new Set(["image/jpeg", "image/png", "image/webp"]);
  const MAX_BILDGROESSE = 10 * 1024 * 1024;

  function pruefen(result, text) {
    if (result.error) {
      console.error(text, result.error);
      throw new Error(result.error.message || text);
    }
    return result.data;
  }

  function eintragSelect() {
    return `id,benutzer_id,datum,uhrzeit,ort_freitext,art_id,titel,beschreibung,
      weitere_personen,ort_id,abschuss_id,erstellt_am,geaendert_am,
      art:tagebuch_arten!tagebuch_dp_art_id_fkey(id,nr,bezeichnung,aktiv),
      ort_stammdaten:orte!tagebuch_dp_ort_id_fkey(id,name,art,reviereinrichtung,latitude,longitude),
      abschuss:abschuesse!tagebuch_dp_abschuss_id_fkey(id,nr,datum,
        wildgruppen(id,bezeichnung),wildklassen(id,bezeichnung)),
      personen:tagebuch_dp_personen(person_id,person:personen(id,vorname,nachname)),
      hashtags:tagebuch_dp_hashtags(hashtag_id,hashtag:tagebuch_hashtags(id,bezeichnung,normalisiert))`;
  }

  async function laden() {
    return pruefen(await db.from("tagebuch_dp").select(eintragSelect())
      .order("datum", { ascending: false }).order("uhrzeit", { ascending: false, nullsFirst: false }),
    "Tagebucheinträge konnten nicht geladen werden.") || [];
  }

  async function personenLaden() {
    return pruefen(await db.from("personen").select("id,vorname,nachname,aktiv")
      .eq("aktiv", true).order("nachname").order("vorname"),
    "Personen konnten nicht geladen werden.") || [];
  }

  async function abschuesseLaden() {
    return pruefen(await db.from("abschuesse").select(
      "id,nr,datum,wildgruppen(id,bezeichnung),wildklassen(id,bezeichnung)",
    ).order("datum", { ascending: false }).order("nr", { ascending: false }),
    "Abschüsse konnten nicht geladen werden.") || [];
  }

  function payload(daten) {
    return {
      datum: daten.datum,
      uhrzeit: daten.uhrzeit || null,
      ort_freitext: daten.ort_freitext?.trim() || null,
      art_id: daten.art_id,
      titel: daten.titel.trim(),
      beschreibung: daten.beschreibung?.trim() || null,
      weitere_personen: daten.weitere_personen?.trim() || null,
      ort_id: daten.ort_id || null,
      abschuss_id: daten.abschuss_id || null,
    };
  }

  async function personenErsetzen(tagebuchId, personIds) {
    pruefen(await db.from("tagebuch_dp_personen").delete().eq("tagebuch_id", tagebuchId),
      "Personenzuordnungen konnten nicht aktualisiert werden.");
    const eindeutig = [...new Set((personIds || []).filter(Boolean))];
    if (!eindeutig.length) return;
    pruefen(await db.from("tagebuch_dp_personen").insert(eindeutig.map((personId) => ({
      tagebuch_id: tagebuchId, person_id: personId,
    }))), "Personenzuordnungen konnten nicht gespeichert werden.");
  }

  function hashtagNormalisieren(value) {
    return String(value || "").replace(/^#+/, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
  }

  async function hashtagsErsetzen(tagebuchId, hashtags) {
    pruefen(await db.from("tagebuch_dp_hashtags").delete().eq("tagebuch_id", tagebuchId),
      "Hashtag-Zuordnungen konnten nicht aktualisiert werden.");
    const eindeutig = new Map();
    (hashtags || []).forEach((wert) => {
      const bezeichnung = String(wert || "").replace(/^#+/, "").trim().replace(/\s+/g, " ");
      const normalisiert = hashtagNormalisieren(bezeichnung);
      if (normalisiert && !eindeutig.has(normalisiert)) eindeutig.set(normalisiert, bezeichnung);
    });
    if (!eindeutig.size) return;
    const normalisierteWerte = [...eindeutig.keys()];
    const vorhandene = pruefen(await db.from("tagebuch_hashtags")
      .select("id,bezeichnung,normalisiert").in("normalisiert", normalisierteWerte),
    "Hashtags konnten nicht geladen werden.") || [];
    const vorhandenSet = new Set(vorhandene.map((tag) => tag.normalisiert));
    const fehlende = normalisierteWerte.filter((wert) => !vorhandenSet.has(wert)).map((normalisiert) => ({
      normalisiert, bezeichnung: eindeutig.get(normalisiert),
    }));
    if (fehlende.length) {
      const eingefuegt = pruefen(await db.from("tagebuch_hashtags").insert(fehlende)
        .select("id,bezeichnung,normalisiert"), "Neue Hashtags konnten nicht gespeichert werden.") || [];
      vorhandene.push(...eingefuegt);
    }
    pruefen(await db.from("tagebuch_dp_hashtags").insert(vorhandene.map((tag) => ({
      tagebuch_id: tagebuchId, hashtag_id: tag.id,
    }))), "Hashtags konnten dem Tagebucheintrag nicht zugeordnet werden.");
  }

  async function speichern(id, daten, personIds, hashtags) {
    const result = id
      ? await db.from("tagebuch_dp").update(payload(daten)).eq("id", id).select("id").single()
      : await db.from("tagebuch_dp").insert(payload(daten)).select("id").single();
    const eintrag = pruefen(result, id ? "Tagebucheintrag konnte nicht gespeichert werden."
      : "Tagebucheintrag konnte nicht angelegt werden.");
    await personenErsetzen(eintrag.id, personIds);
    await hashtagsErsetzen(eintrag.id, hashtags);
    return eintrag;
  }

  async function bilderLaden() {
    const bilder = pruefen(await db.from("tagebuch_dp_bilder")
      .select("id,tagebuch_id,storage_path,dateiname,sortierung,erstellt_am")
      .order("tagebuch_id").order("sortierung"), "Tagebuchbilder konnten nicht geladen werden.") || [];
    const pfade = bilder.map((bild) => bild.storage_path).filter(Boolean);
    if (!pfade.length) return bilder;
    const signed = await db.storage.from(BUCKET).createSignedUrls(pfade, 3600);
    pruefen(signed, "Tagebuchbilder konnten nicht geöffnet werden.");
    const urls = new Map((signed.data || []).map((item) => [item.path, item.signedUrl]));
    return bilder.map((bild) => ({ ...bild, url: urls.get(bild.storage_path) || "" }));
  }

  function bildValidieren(datei) {
    if (!(datei instanceof File) || !BILD_TYPEN.has(datei.type))
      throw new Error("Erlaubt sind ausschließlich JPEG-, PNG- und WebP-Bilder.");
    if (!datei.size || datei.size > MAX_BILDGROESSE)
      throw new Error(`Das Bild „${datei.name}“ ist leer oder größer als 10 MB.`);
  }

  function dateiname(name) {
    return String(name || "bild.jpg").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-");
  }

  function uuid(index) {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (error) { /* Fallback */ }
    return `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
  }

  async function bilderHochladen(tagebuchId, dateien, startSortierung) {
    dateien.forEach(bildValidieren);
    for (let index = 0; index < dateien.length; index += 1) {
      const datei = dateien[index];
      const path = `${tagebuchId}/${uuid(index)}-${dateiname(datei.name)}`;
      const upload = await db.storage.from(BUCKET).upload(path, datei, {
        contentType: datei.type, upsert: false,
      });
      pruefen(upload, `Bild „${datei.name}“ konnte nicht hochgeladen werden.`);
      const meta = await db.from("tagebuch_dp_bilder").insert({
        tagebuch_id: tagebuchId, storage_path: path, dateiname: datei.name,
        sortierung: startSortierung + index + 1,
      });
      if (meta.error) {
        await db.storage.from(BUCKET).remove([path]);
        pruefen(meta, `Bild „${datei.name}“ konnte nicht zugeordnet werden.`);
      }
    }
  }

  async function bildLoeschen(bild) {
    pruefen(await db.from("tagebuch_dp_bilder").delete().eq("id", bild.id),
      "Bild konnte nicht gelöscht werden.");
    const storage = await db.storage.from(BUCKET).remove([bild.storage_path]);
    if (storage.error) console.error("Tagebuchbild konnte nicht aus Storage gelöscht werden:", storage.error);
  }

  async function loeschen(id, bilder) {
    const pfade = (bilder || []).map((bild) => bild.storage_path).filter(Boolean);
    if (pfade.length) {
      const storage = await db.storage.from(BUCKET).remove(pfade);
      pruefen(storage, "Tagebuchbilder konnten nicht aus Storage gelöscht werden.");
    }
    pruefen(await db.from("tagebuch_dp").delete().eq("id", id),
      "Tagebucheintrag konnte nicht gelöscht werden.");
  }

  return {
    laden, personenLaden, abschuesseLaden, speichern, bilderLaden,
    bilderHochladen, bildLoeschen, loeschen, bildValidieren,
  };
})();
