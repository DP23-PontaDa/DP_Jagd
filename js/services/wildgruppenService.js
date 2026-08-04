/* ==========================================
   DP_Jagd V2
   wildgruppenService.js
========================================== */

const WildgruppenService = (() => {
  const db = window.db || window.supabase;

  function datenbankfehler(error, aktion) {
    const fehler = new Error(
      `${aktion} ist fehlgeschlagen. Bitte versuchen Sie es erneut.`,
    );

    fehler.code = error && error.code;
    fehler.details = error && error.details;
    fehler.hint = error && error.hint;
    fehler.originalError = error;

    return fehler;
  }

  async function getWildgruppen() {
    const { data, error } = await db
      .from("wildgruppen")
      .select("*")
      .order("reihenfolge", { ascending: true });

    if (error) {
      throw datenbankfehler(error, "Das Laden der Wildgruppen");
    }

    return data || [];
  }

  async function createWildgruppe(daten) {
    const { error } = await db.from("wildgruppen").insert(daten);

    if (error) {
      console.error("Supabase Fehler:", error);
      throw datenbankfehler(error, "Das Anlegen der Wildgruppe");
    }
  }

  async function getAktiveWildgruppenNachAbschussplan(abschussplan) {
    const { data, error } = await db
      .from("wildgruppen")
      .select("*")
      .eq("aktiv", true)
      .eq("abschussplan", abschussplan === true)
      .order("reihenfolge", { ascending: true });

    if (error) {
      throw datenbankfehler(error, "Das Laden der Wildgruppen");
    }
    return data || [];
  }

  async function updateWildgruppe(id, daten) {
    const { error } = await db.from("wildgruppen").update(daten).eq("id", id);

    if (error) {
      throw datenbankfehler(error, "Das Speichern der Wildgruppe");
    }
  }

  async function deleteWildgruppe(id) {
    const { error } = await db.from("wildgruppen").delete().eq("id", id);

    if (error) {
      throw datenbankfehler(error, "Das Löschen der Wildgruppe");
    }
  }

  return {
    getWildgruppen,
    getAktiveWildgruppenNachAbschussplan,
    createWildgruppe,
    updateWildgruppe,
    deleteWildgruppe,
  };
})();
