window.TagebuchZusammenfassungService = (() => {
  const db = window.db || window.supabase;

  function normalisieren(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
  }

  function zeitraum(jahr) {
    if (!jahr || jahr === "alle") return { von: null, bis: null };
    return { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
  }

  function ortName(ort) {
    if (!ort) return "";
    if (window.OrteAuswahl?.bezeichnung) return window.OrteAuswahl.bezeichnung(ort);
    return ort.reviereinrichtung ? [ort.name, ort.art].filter(Boolean).join(" - ") : (ort.name || "");
  }

  function sortiert(map) {
    return [...map.values()].sort((a, b) => b.anzahl - a.anzahl ||
      a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  }

  function auswerten(rohdaten) {
    const eintraege = Array.isArray(rohdaten?.eintraege) ? rohdaten.eintraege : [];
    const arten = Array.isArray(rohdaten?.arten) ? rohdaten.arten : [];
    const istArt = (row, name) => normalisieren(row.art) === normalisieren(name);
    const jagdtage = new Set(eintraege.filter((row) => istArt(row, "Jagd") || istArt(row, "Ansitz"))
      .map((row) => row.datum));
    const strukturierteOrte = new Set(eintraege.map((row) => row.ort_id).filter(Boolean));
    const ansitzeMonat = Array(12).fill(0);
    eintraege.filter((row) => istArt(row, "Ansitz")).forEach((row) => {
      const monat = Number(String(row.datum || "").slice(5, 7));
      if (monat >= 1 && monat <= 12) ansitzeMonat[monat - 1] += 1;
    });

    const ortMap = new Map();
    eintraege.filter((row) => row.ort_id && row.ort).forEach((row) => {
      if (!ortMap.has(row.ort_id)) ortMap.set(row.ort_id, {
        id: row.ort_id, name: ortName(row.ort), ort: row.ort,
        anzahl: 0, ansitze: 0, kamera: 0, abschuesse: 0,
      });
      const wert = ortMap.get(row.ort_id);
      wert.anzahl += 1;
      if (istArt(row, "Ansitz")) wert.ansitze += 1;
      if (istArt(row, "Kamera")) wert.kamera += 1;
      if (istArt(row, "Abschuss")) wert.abschuesse += 1;
    });

    const hashtagMap = new Map();
    eintraege.forEach((row) => (row.hashtags || []).forEach((tag) => {
      const key = normalisieren(tag.bezeichnung);
      if (!key) return;
      const wert = hashtagMap.get(key) || { name: tag.bezeichnung, anzahl: 0 };
      wert.anzahl += 1;
      hashtagMap.set(key, wert);
    }));

    const artMap = new Map(arten.map((art) => [String(art.id), 0]));
    eintraege.forEach((row) => artMap.set(String(row.art_id), (artMap.get(String(row.art_id)) || 0) + 1));

    const abschussMap = new Map();
    eintraege.filter((row) => row.abschuss_id).forEach((row) => {
      if (!abschussMap.has(row.abschuss_id)) abschussMap.set(row.abschuss_id, row.wildgruppe || null);
    });
    const planGruppen = new Map();
    let haarFeder = 0;
    abschussMap.forEach((gruppe) => {
      if (!gruppe || gruppe.abschussplan !== true) { haarFeder += 1; return; }
      const key = String(gruppe.id);
      const wert = planGruppen.get(key) || { name: gruppe.bezeichnung, anzahl: 0 };
      wert.anzahl += 1;
      planGruppen.set(key, wert);
    });

    return {
      kennzahlen: {
        jagdtage: jagdtage.size,
        ansitze: eintraege.filter((row) => istArt(row, "Ansitz")).length,
        kamera: eintraege.filter((row) => istArt(row, "Kamera")).length,
        revierarbeit: eintraege.filter((row) => istArt(row, "Revierarbeit")).length,
        abschuesse: eintraege.filter((row) => istArt(row, "Abschuss")).length,
        orte: strukturierteOrte.size,
      },
      ansitzeMonat,
      orte: sortiert(ortMap),
      hashtags: sortiert(hashtagMap).slice(0, 10),
      aktivitaeten: arten.map((art) => ({ name: art.bezeichnung, anzahl: artMap.get(String(art.id)) || 0 })),
      abschuesse: {
        gesamt: abschussMap.size,
        gruppen: [...planGruppen.values()].sort((a, b) => a.name.localeCompare(b.name, "de")),
        haarFeder,
      },
    };
  }

  async function laden(jahr = "alle") {
    const filter = zeitraum(jahr);
    const { data, error } = await db.rpc("tagebuch_dp_zusammenfassung_daten", {
      p_von: filter.von, p_bis: filter.bis,
    });
    if (error) {
      console.error("Tagebuch-Zusammenfassung konnte nicht geladen werden:", error);
      throw new Error(error.message || "Die Zusammenfassung konnte nicht geladen werden.");
    }
    return auswerten(data || {});
  }

  return { laden };
})();
