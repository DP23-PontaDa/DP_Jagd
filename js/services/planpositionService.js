/* ==========================================
   DP_Jagd V2
   planpositionService.js
========================================== */

const PlanpositionService = (() => {
  const db = window.db || window.supabase;

  async function getWildgruppen() {
    const { data, error } = await db
      .from("wildgruppen")
      .select("*")
      .order("reihenfolge", { ascending: true })
      .order("code", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function getWildklassen(wildgruppeId) {
    const { data, error } = await db
      .from("wildklassen")
      .select("*")
      .eq("wildgruppe_id", wildgruppeId)
      .order("reihenfolge", { ascending: true })
      .order("code", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function getPlanpositionen(wildgruppeId = null) {
    let query = db
      .from("planpositionen")
      .select(`
        *,
        wildgruppen (
          id,
          code,
          bezeichnung,
          reihenfolge
        )
      `);

    if (wildgruppeId) {
      query = query.eq("wildgruppe_id", wildgruppeId);
    }

    const { data, error } = await query
      .order("reihenfolge", {
        ascending: true,
        referencedTable: "wildgruppen",
      })
      .order("reihenfolge", { ascending: true })
      .order("code", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function createPlanposition(daten) {
    const { data, error } = await db
      .from("planpositionen")
      .insert(daten)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function updatePlanposition(id, daten) {
    const { data, error } = await db
      .from("planpositionen")
      .update(daten)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function deactivatePlanposition(id) {
    return updatePlanposition(id, { aktiv: false });
  }

  async function deletePlanposition(id) {
    const { error } = await db
      .from("planpositionen")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  async function getMapping(planpositionId) {
    const { data, error } = await db
      .from("planposition_wildklasse")
      .select(`
        id,
        planposition_id,
        wildklasse_id,
        wildklassen (
          id,
          wildgruppe_id,
          code,
          bezeichnung,
          reihenfolge,
          aktiv
        )
      `)
      .eq("planposition_id", planpositionId)
      .order("reihenfolge", {
        ascending: true,
        referencedTable: "wildklassen",
      })
      .order("code", {
        ascending: true,
        referencedTable: "wildklassen",
      });

    if (error) throw error;
    return data || [];
  }

  async function saveMapping(planpositionId, wildklasseIds) {
    const aktuelleMappings = await getMapping(planpositionId);
    const aktuelleIds = new Set(
      aktuelleMappings.map((mapping) => String(mapping.wildklasse_id)),
    );
    const zielIds = new Set((wildklasseIds || []).map(String));

    const hinzuzufuegen = (wildklasseIds || []).filter(
      (wildklasseId) => !aktuelleIds.has(String(wildklasseId)),
    );
    const zuEntfernen = aktuelleMappings
      .filter((mapping) => !zielIds.has(String(mapping.wildklasse_id)))
      .map((mapping) => mapping.wildklasse_id);

    if (hinzuzufuegen.length) {
      const { error } = await db
        .from("planposition_wildklasse")
        .insert(
          hinzuzufuegen.map((wildklasseId) => ({
            planposition_id: planpositionId,
            wildklasse_id: wildklasseId,
          })),
        );

      if (error) throw error;
    }

    if (zuEntfernen.length) {
      const { error } = await db
        .from("planposition_wildklasse")
        .delete()
        .eq("planposition_id", planpositionId)
        .in("wildklasse_id", zuEntfernen);

      if (error) throw error;
    }

    return getMapping(planpositionId);
  }

  return {
    getWildgruppen,
    getWildklassen,
    getPlanpositionen,
    createPlanposition,
    updatePlanposition,
    deactivatePlanposition,
    deletePlanposition,
    getMapping,
    saveMapping,
  };
})();
