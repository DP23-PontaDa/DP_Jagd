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
  async function laden() {
    const regeln = check(await db.from("abschussregeln").select(
      "*,wildklasse:wildklassen(id,bezeichnung,reihenfolge,wildgruppe:wildgruppen(id,bezeichnung,reihenfolge)),jaeger:personen(id,vorname,nachname,name_kat)"
    ).not("jaeger_id", "is", null)) || [];
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
      String(person.name_kat || "").trim().toLocaleLowerCase("de") === "mitglied")
      .sort((a, b) => String(a.nachname || "").localeCompare(String(b.nachname || ""), "de") ||
        String(a.vorname || "").localeCompare(String(b.vorname || ""), "de"));
  }
  async function naechsteNr() {
    const rows = check(await db.from("abschussregeln").select("nr").order("nr", { ascending: false }).limit(1)) || [];
    return Number(rows[0]?.nr || 0) + 1;
  }
  async function speichern(daten, id) {
    if (!Number.isInteger(Number(daten.freigabejahr))) {
      throw new Error("Freigabejahr ist erforderlich.");
    }
    if (daten.frei_ab && Number(String(daten.frei_ab).slice(0, 4)) !== Number(daten.freigabejahr)) {
      throw new Error(`Das Datum Frei ab muss innerhalb des Freigabejahres ${daten.freigabejahr} liegen.`);
    }
    const query = id ? db.from("abschussregeln").update(daten).eq("id", id)
      : db.from("abschussregeln").insert(daten);
    return check(await query.select().single());
  }
  async function loeschen(id) { check(await db.from("abschussregeln").delete().eq("id", id)); }
  return { REGELTYPEN, laden, jaegerLaden, naechsteNr, speichern, loeschen };
})();
