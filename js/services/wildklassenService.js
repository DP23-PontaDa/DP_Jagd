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
      .order("reihenfolge");

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

  async function getAktiveWildklassenByWildgruppe(wildgruppeId) {
    const { data, error } = await db
      .from("wildklassen")
      .select("*")
      .eq("wildgruppe_id", wildgruppeId)
      .eq("aktiv", true)
      .order("reihenfolge", { ascending: true });

    if (error) throw error;

    return data || [];
  }

  async function getAktiveWildklassen() {
    const { data, error } = await db
      .from("wildklassen")
      .select("*")
      .eq("aktiv", true)
      .order("reihenfolge", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function getAktivePlanWildklassen() {
    const periodenResult = await db
      .from("planperioden")
      .select("id")
      .eq("status", "AKTIV")
      .maybeSingle();
    if (periodenResult.error) throw periodenResult.error;
    if (!periodenResult.data) return [];

    const positionenResult = await db
      .from("planperiode_planpositionen")
      .select("id, wildgruppe_id, reihenfolge")
      .eq("planperiode_id", periodenResult.data.id)
      .eq("aktiv", true)
      .order("reihenfolge", { ascending: true });
    if (positionenResult.error) throw positionenResult.error;
    const positionen = positionenResult.data || [];
    if (!positionen.length) return [];

    const positionById = new Map(
      positionen.map((position) => [String(position.id), position]),
    );
    const mappingResult = await db
      .from("planperiode_planposition_wildklasse")
      .select(`
        planperiode_planposition_id,
        wildklasse_id,
        wildklasse_code,
        wildklasse_bezeichnung,
        wildklassen!inner (aktiv, reihenfolge)
      `)
      .eq("planperiode_id", periodenResult.data.id)
      .eq("wildklassen.aktiv", true)
      .in("planperiode_planposition_id", positionen.map((position) => position.id));
    if (mappingResult.error) throw mappingResult.error;

    return (mappingResult.data || [])
      .map((mapping) => {
        const position = positionById.get(
          String(mapping.planperiode_planposition_id),
        );
        return {
          id: mapping.wildklasse_id,
          value: mapping.wildklasse_id,
          code: mapping.wildklasse_code || "",
          bezeichnung: mapping.wildklasse_bezeichnung || "",
          label: mapping.wildklasse_bezeichnung || "",
          wildgruppe_id: position?.wildgruppe_id,
          planposition_reihenfolge: Number(position?.reihenfolge) || 0,
          wildklasse_reihenfolge: Number(mapping.wildklassen?.reihenfolge) || 0,
        };
      })
      .sort(
        (left, right) =>
          left.planposition_reihenfolge - right.planposition_reihenfolge ||
          left.wildklasse_reihenfolge - right.wildklasse_reihenfolge,
      );
  }

  async function getAktivePlanWildklassenByWildgruppe(wildgruppeId) {
    const wildklassen = await getAktivePlanWildklassen();
    return wildklassen.filter(
      (wildklasse) =>
        String(wildklasse.wildgruppe_id) === String(wildgruppeId),
    );
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
    getAktiveWildklassenByWildgruppe,
    getAktiveWildklassen,
    getAktivePlanWildklassen,
    getAktivePlanWildklassenByWildgruppe,
    createWildklasse,
    updateWildklasse,
    deleteWildklasse
  };
})();
