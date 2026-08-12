window.TagebuchartenService = (() => {
  const db = window.db || window.supabase;

  function pruefen(result, text) {
    if (result.error) {
      console.error(text, result.error);
      throw new Error(result.error.message || text);
    }
    return result.data;
  }

  async function laden(nurAktive = false) {
    let query = db.from("tagebuch_arten").select("id,nr,bezeichnung,aktiv")
      .order("nr", { ascending: true });
    if (nurAktive) query = query.eq("aktiv", true);
    return pruefen(await query, "Tagebucharten konnten nicht geladen werden.") || [];
  }

  async function anlegen(daten) {
    return pruefen(await db.from("tagebuch_arten").insert({
      nr: Number(daten.nr), bezeichnung: daten.bezeichnung.trim(), aktiv: daten.aktiv === true,
    }).select().single(), "Tagebuchart konnte nicht angelegt werden.");
  }

  async function aendern(id, daten) {
    return pruefen(await db.from("tagebuch_arten").update({
      nr: Number(daten.nr), bezeichnung: daten.bezeichnung.trim(), aktiv: daten.aktiv === true,
    }).eq("id", id).select().single(), "Tagebuchart konnte nicht gespeichert werden.");
  }

  async function verwendungsanzahl(id) {
    const result = await db.rpc("tagebuch_art_verwendet", { p_art_id: id });
    return pruefen(result, "Verwendung der Tagebuchart konnte nicht geprüft werden.") ? 1 : 0;
  }

  async function loeschen(id) {
    if (await verwendungsanzahl(id)) {
      throw new Error("Diese Tagebuchart wird bereits verwendet und kann nur deaktiviert werden.");
    }
    pruefen(await db.from("tagebuch_arten").delete().eq("id", id),
      "Tagebuchart konnte nicht gelöscht werden.");
  }

  return { laden, anlegen, aendern, loeschen, verwendungsanzahl };
})();
