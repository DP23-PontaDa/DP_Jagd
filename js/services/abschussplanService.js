/* ===========================================================
   DP_Jagd
   abschussplanService.js
   Version 1.0
=========================================================== */

const AbschussplanService = (() => {
  const db = window.db || window.supabase;

  const TABLE = {
    PLANPERIODEN: "planperioden",
    WILDGRUPPEN: "wildgruppen",
    WILDKLASSEN: "wildklassen",
    PLAENE: "abschussplaene",
    POSITIONEN: "abschussplan_positionen",
  };

  function handle(result, text) {
    if (result.error) {
      console.error(text, result.error);
      return null;
    }

    return result.data;
  }

  /* =======================================================
       PLANPERIODEN
    ======================================================= */

  async function getAktivePlanperiode() {
    const result = await db
      .from(TABLE.PLANPERIODEN)
      .select("*")
      .eq("status", "AKTIV")
      .maybeSingle();

    return handle(result, "Fehler in getAktivePlanperiode");
  }

  async function getPlanperioden() {
    const result = await db
      .from(TABLE.PLANPERIODEN)
      .select("*")
      .order("startjahr", { ascending: false });

    //console.log("getPlanperioden()", result);

    return handle(result, "Fehler in getPlanperioden") || [];
  }

  async function createPlanperiode(data) {
    const result = await db
      .from(TABLE.PLANPERIODEN)
      .insert(data)
      .select()
      .single();

    return handle(result, "Fehler in createPlanperiode");
  }

  async function updatePlanperiode(id, data) {
    const result = await db
      .from(TABLE.PLANPERIODEN)
      .update(data)
      .eq("id", id)
      .select()
      .single();

    return handle(result, "Fehler in updatePlanperiode");
  }

  async function deletePlanperiode(id) {
    try {
      const plaene = await getAbschussplaene(id);

      for (const plan of plaene) {
        const positionen = await getPositionen(plan.id);

        for (const position of positionen) {
          const result = await db
            .from(TABLE.POSITIONEN)
            .delete()
            .eq("id", position.id);

          if (result.error) {
            throw result.error;
          }
        }

        const planResult = await db
          .from(TABLE.PLAENE)
          .delete()
          .eq("id", plan.id);

        if (planResult.error) {
          throw planResult.error;
        }
      }

      const periodResult = await db
        .from(TABLE.PLANPERIODEN)
        .delete()
        .eq("id", id);

      if (periodResult.error) {
        throw periodResult.error;
      }

      return true;
    } catch (error) {
      console.error("deletePlanperiode", error);
      return false;
    }
  }

  async function setPlanperiodeStatus(id, status) {
    try {
      if (status === "AKTIV") {
        const archiveResult = await db
          .from(TABLE.PLANPERIODEN)
          .update({
            status: "ARCHIV",
          })
          .eq("status", "AKTIV");

        if (archiveResult.error) throw archiveResult.error;
      }

      const result = await db
        .from(TABLE.PLANPERIODEN)
        .update({
          status: status,
        })
        .eq("id", id)
        .select()
        .single();

      if (result.error) {
        console.error(result.error);
        alert(result.error.message);
        return null;
      }

      return result.data;
    } catch (error) {
      console.error("setPlanperiodeStatus", error);

      alert(JSON.stringify(error));

      return null;
    }
  }

  /* =======================================================
       WILDGRUPPEN
    ======================================================= */

  async function getWildgruppen() {
    const result = await db
      .from(TABLE.WILDGRUPPEN)
      .select("*")
      .order("reihenfolge");

    return handle(result, "Fehler in getWildgruppen") || [];
  }

  async function getWildklassen(wildgruppeId, nurAktive = true) {
    let query = db
      .from(TABLE.WILDKLASSEN)
      .select("*")
      .eq("wildgruppe_id", wildgruppeId);

    if (nurAktive) {
      query = query.eq("aktiv", true);
    }

    const result = await query.order("reihenfolge");

    return handle(result, "Fehler in getWildklassen") || [];
  }

  /* =======================================================
       ABSCHUSSPLÄNE
    ======================================================= */

  async function getAbschussplaene(planperiodeId) {
    const result = await db
      .from(TABLE.PLAENE)
      .select("*")
      .eq("planperiode_id", planperiodeId)
      .order("plan_typ")
      .order("jahr");

    return handle(result, "Fehler in getAbschussplaene") || [];
  }

  async function getAbschussplaeneNachTyp(
    planperiodeId,
    wildgruppeId,
    planTyp,
  ) {
    const plaene = await getAbschussplaene(planperiodeId);

    return plaene.filter(
      (plan) =>
        String(plan.wildgruppe_id) === String(wildgruppeId) &&
        plan.plan_typ === planTyp,
    );
  }

  async function getAbschussplan(id) {
    const result = await db
      .from(TABLE.PLAENE)
      .select("*")
      .eq("id", id)
      .single();

    return handle(result, "Fehler in getAbschussplan");
  }

  async function createAbschussplan(data) {
    const result = await db.from(TABLE.PLAENE).insert(data).select().single();
    return handle(result, "Fehler in createAbschussplan");
  }

  async function updateAbschussplan(id, data) {
    const result = await db
      .from(TABLE.PLAENE)
      .update(data)
      .eq("id", id)
      .select()
      .single();

    return handle(result, "Fehler in updateAbschussplan");
  }

  async function deleteAbschussplan(id) {
    const result = await db.from(TABLE.PLAENE).delete().eq("id", id);

    if (result.error) {
      console.error(result.error);
      return false;
    }

    return true;
  }

  /* =======================================================
       POSITIONEN
    ======================================================= */

  function sortPositionenByWildklasse(positionen) {
    return [...positionen].sort((a, b) => {
      const reihenfolgeA = a.wildklassen?.reihenfolge;
      const reihenfolgeB = b.wildklassen?.reihenfolge;
      const sortierwertA =
        reihenfolgeA !== null &&
        reihenfolgeA !== undefined &&
        Number.isFinite(Number(reihenfolgeA))
          ? Number(reihenfolgeA)
        : Number.MAX_SAFE_INTEGER;
      const sortierwertB =
        reihenfolgeB !== null &&
        reihenfolgeB !== undefined &&
        Number.isFinite(Number(reihenfolgeB))
          ? Number(reihenfolgeB)
        : Number.MAX_SAFE_INTEGER;

      return sortierwertA - sortierwertB;
    });
  }

  async function getPositionen(planId) {
    const result = await db
      .from(TABLE.POSITIONEN)
      .select(
        `
            *,
            wildklassen (
                id,
                bezeichnung,
                reihenfolge
            )
        `,
      )
      .eq("plan_id", planId);

    const positionen = handle(result, "Fehler in getPositionen") || [];

    return sortPositionenByWildklasse(positionen);
  }

  async function createPosition(data) {
    const result = await db
      .from(TABLE.POSITIONEN)
      .insert(data)
      .select()
      .single();

    return handle(result, "Fehler in createPosition");
  }

  async function updatePosition(id, data) {
    //console.log("SERVICE updatePosition", data);

    const result = await db
      .from(TABLE.POSITIONEN)
      .update(data)
      .eq("id", id)
      .select()
      .single();

    //console.log(result);

    return handle(result, "Fehler in updatePosition");
  }

  async function deletePosition(id) {
    const result = await db.from(TABLE.POSITIONEN).delete().eq("id", id);

    if (result.error) {
      console.error(result.error);
      return false;
    }

    return true;
  }

  return {
    /* Planperioden */

    getAktivePlanperiode,
    getPlanperioden,
    createPlanperiode,
    updatePlanperiode,
    deletePlanperiode,
    setPlanperiodeStatus,

    /* Wild */

    getWildgruppen,
    getWildklassen,

    /* Abschusspläne */

    getAbschussplaene,
    getAbschussplaeneNachTyp,
    getAbschussplan,
    createAbschussplan,
    updateAbschussplan,
    deleteAbschussplan,

    /* Positionen */

    getPositionen,
    createPosition,
    updatePosition,
    deletePosition,
  };
})();
