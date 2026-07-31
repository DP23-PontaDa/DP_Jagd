const AbschussService = (() => {
  const db = window.db || window.supabase;

  function fehler(error, aktion) {
    const result = new Error(`${aktion} ist fehlgeschlagen. Bitte versuchen Sie es erneut.`);
    result.code = error && error.code;
    return result;
  }

  async function getAbschuesse() {
    const { data, error } = await db
      .from("abschuesse")
      .select(`
        id, nr, datum, jaeger_id, wildgruppe_id, wildklasse_id, gewicht,
        preis_pro_kg, gesamtpreis, wildhaendler_id, zahlungseingang,
        zusatzinfo, bemerkung,
        fallwild, untersuchungsprotokoll_nr, erstellt_am, geaendert_am,
        jaeger:personen (id, vorname, nachname),
        wildgruppen (id, bezeichnung),
        wildklassen (id, bezeichnung, wildgruppe_id),
        wildhaendler (id, bezeichnung)
      `)
      .order("datum", { ascending: false })
      .order("nr", { ascending: false });
    if (error) throw fehler(error, "Das Laden der Abschüsse");
    return data || [];
  }

  async function getAbschuss(id) {
    const { data, error } = await db
      .from("abschuesse")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw fehler(error, "Das Laden des Abschusses");
    return data;
  }

  async function createAbschuss(daten) {
    const { data, error } = await db
      .from("abschuesse")
      .insert(daten)
      .select()
      .single();
    if (error) throw fehler(error, "Das Anlegen des Abschusses");
    return data;
  }

  async function updateAbschuss(id, daten) {
    const { data, error } = await db
      .from("abschuesse")
      .update(daten)
      .eq("id", id)
      .select()
      .single();
    if (error) throw fehler(error, "Das Speichern des Abschusses");
    return data;
  }

  async function deleteAbschuss(id) {
    const { error } = await db.from("abschuesse").delete().eq("id", id);
    if (error) throw fehler(error, "Das Löschen des Abschusses");
  }

  async function getNaechsteAbschussnummer(jahr) {
    const { data, error } = await db
      .from("abschuesse")
      .select("nr")
      .eq("jahr", Number(jahr));
    if (error) throw fehler(error, "Das Ermitteln der nächsten Abschussnummer");

    const hoechsteNummer = (data || []).reduce((maximum, eintrag) => {
      const nummer = Number(eintrag.nr);
      return Number.isFinite(nummer) ? Math.max(maximum, nummer) : maximum;
    }, 0);

    return hoechsteNummer + 1;
  }

  async function istAbschussnummerVergeben(jahr, nr, aktuellerDatensatz) {
    let query = db
      .from("abschuesse")
      .select("id")
      .eq("jahr", Number(jahr))
      .eq("nr", Number(nr))
      .limit(1);

    if (aktuellerDatensatz) {
      query = query.neq("id", aktuellerDatensatz);
    }

    const { data, error } = await query;
    if (error) throw fehler(error, "Das Prüfen der Abschussnummer");
    return Boolean(data && data.length);
  }

  async function getAktiveWildhaendler() {
    const { data, error } = await db
      .from("wildhaendler")
      .select("id, bezeichnung, preis_pro_kg, reihenfolge")
      .eq("aktiv", true)
      .order("reihenfolge", { ascending: true });
    if (error) throw fehler(error, "Das Laden der Wildhändler");
    return data || [];
  }

  async function getJaeger() {
    const { data, error } = await db
      .from("abschuss_jaeger")
      .select("id, vorname, nachname")
      .order("nachname", { ascending: true })
      .order("vorname", { ascending: true });
    if (error) throw fehler(error, "Das Laden der Jäger");
    return data || [];
  }

  return {
    getAbschuesse, getAbschuss, createAbschuss, updateAbschuss,
    deleteAbschuss, getNaechsteAbschussnummer,
    istAbschussnummerVergeben, getAktiveWildhaendler, getJaeger,
  };
})();
