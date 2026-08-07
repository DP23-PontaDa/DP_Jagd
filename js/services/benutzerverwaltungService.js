const BenutzerverwaltungService = (() => {
  const db = window.db || window.supabase;

  function fehler(error, fallback) {
    const result = new Error(error?.message || fallback);
    result.code = error?.code;
    return result;
  }

  async function laden() {
    const [profile, rollen, module, rechte] = await Promise.all([
      db.from("app_benutzerprofile").select("id, benutzername, rolle_id, aktiv, rolle:app_rollen(id, name, reihenfolge)")
        .order("benutzername", { ascending: true }),
      db.from("app_rollen").select("id, name, reihenfolge").order("reihenfolge"),
      db.from("app_module").select("code, bezeichnung, reihenfolge").order("reihenfolge"),
      db.from("app_rollen_rechte").select("rolle_id, modul_code, lesen, bearbeiten, loeschen"),
    ]);
    const fehlgeschlagen = [profile, rollen, module, rechte].find((result) => result.error);
    if (fehlgeschlagen) throw fehler(fehlgeschlagen.error, "Benutzerverwaltung konnte nicht geladen werden.");
    return {
      profile: profile.data || [], rollen: rollen.data || [],
      module: module.data || [], rechte: rechte.data || [],
    };
  }

  async function benutzerSpeichern(id, daten) {
    return benutzerVerwalten("speichern", { ...daten, benutzer_id: id });
  }

  async function benutzerAnlegen(daten) {
    return benutzerVerwalten("anlegen", daten);
  }

  async function benutzerVerwalten(aktion, daten) {
    const { data, error } = await db.functions.invoke("benutzer-verwalten", {
      body: {
        aktion,
        benutzer_id: daten.benutzer_id || null,
        benutzername: daten.benutzername.trim(),
        passwort: daten.passwort || "",
        rolle_id: daten.rolle_id,
        aktiv: daten.aktiv === true,
      },
    });
    if (error) throw fehler(error, "Benutzer konnte nicht gespeichert werden.");
    if (data?.error) throw fehler(data, "Benutzer konnte nicht gespeichert werden.");
    return data;
  }

  async function rechteSpeichern(rolleId, eintraege) {
    const { error } = await db.rpc("app_speichere_rollen_rechte", {
      p_rolle_id: rolleId,
      p_rechte: eintraege,
    });
    if (error) throw fehler(error, "Rechte konnten nicht gespeichert werden.");
  }

  return { laden, benutzerAnlegen, benutzerSpeichern, rechteSpeichern };
})();
