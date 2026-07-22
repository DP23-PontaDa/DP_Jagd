/* ==========================================
   DP_Jagd V2
   wildklassenService.js
========================================== */

const WildklassenService = (() => {
  const db = window.db || window.supabase;

  async function getWildgruppen() {
    const { data, error } = await db
      .from("wildgruppen")
      .select("*")
      .order("bezeichnung");

    if (error) throw error;

    return data;
  }

  async function getWildklassen(wildgruppeId) {
    const { data, error } = await db
      .from("wildklassen")
      .select("*")
      .eq("wildgruppe_id", wildgruppeId)
      .order("reihenfolge");

    if (error) throw error;

    return data;
  }

  async function updateWildklasse(id, daten) {
    const { error } = await db.from("wildklassen").update(daten).eq("id", id);

    if (error) throw error;
  }

  async function deleteWildklasse(id) {
    const { error } = await db.from("wildklassen").delete().eq("id", id);

    if (error) throw error;
  }

  async function createWildklasse(daten) {
    const { error } = await db.from("wildklassen").insert(daten);

    if (error) throw error;
  }

  return {
    getWildgruppen,
    getWildklassen,
    createWildklasse,
    updateWildklasse,
    deleteWildklasse
  };
})();
