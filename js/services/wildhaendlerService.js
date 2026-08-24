const WildhaendlerService = (() => {
  const db = window.db || window.supabase;

  function fehler(error, aktion) {
    const result = new Error(`${aktion} ist fehlgeschlagen. Bitte versuchen Sie es erneut.`);
    result.code = error && error.code;
    return result;
  }

  async function getWildhaendler() {
    const { data, error } = await db
      .from("wildhaendler")
      .select("id, reihenfolge, code, bezeichnung, rechnungstext, preis_pro_kg, rechnung_moeglich, aktiv")
      .order("reihenfolge", { ascending: true });
    if (error) throw fehler(error, "Das Laden der Wildhändler");
    return data || [];
  }

  async function createWildhaendler(daten) {
    const { error } = await db.from("wildhaendler").insert(daten);
    if (error) throw fehler(error, "Das Anlegen des Wildhändlers");
  }

  async function updateWildhaendler(id, daten) {
    const { error } = await db.from("wildhaendler").update(daten).eq("id", id);
    if (error) throw fehler(error, "Das Speichern des Wildhändlers");
  }

  async function deleteWildhaendler(id) {
    const { error } = await db.from("wildhaendler").delete().eq("id", id);
    if (error) throw fehler(error, "Das Löschen des Wildhändlers");
  }

  return {
    getWildhaendler,
    createWildhaendler,
    updateWildhaendler,
    deleteWildhaendler,
  };
})();
