const AbschussregelnService = (() => {
  const db = window.db || window.supabase;
  const REGELTYPEN = [
    ["VORZIEHEN", "Vorgezogen"],
    ["SONDERFREIGABE", "Sonderfreigabe"],
    ["INDIVIDUELLES_FREI_DATUM", "Individuelles Frei-Datum"],
    ["INDIVIDUELLE_AUSNAHME", "Individuelle Ausnahme"],
    ["INITIAL", "Initial"],
    ["SPERRE", "Sperre"],
  ];
  function check(result) { if (result.error) throw result.error; return result.data; }
  function findeErfuellendenVorziehungsAbschuss(regel, abschuesse) {
    if (!regel || regel.regel_typ !== "VORZIEHEN") return null;
    const freigabejahr = Number(regel.freigabejahr || String(regel.frei_ab || "").slice(0, 4));
    if (!Number.isInteger(freigabejahr)) return null;
    const freiAb = String(regel.frei_ab || `${freigabejahr}-01-01`).slice(0, 10);
    return (abschuesse || [])
      .filter((abschuss) => AbschussWirkung.istFreigabewirksamerHirschabschuss(abschuss) &&
        String(abschuss.jaeger_id) === String(regel.jaeger_id) &&
        String(abschuss.wildklasse_id) === String(regel.wildklasse_id) &&
        Number(String(abschuss.datum || "").slice(0, 4)) === freigabejahr &&
        String(abschuss.datum || "").slice(0, 10) >= freiAb)
      .sort((a, b) => String(a.datum || "").localeCompare(String(b.datum || "")))[0] || null;
  }
  async function laden() {
    const [regelnResult, abschuesseResult] = await Promise.all([
      db.from("abschussregeln").select(
        "*,wildklasse:wildklassen(id,bezeichnung,reihenfolge,wildgruppe:wildgruppen(id,bezeichnung,reihenfolge)),jaeger:personen(id,vorname,nachname,name_kat)"
      ).not("jaeger_id", "is", null),
      db.from("abschuesse").select("id,datum,jaeger_id,wildklasse_id,fallwild,sonderabschuss").eq("fallwild", false),
    ]);
    const abschuesse = check(abschuesseResult) || [];
    const regeln = (check(regelnResult) || []).map((regel) => {
      const erfuelltDurch = findeErfuellendenVorziehungsAbschuss(regel, abschuesse);
      return { ...regel, erfuellt: Boolean(erfuelltDurch), erfuellt_durch: erfuelltDurch };
    });
    return regeln.sort((a, b) =>
      WildklassenService.vergleicheNachWildgruppeUndWildklasse(a.wildklasse, b.wildklasse) ||
      String(a.jaeger?.nachname || "").localeCompare(String(b.jaeger?.nachname || ""), "de") ||
      String(a.jaeger?.vorname || "").localeCompare(String(b.jaeger?.vorname || ""), "de") ||
      Number(a.freigabejahr || 0) - Number(b.freigabejahr || 0) ||
      Number(a.nr || 0) - Number(b.nr || 0));
  }
  async function jaegerLaden() {
    const personen = await AbschussService.getAuswaehlbareAbschussJaeger();
    return personen.filter((person) =>
      String(person.name_kat || "").trim().toLocaleLowerCase("de") === "mitglied" &&
      person.aktiv === true)
      .sort((a, b) => String(a.nachname || "").localeCompare(String(b.nachname || ""), "de") ||
        String(a.vorname || "").localeCompare(String(b.vorname || ""), "de"));
  }
  async function naechsteNr() {
    const rows = check(await db.from("abschussregeln").select("nr").order("nr", { ascending: false }).limit(1)) || [];
    return Number(rows[0]?.nr || 0) + 1;
  }
  async function speichern(daten, id) {
    const freiAbEingabe = String(daten.frei_ab ?? "").trim();
    const speicherdaten = { ...daten, frei_ab: freiAbEingabe || null };
    if (!Number.isInteger(Number(speicherdaten.freigabejahr))) {
      throw new Error("Freigabejahr ist erforderlich.");
    }
    if (speicherdaten.frei_ab && Number(speicherdaten.frei_ab.slice(0, 4)) !== Number(speicherdaten.freigabejahr)) {
      throw new Error(`Das Datum Frei ab muss innerhalb des Freigabejahres ${speicherdaten.freigabejahr} liegen.`);
    }
    const query = id ? db.from("abschussregeln").update(speicherdaten).eq("id", id)
      : db.from("abschussregeln").insert(speicherdaten);
    return check(await query.select().single());
  }
  async function loeschen(id) { check(await db.from("abschussregeln").delete().eq("id", id)); }
  return { REGELTYPEN, findeErfuellendenVorziehungsAbschuss, laden, jaegerLaden, naechsteNr, speichern, loeschen };
})();
