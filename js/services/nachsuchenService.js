const NachsuchenService = (() => {
  const db = window.db || window.supabase;
  const tabellen = {
    nachsuchen: "nachsuchen",
    fehlschuesse: "fehlschuesse",
    probeschuesse: "probeschuesse",
  };

  function tabelle(typ) {
    const name = tabellen[typ];
    if (!name) throw new Error("Unbekannter Nachsuchen-Modus.");
    return name;
  }

  function pruefen(result, aktion) {
    if (result.error) {
      console.error(aktion, result.error);
      const error = new Error(`${aktion} ist fehlgeschlagen.`);
      error.code = result.error.code;
      throw error;
    }
    return result.data;
  }

  function auswahl(typ) {
    if (typ === "nachsuchen") return `
      id, nr, datum, jaeger_id, hundefuehrer_id, wildgruppe_id,
      wildklasse_id, ort_id, ort, info, wild_gefunden, erstellt_am, geaendert_am,
      jaeger:personen!nachsuchen_jaeger_fk (id, vorname, nachname),
      hundefuehrer:personen!nachsuchen_hundefuehrer_fk (id, vorname, nachname),
      wildgruppen (id, bezeichnung), wildklassen (id, bezeichnung, wildgruppe_id),
      ort_stammdaten:orte (id, nr, name, art, latitude, longitude)`;
    if (typ === "fehlschuesse") return `
      id, nr, datum, jaeger_id, wildgruppe_id, wildklasse_id, ort, info,
      erstellt_am, geaendert_am, jaeger:personen (id, vorname, nachname),
      wildgruppen (id, bezeichnung), wildklassen (id, bezeichnung, wildgruppe_id)`;
    return `id, nr, datum, jaeger_id, ort, info, erstellt_am, geaendert_am,
      jaeger:personen (id, vorname, nachname)`;
  }

  async function getEintraege(typ) {
    const result = await db.from(tabelle(typ)).select(auswahl(typ))
      .order("datum", { ascending: false }).order("nr", { ascending: false });
    return pruefen(result, "Das Laden der Einträge") || [];
  }

  async function getJaeger() {
    const result = await db.from("abschuss_jaeger")
      .select("id, vorname, nachname")
      .order("nachname", { ascending: true }).order("vorname", { ascending: true });
    return pruefen(result, "Das Laden der Jäger") || [];
  }

  async function getHundefuehrer() {
    const result = await db.from("personen")
      .select("id, vorname, nachname")
      .eq("name_kat", "Hundefuehrer").eq("aktiv", true)
      .order("nachname", { ascending: true }).order("vorname", { ascending: true });
    return pruefen(result, "Das Laden der Hundeführer") || [];
  }

  async function getNaechsteNummer(typ, jahr) {
    const rows = pruefen(
      await db.from(tabelle(typ)).select("nr").eq("jahr", Number(jahr)),
      "Das Ermitteln der nächsten Nummer",
    ) || [];
    return rows.reduce((maximum, row) => Math.max(maximum, Number(row.nr) || 0), 0) + 1;
  }

  async function istNummerVergeben(typ, jahr, nr, aktuelleId = null) {
    let query = db.from(tabelle(typ)).select("id")
      .eq("jahr", Number(jahr)).eq("nr", Number(nr)).limit(1);
    if (aktuelleId) query = query.neq("id", aktuelleId);
    return (pruefen(await query, "Das Prüfen der Nummer") || []).length > 0;
  }

  async function createEintrag(typ, daten) {
    return pruefen(
      await db.from(tabelle(typ)).insert(daten).select().single(),
      "Das Anlegen des Eintrags",
    );
  }

  async function updateEintrag(typ, id, daten) {
    return pruefen(
      await db.from(tabelle(typ)).update(daten).eq("id", id).select().single(),
      "Das Speichern des Eintrags",
    );
  }

  async function deleteEintrag(typ, id) {
    pruefen(await db.from(tabelle(typ)).delete().eq("id", id), "Das Löschen des Eintrags");
  }

  return {
    getEintraege, getJaeger, getHundefuehrer, getNaechsteNummer,
    istNummerVergeben, createEintrag, updateEintrag, deleteEintrag,
  };
})();

window.NachsuchenService = NachsuchenService;
