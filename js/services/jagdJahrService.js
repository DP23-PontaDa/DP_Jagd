const JagdJahrService = (() => {
  const db = window.db || window.supabase;
  const normal = (wert) => String(wert || "").trim().toLocaleLowerCase("de");
  function pruefen(result, meldung) { if (result.error) { console.error(meldung, result.error); throw new Error(result.error.message || meldung); } return result.data || []; }

  async function verfuegbareJahre() {
    const rows = pruefen(await db.from("abschuesse").select("datum").not("datum", "is", null).order("datum"), "Jagdjahre konnten nicht geladen werden.");
    return [...new Set([...rows.map((row) => Number(String(row.datum).slice(0, 4))), new Date().getFullYear()])].sort((a, b) => b - a);
  }

  // Gemeinsame Rohdatenquelle für Übersicht Jahr, Rotwild-Freigabe und Verlauf.
  async function abschuesseZeitraum(von, bis) {
    return pruefen(await db.from("abschuesse").select(`
      id,nr,datum,tageszeit,fallwild,sonderabschuss,alter,wildklasse_id,wildgruppe_id,
      jaeger:personen(id,vorname,nachname),
      wildgruppe:wildgruppen(id,bezeichnung),
      wildklasse:wildklassen(id,code,bezeichnung,kuerzel),
      erlegungsort:orte(id,name,art,reviereinrichtung)
    `).gte("datum", von).lte("datum", bis).order("datum").order("nr"), "Abschüsse des Jagdjahres konnten nicht geladen werden.");
  }
  async function abschuesse(jahr) { return abschuesseZeitraum(`${jahr}-01-01`, `${jahr}-12-31`); }

  // Stabile Codes zuerst; die gleichwertige Stammdatenbezeichnung dient nur
  // als Fallback für historische Datensätze ohne gepflegten Code.
  function klassifiziereRotwildAbschuss(abschuss) {
    const code = String(abschuss?.wildklasse?.code || "").trim().toUpperCase();
    const name = normal(abschuss?.wildklasse?.bezeichnung);
    if (code === "HIRSCH_A" || name === "hirsch a") return "A";
    if (["HIRSCH_B", "HIRSCH_B1"].includes(code) || ["hirsch b", "hirsch b1"].includes(name)) return "B";
    if (["TIER", "SCHMALTIER", "KALB_MAENNLICH", "KALB_WEIBLICH", "KALB_M", "KALB_W"].includes(code)
      || ["tier", "schmaltier", "kalb männlich", "kalb weiblich"].includes(name)) return "KW";
    return null;
  }

  async function rotwildFreigabeDaten(jahr) {
    const bisJahr = Number(jahr);
    const leer = { jahr: bisJahr, aktuellesKahlwild: 0, kahlwildAbschussJahre: [], erlegteHirschAJahre: [], erlegteHirschBJahre: [], freigabeEreignisse: [], rohdaten: [], quelle: {} };
    if (bisJahr < 2025) return leer;
    const alle = await abschuesseZeitraum("2025-05-01", `${bisJahr}-12-31`);
    const rohdaten = alle.filter((abschuss) => normal(abschuss.wildgruppe?.bezeichnung) === "rotwild")
      .map((abschuss) => ({ ...abschuss, kategorie: klassifiziereRotwildAbschuss(abschuss) }));
    const quelle = {
      geladeneAbschuesse: rohdaten.length,
      kahlwildWildklassen: new Set(rohdaten.filter((row) => row.kategorie === "KW").map((row) => row.wildklasse_id)).size,
      hirschAWildklassen: new Set(rohdaten.filter((row) => row.kategorie === "A").map((row) => row.wildklasse_id)).size,
      hirschBWildklassen: new Set(rohdaten.filter((row) => row.kategorie === "B").map((row) => row.wildklasse_id)).size,
      fallwildAusgeschlossen: rohdaten.filter((row) => row.fallwild === true).length,
      sonderabschuesseAusgeschlossen: rohdaten.filter((row) => row.sonderabschuss === true && ["A", "B"].includes(row.kategorie)).length,
      unbekannt: rohdaten.filter((row) => !row.kategorie).length,
    };
    const kahlwildAbschussJahre = [], erlegteHirschAJahre = [], erlegteHirschBJahre = [], freigabeEreignisse = [];
    rohdaten.forEach((abschuss) => {
      if (abschuss.fallwild === true || !abschuss.kategorie) return;
      const abschussJahr = Number(String(abschuss.datum || "").slice(0, 4));
      if (!Number.isInteger(abschussJahr)) return;
      const basis = { id: abschuss.id, nr: abschuss.nr, datum: String(abschuss.datum).slice(0, 10) };
      if (abschuss.kategorie === "KW") { kahlwildAbschussJahre.push(abschussJahr); freigabeEreignisse.push({ ...basis, typ: "KAHLWILD" }); }
      if (abschuss.kategorie === "A" && abschuss.sonderabschuss !== true) { erlegteHirschAJahre.push(abschussJahr); freigabeEreignisse.push({ ...basis, typ: "HIRSCH_A" }); }
      if (abschuss.kategorie === "B" && abschuss.sonderabschuss !== true) { erlegteHirschBJahre.push(abschussJahr); freigabeEreignisse.push({ ...basis, typ: "HIRSCH_B" }); }
    });
    freigabeEreignisse.sort((a, b) => String(a.datum).localeCompare(String(b.datum)) || Number(a.nr || 0) - Number(b.nr || 0));
    return { jahr: bisJahr, aktuellesKahlwild: kahlwildAbschussJahre.length, kahlwildAbschussJahre, erlegteHirschAJahre, erlegteHirschBJahre, freigabeEreignisse, rohdaten, quelle };
  }

  async function hirschAFreigabeDaten(jahr) { return rotwildFreigabeDaten(jahr); }
  async function hirschAFreigabeEreignisse(jahr) { return (await hirschAFreigabeDaten(jahr)).freigabeEreignisse || []; }
  async function datenFuerJahr(jahr) { const [jahresAbschuesse, freigabeEreignisse] = await Promise.all([abschuesse(jahr), hirschAFreigabeEreignisse(jahr)]); return { abschuesse: jahresAbschuesse, freigabeEreignisse }; }
  return { verfuegbareJahre, abschuesse, abschuesseZeitraum, datenFuerJahr, rotwildFreigabeDaten, klassifiziereRotwildAbschuss, hirschAFreigabeDaten, hirschAFreigabeEreignisse };
})();
