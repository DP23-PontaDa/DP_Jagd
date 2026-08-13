const OrteService = (() => {
  const db = window.db || window.supabase;
  const BILDER_BUCKET = "orte";
  const BILD_TYPEN = new Set(["image/jpeg", "image/png", "image/webp"]);
  const MAX_BILDGROESSE = 10 * 1024 * 1024;
  const IMPORT_SPALTEN = ["Nr.", "Name", "Info", "Reviereinrichtung", "Art", "Latitude", "Longitude"];
  const ORT_ARTEN = new Set(["Bodensitz", "Hochsitz", "Sitzbank", "Natur"]);

  function fehler(error, fallback) {
    const result = new Error(error?.message || fallback);
    result.code = error?.code;
    return result;
  }

  async function orteLaden() {
    const { data, error } = await db.from("orte")
      .select("id,nr,name,art,info,latitude,longitude,reviereinrichtung")
      .order("nr", { ascending: true });
    if (error) throw fehler(error, "Orte konnten nicht geladen werden.");
    return data || [];
  }

  async function auswahlLaden() {
    const { data, error } = await db.from("orte")
      .select("id,nr,name,art,latitude,longitude,reviereinrichtung")
      .order("nr", { ascending: true });
    if (error) throw fehler(error, "Orte-Auswahl konnte nicht geladen werden.");
    return data || [];
  }

  async function kartenEinstellungenLaden() {
    const { data, error } = await db.from("orte_karteneinstellungen")
      .select("map_lat,map_lng,map_zoom").eq("id", 1).maybeSingle();
    if (error) throw fehler(error, "Karteneinstellungen konnten nicht geladen werden.");
    return data || null;
  }

  async function kartenEinstellungenSpeichern(einstellungen) {
    const payload = {
      id: 1,
      map_lat: Number(einstellungen.map_lat),
      map_lng: Number(einstellungen.map_lng),
      map_zoom: Number(einstellungen.map_zoom),
    };
    const { data, error } = await db.from("orte_karteneinstellungen")
      .upsert(payload, { onConflict: "id" })
      .select("map_lat,map_lng,map_zoom").single();
    if (error) throw fehler(error, "Karteneinstellungen konnten nicht gespeichert werden.");
    return data;
  }

  async function naechsteNummer(reviereinrichtung) {
    const istReviereinrichtung = reviereinrichtung === true;
    const startnummer = istReviereinrichtung ? 1 : 501;
    const { data, error } = await db.from("orte").select("nr")
      .eq("reviereinrichtung", istReviereinrichtung)
      .order("nr", { ascending: false }).limit(1).maybeSingle();
    if (error) throw fehler(error, "Die nächste Nummer konnte nicht ermittelt werden.");
    if (data?.nr === null || data?.nr === undefined) return startnummer;
    const naechsteNummer = Math.max(Number(data.nr) + 1, startnummer);
    if (istReviereinrichtung && naechsteNummer >= 501) {
      throw new Error("Der Nummernkreis für Reviereinrichtungen (1–500) ist ausgeschöpft.");
    }
    return naechsteNummer;
  }

  function payload(daten) {
    const hatLatitude = daten.latitude !== null && daten.latitude !== "" &&
      Number.isFinite(Number(daten.latitude));
    const hatLongitude = daten.longitude !== null && daten.longitude !== "" &&
      Number.isFinite(Number(daten.longitude));
    return {
      nr: Number(daten.nr),
      name: String(daten.name || "").trim(),
      art: daten.reviereinrichtung ? daten.art || null : null,
      info: String(daten.info || "").trim() || null,
      latitude: hatLatitude ? Number(daten.latitude) : null,
      longitude: hatLongitude ? Number(daten.longitude) : null,
      reviereinrichtung: daten.reviereinrichtung === true,
    };
  }

  async function ortAnlegen(daten) {
    const { data, error } = await db.from("orte").insert(payload(daten)).select("id").single();
    if (error) throw fehler(error, "Ort konnte nicht angelegt werden.");
    return data;
  }

  async function ortAendern(id, daten) {
    const { error } = await db.from("orte").update(payload(daten)).eq("id", id);
    if (error) throw fehler(error, "Ort konnte nicht gespeichert werden.");
    return { id };
  }

  async function bilderLaden(ortId) {
    const { data, error } = await db.from("ort_bilder")
      .select("id,ort_id,storage_path,dateiname,sortierung")
      .eq("ort_id", ortId).order("sortierung", { ascending: true });
    if (error) throw fehler(error, "Bilder konnten nicht geladen werden.");
    return Promise.all((data || []).map(async (bild) => {
      const signed = await db.storage.from(BILDER_BUCKET).createSignedUrl(bild.storage_path, 3600);
      if (signed.error) throw fehler(signed.error, `Bild „${bild.dateiname}“ konnte nicht geladen werden.`);
      return { ...bild, url: signed.data?.signedUrl || "" };
    }));
  }

  async function bilderAlleLaden() {
    const { data, error } = await db.from("ort_bilder")
      .select("id,ort_id,storage_path,dateiname,sortierung")
      .order("ort_id", { ascending: true })
      .order("sortierung", { ascending: true });
    if (error) throw fehler(error, "Bildübersicht konnte nicht geladen werden.");
    const bilder = data || [];
    const erstePfade = [];
    const bekannteOrte = new Set();
    bilder.forEach((bild) => {
      const ortId = String(bild.ort_id);
      if (bekannteOrte.has(ortId) || !bild.storage_path) return;
      bekannteOrte.add(ortId);
      erstePfade.push(bild.storage_path);
    });
    if (!erstePfade.length) return bilder;
    const signed = await db.storage.from(BILDER_BUCKET).createSignedUrls(erstePfade, 3600);
    if (signed.error) throw fehler(signed.error, "Bildvorschauen konnten nicht geladen werden.");
    const urlNachPfad = new Map((signed.data || [])
      .filter((eintrag) => eintrag?.signedUrl)
      .map((eintrag) => [eintrag.path, eintrag.signedUrl]));
    return bilder.map((bild) => ({ ...bild, vorschau_url: urlNachPfad.get(bild.storage_path) || "" }));
  }

  function sichererDateiname(name) {
    return String(name || "bild.jpg").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
  }

  function bildValidieren(datei) {
    if (!(datei instanceof File)) throw new Error("Die ausgewählte Datei ist ungültig.");
    if (!BILD_TYPEN.has(datei.type)) {
      throw new Error(`„${datei.name}“ ist kein unterstütztes Bild. Erlaubt sind JPEG, PNG und WebP.`);
    }
    if (datei.size <= 0) throw new Error(`„${datei.name}“ ist leer und kann nicht hochgeladen werden.`);
    if (datei.size > MAX_BILDGROESSE) {
      throw new Error(`„${datei.name}“ ist größer als 10 MB.`);
    }
  }

  function eindeutigerTeil(index) {
    try {
      if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
    } catch (error) { /* Fallback für nicht sichere Browser-Kontexte. */ }
    return `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 12)}`;
  }

  async function bilderHochladen(ortId, dateien, startSortierung = 0) {
    if (!ortId) throw new Error("Foto kann nicht gespeichert werden: Die Ort-ID fehlt.");
    dateien.forEach(bildValidieren);
    const ergebnis = [];
    for (let index = 0; index < dateien.length; index += 1) {
      const datei = dateien[index];
      const uuid = eindeutigerTeil(index);
      const path = `${ortId}/${uuid}-${sichererDateiname(datei.name)}`;
      let upload;
      try {
        upload = await db.storage.from(BILDER_BUCKET).upload(path, datei, {
          contentType: datei.type, upsert: false,
        });
      } catch (error) {
        console.error("Ortsbild Storage-Upload fehlgeschlagen:", { ortId, path, dateiname: datei.name, error });
        throw new Error(`Foto „${datei.name}“ konnte nicht gespeichert werden. Bitte prüfen Sie die Berechtigung für den Storage-Bucket „orte“.`);
      }
      if (upload.error) {
        console.error("Ortsbild Storage-Upload fehlgeschlagen:", { ortId, path, dateiname: datei.name, error: upload.error });
        const uploadFehler = fehler(upload.error,
          `Foto „${datei.name}“ konnte nicht gespeichert werden. Bitte prüfen Sie die Berechtigung für den Storage-Bucket „orte“.`);
        uploadFehler.message = `Foto „${datei.name}“ konnte nicht gespeichert werden: ${uploadFehler.message}`;
        throw uploadFehler;
      }
      const meta = await db.from("ort_bilder").insert({
        ort_id: ortId, storage_path: path, dateiname: datei.name,
        sortierung: startSortierung + index + 1,
      }).select("id,ort_id,storage_path,dateiname,sortierung").single();
      if (meta.error) {
        console.error("Ortsbild-Metadaten konnten nicht gespeichert werden:",
          { ortId, path, dateiname: datei.name, error: meta.error });
        const cleanup = await db.storage.from(BILDER_BUCKET).remove([path]);
        if (cleanup.error) console.error("Aufräumen des fehlgeschlagenen Ortsbild-Uploads nicht möglich:", cleanup.error);
        const metaFehler = fehler(meta.error, "Bildzuordnung konnte nicht gespeichert werden.");
        metaFehler.message = `Foto „${datei.name}“ wurde hochgeladen, aber der Eintrag in ort_bilder konnte nicht gespeichert werden: ${metaFehler.message}`;
        throw metaFehler;
      }
      ergebnis.push(meta.data);
    }
    return ergebnis;
  }

  async function bildLoeschen(bild) {
    const { error } = await db.from("ort_bilder").delete().eq("id", bild.id);
    if (error) throw fehler(error, "Bild konnte nicht gelöscht werden.");
    const storage = await db.storage.from(BILDER_BUCKET).remove([bild.storage_path]);
    if (storage.error) console.warn("Verwaiste Ortsbild-Datei:", storage.error);
  }

  async function bilderSortieren(ortId, sortierteBilder) {
    for (let index = 0; index < sortierteBilder.length; index += 1) {
      const bild = sortierteBilder[index];
      const { error } = await db.from("ort_bilder").update({ sortierung: index + 1 })
        .eq("id", bild.id).eq("ort_id", ortId);
      if (error) throw fehler(error, "Bildreihenfolge konnte nicht gespeichert werden.");
    }
  }

  async function ortLoeschen(id) {
    const bilder = await bilderLaden(id);
    const { error } = await db.from("orte").delete().eq("id", id);
    if (error) throw fehler(error, "Ort konnte nicht gelöscht werden.");
    const paths = bilder.map((bild) => bild.storage_path).filter(Boolean);
    if (paths.length) {
      const storage = await db.storage.from(BILDER_BUCKET).remove(paths);
      if (storage.error) console.warn("Verwaiste Ortsbild-Dateien:", storage.error);
    }
  }

  function xlsxPruefen() {
    if (!window.XLSX) throw new Error("SheetJS ist nicht verfügbar.");
  }

  function excelZeile(ort) {
    return {
      "Nr.": ort.nr,
      Name: ort.name || "",
      Info: ort.info || "",
      Reviereinrichtung: ort.reviereinrichtung ? "Ja" : "Nein",
      Art: ort.reviereinrichtung ? ort.art || "" : "",
      Latitude: ort.latitude ?? "",
      Longitude: ort.longitude ?? "",
    };
  }

  function excelSchreiben(zeilen, blattname, dateiname) {
    xlsxPruefen();
    const mappe = XLSX.utils.book_new();
    const blatt = XLSX.utils.json_to_sheet(zeilen, { header: IMPORT_SPALTEN });
    blatt["!cols"] = [8, 28, 35, 20, 16, 16, 16].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(mappe, blatt, blattname);
    XLSX.writeFile(mappe, dateiname);
  }

  function importVorlageErzeugen() {
    excelSchreiben([
      { "Nr.": 1, Name: "Kirchengarten", Info: "", Reviereinrichtung: "Ja",
        Art: "Hochsitz", Latitude: "", Longitude: "" },
      { "Nr.": 501, Name: "Waldwiese", Info: "", Reviereinrichtung: "Nein",
        Art: "", Latitude: "", Longitude: "" },
    ], "Orte", "vorlage-orte.xlsx");
  }

  function orteExportieren(orte, reviereinrichtung) {
    const typ = reviereinrichtung ? "reviereinrichtungen" : "abschussorte";
    const datum = new Date().toISOString().slice(0, 10);
    excelSchreiben((orte || []).filter((ort) =>
      ort.reviereinrichtung === reviereinrichtung).map(excelZeile),
    reviereinrichtung ? "Reviereinrichtungen" : "Abschussorte",
    `${typ}-${datum}.xlsx`);
  }

  async function importDateiEinlesen(datei) {
    xlsxPruefen();
    if (!datei || !/\.xlsx$/i.test(datei.name || "")) {
      throw new Error("Bitte eine Excel-Datei im Format .xlsx auswählen.");
    }
    const mappe = XLSX.read(await datei.arrayBuffer(), { type: "array", raw: false });
    const blatt = mappe.Sheets[mappe.SheetNames[0]];
    if (!blatt) throw new Error("Die Excel-Datei enthält kein Arbeitsblatt.");
    return XLSX.utils.sheet_to_json(blatt, { defval: "", raw: false });
  }

  function jaNein(value) {
    const text = String(value ?? "").trim().toLocaleLowerCase("de");
    if (["ja", "true", "1", "x"].includes(text)) return true;
    if (["nein", "false", "0"].includes(text)) return false;
    return null;
  }

  function optionaleZahl(value) {
    const text = String(value ?? "").trim().replace(",", ".");
    if (!text) return { leer: true, wert: null };
    const wert = Number(text);
    return { leer: false, wert: Number.isFinite(wert) ? wert : null };
  }

  async function importValidieren(rohdaten) {
    const vorhandene = await orteLaden();
    const belegteNummern = new Set(vorhandene.map((ort) => Number(ort.nr)));
    const dateiNummern = new Set();
    return (rohdaten || []).map((roh, index) => {
      const zeile = index + 2;
      const fehlerListe = [];
      const nrText = String(roh["Nr."] ?? roh.Nr ?? "").trim();
      const nr = Number(nrText);
      const name = String(roh.Name ?? "").trim();
      const info = String(roh.Info ?? "").trim();
      const reviereinrichtung = jaNein(roh.Reviereinrichtung);
      const art = String(roh.Art ?? "").trim();
      const lat = optionaleZahl(roh.Latitude);
      const lng = optionaleZahl(roh.Longitude);

      if (!nrText || !Number.isInteger(nr) || nr <= 0) fehlerListe.push("Nr. muss eine positive ganze Zahl sein.");
      if (!name) fehlerListe.push("Name fehlt.");
      if (reviereinrichtung === null) fehlerListe.push("Reviereinrichtung muss Ja oder Nein sein.");
      if (reviereinrichtung === true) {
        if (Number.isInteger(nr) && (nr < 1 || nr > 500))
          fehlerListe.push(`Reviereinrichtung Nr. ${nr} ist ungültig. Erlaubt sind Nr. 1 bis 500.`);
        if (!art) fehlerListe.push("Reviereinrichtung = Ja, aber Art fehlt.");
        else if (!ORT_ARTEN.has(art))
          fehlerListe.push(`Ungültige Art '${art}'. Erlaubt: ${[...ORT_ARTEN].join(", ")}.`);
      }
      if (reviereinrichtung === false) {
        if (Number.isInteger(nr) && nr < 501)
          fehlerListe.push(`Abschussort Nr. ${nr} ist ungültig. Abschussorte müssen ab Nr. 501 beginnen.`);
        if (art) fehlerListe.push("Bei einem Abschussort muss Art leer sein.");
      }
      if (lat.leer !== lng.leer) fehlerListe.push("Latitude und Longitude müssen gemeinsam angegeben werden.");
      if (!lat.leer && (lat.wert === null || lat.wert < -90 || lat.wert > 90))
        fehlerListe.push("Latitude muss zwischen -90 und 90 liegen.");
      if (!lng.leer && (lng.wert === null || lng.wert < -180 || lng.wert > 180))
        fehlerListe.push("Longitude muss zwischen -180 und 180 liegen.");
      if (Number.isInteger(nr) && belegteNummern.has(nr)) fehlerListe.push(`Nr. ${nr} ist bereits vergeben.`);
      if (Number.isInteger(nr) && dateiNummern.has(nr)) fehlerListe.push(`Nr. ${nr} kommt in der Importdatei mehrfach vor.`);
      if (Number.isInteger(nr)) dateiNummern.add(nr);

      return {
        zeile, nr: nrText, name,
        typ: reviereinrichtung === true ? "Reviereinrichtung" :
          reviereinrichtung === false ? "Abschussort" : "Unbekannt",
        ergebnis: fehlerListe.length ? "Fehler" : "OK",
        fehler: fehlerListe.map((text) => `Zeile ${zeile}: ${text}`),
        payload: fehlerListe.length ? null : payload({ nr, name, info, art,
          latitude: lat.wert, longitude: lng.wert, reviereinrichtung }),
      };
    });
  }

  async function importSpeichern(vorschau) {
    const bericht = { importiert: 0, fehler: [] };
    for (const eintrag of (vorschau || []).filter((item) => item.payload)) {
      try {
        await ortAnlegen(eintrag.payload);
        bericht.importiert += 1;
      } catch (error) {
        bericht.fehler.push(`Zeile ${eintrag.zeile}: ${error.message}`);
      }
    }
    return bericht;
  }

  return {
    orteLaden, auswahlLaden, naechsteNummer, ortAnlegen, ortAendern, ortLoeschen,
    bilderLaden, bilderAlleLaden, bilderHochladen, bildLoeschen, bilderSortieren,
    kartenEinstellungenLaden, kartenEinstellungenSpeichern, bildValidieren,
    importVorlageErzeugen, orteExportieren, importDateiEinlesen,
    importValidieren, importSpeichern,
  };
})();

window.OrteService = OrteService;
