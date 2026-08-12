window.JournalKategorienService = (() => {
  const db = window.db || window.supabase;
  function pruefen(result, text) { if (result.error) { console.error(text, result.error); throw new Error(result.error.message || text); } return result.data; }
  async function laden(nurAktive = false) {
    let query = db.from("journal_kategorien").select("id,nr,bezeichnung,aktiv").order("nr");
    if (nurAktive) query = query.eq("aktiv", true);
    return pruefen(await query, "Journal-Kategorien konnten nicht geladen werden.") || [];
  }
  async function anlegen(daten) {
    return pruefen(await db.from("journal_kategorien").insert({ nr: Number(daten.nr), bezeichnung: daten.bezeichnung.trim(), aktiv: daten.aktiv }).select().single(), "Journal-Kategorie konnte nicht angelegt werden.");
  }
  async function aendern(id, daten) {
    return pruefen(await db.from("journal_kategorien").update({ nr: Number(daten.nr), bezeichnung: daten.bezeichnung.trim(), aktiv: daten.aktiv }).eq("id", id).select().single(), "Journal-Kategorie konnte nicht gespeichert werden.");
  }
  async function loeschen(id) {
    const verwendet = pruefen(await db.rpc("journal_kategorie_verwendet", { p_kategorie_id: id }), "Verwendung konnte nicht geprüft werden.");
    if (verwendet) throw new Error("Diese Kategorie wird bereits verwendet und kann nur deaktiviert werden.");
    pruefen(await db.from("journal_kategorien").delete().eq("id", id), "Journal-Kategorie konnte nicht gelöscht werden.");
  }
  return { laden, anlegen, aendern, loeschen };
})();
