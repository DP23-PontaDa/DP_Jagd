const AbschussService = (() => {
  const db = window.db || window.supabase;

  function fehler(error, aktion) {
    const result = new Error(`${aktion} ist fehlgeschlagen. Bitte versuchen Sie es erneut.`);
    result.code = error && error.code;
    return result;
  }

  async function getAbschuesse() {
    const [abschussResult, rechnungspositionenResult] = await Promise.all([
      db.from("abschuesse").select(`
        id, nr, datum, jaeger_id, wildgruppe_id, wildklasse_id, gewicht,
        preis_pro_kg, gesamtpreis, wildhaendler_id, zahlungseingang,
        zusatzinfo, bemerkung,
        fallwild, untersuchungsprotokoll_nr, erstellt_am, geaendert_am,
        jaeger:personen (id, vorname, nachname),
        wildgruppen (id, bezeichnung, rechnung_moeglich),
        wildklassen (id, bezeichnung, wildgruppe_id),
        wildhaendler (id, code, bezeichnung, rechnung_moeglich)
      `)
      .order("datum", { ascending: false })
      .order("nr", { ascending: false }),
      db.from("rechnungspositionen").select("abschuss_id, rechnung_id"),
    ]);
    if (abschussResult.error) throw fehler(abschussResult.error, "Das Laden der Abschüsse");
    if (rechnungspositionenResult.error) {
      throw fehler(rechnungspositionenResult.error, "Das Laden der Rechnungszuordnungen");
    }
    const verrechneteAbschuesse = new Set((rechnungspositionenResult.data || [])
      .map((position) => String(position.abschuss_id)));
    return (abschussResult.data || []).map((abschuss) => ({
      ...abschuss,
      rechnung_vorhanden: verrechneteAbschuesse.has(String(abschuss.id)),
    }));
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

  async function getNaechsteAbschussnummer(jahr, bereich = null) {
    let query = db
      .from("abschuesse")
      .select("nr")
      .eq("jahr", Number(jahr));
    if (bereich?.von != null) query = query.gte("nr", Number(bereich.von));
    if (bereich?.bis != null) query = query.lte("nr", Number(bereich.bis));
    if (bereich?.wildgruppeIds?.length) {
      query = query.in("wildgruppe_id", bereich.wildgruppeIds);
    }
    const { data, error } = await query;
    if (error) throw fehler(error, "Das Ermitteln der nächsten Abschussnummer");

    const startwert = bereich?.von != null ? Number(bereich.von) - 1 : 0;
    const hoechsteNummer = (data || []).reduce((maximum, eintrag) => {
      const nummer = Number(eintrag.nr);
      return Number.isFinite(nummer) ? Math.max(maximum, nummer) : maximum;
    }, startwert);

    const naechsteNummer = hoechsteNummer + 1;
    if (bereich?.bis != null && naechsteNummer > Number(bereich.bis)) {
      const error = new Error("Der Nummernbereich ist ausgeschöpft.");
      error.code = "NUMMERNBEREICH_AUSGESCHOEPFT";
      throw error;
    }
    return naechsteNummer;
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
      .select("id, bezeichnung, preis_pro_kg, reihenfolge, rechnung_moeglich")
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
