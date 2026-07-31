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
    PLANPOSITIONEN: "planpositionen",
    PLANPOSITION_MAPPING: "planposition_wildklasse",
    PLANPERIODE_PLANPOSITIONEN: "planperiode_planpositionen",
    PLANPERIODE_MAPPING: "planperiode_planposition_wildklasse",
    PLAENE: "abschussplaene",
    POSITIONEN: "abschussplan_positionen",
    POSITIONEN_IST: "vw_abschussplan_ist",
    JAHRESUEBERSICHT: "vw_abschussplan_jahresuebersicht",
  };

  function handle(result, text) {
    if (result.error) {
      console.error(text, result.error);
      return null;
    }

    return result.data;
  }

  // Gemeinsamer Schreibpunkt für fachliche Änderungen am Planmodell.
  // Hier kann später ein Änderungsprotokoll ergänzt werden, ohne die
  // einzelnen Servicefunktionen oder die UI erneut umzubauen.
  async function executePlanMutation(bereich, aktion, operation) {
    const result = await operation();
    if (result.error) {
      console.error(`${bereich}: ${aktion} fehlgeschlagen`, result.error);
    }
    return result;
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
          const result = await executePlanMutation(
            "abschussplan_positionen",
            "löschen",
            () => db.from(TABLE.POSITIONEN).delete().eq("id", position.id),
          );

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
        const einrichtung = await isPlanperiodeComplete(id);
        if (!einrichtung.complete) {
          alert("Die Planperiode ist noch nicht vollständig eingerichtet.");
          return null;
        }

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
      .eq("aktiv", true)
      .order("reihenfolge", { ascending: true });

    return handle(result, "Fehler in getWildgruppen") || [];
  }

  async function getAktivePlanpositionsVorlagen(wildgruppeId) {
    const result = await db
      .from(TABLE.PLANPOSITIONEN)
      .select(`
        id,
        wildgruppe_id,
        code,
        bezeichnung,
        reihenfolge,
        aktiv
      `)
      .eq("wildgruppe_id", wildgruppeId)
      .eq("aktiv", true)
      .order("reihenfolge");

    return handle(result, "Fehler in getAktivePlanpositionsVorlagen") || [];
  }

  async function getPlanperiodePlanpositionen(planperiodeId) {
    const result = await db
      .from(TABLE.PLANPERIODE_PLANPOSITIONEN)
      .select(`
        id,
        planperiode_id,
        planposition_id,
        wildgruppe_id,
        code,
        bezeichnung,
        reihenfolge,
        aktiv,
        created_at,
        updated_at,
        wildgruppen (id, bezeichnung)
      `)
      .eq("planperiode_id", planperiodeId)
      .order("reihenfolge");

    if (result.error) throw result.error;
    return result.data || [];
  }

  async function syncPlanperiodePlanpositionen(planperiodeId) {
    const vorhanden = await getPlanperiodePlanpositionen(planperiodeId);
    const vorhandeneIds = new Set(
      vorhanden.map((eintrag) => String(eintrag.planposition_id)),
    );
    const wildgruppen = await getWildgruppen();
    let ergaenzt = 0;

    for (const wildgruppe of wildgruppen) {
      const vorlagen =
        await getAktivePlanpositionsVorlagen(wildgruppe.id);
      for (const planposition of vorlagen) {
        if (vorhandeneIds.has(String(planposition.id))) continue;
        const snapshotResult = await executePlanMutation(
          "planperiode_planpositionen",
          "anlegen",
          () => db
            .from(TABLE.PLANPERIODE_PLANPOSITIONEN)
            .insert({
              planperiode_id: planperiodeId,
              planposition_id: planposition.id,
              wildgruppe_id: planposition.wildgruppe_id,
              code: planposition.code,
              bezeichnung: planposition.bezeichnung,
              aktiv: true,
              reihenfolge: planposition.reihenfolge,
            })
            .select()
            .single(),
        );
        if (snapshotResult.error) throw snapshotResult.error;

        const mappingResult = await db
          .from(TABLE.PLANPOSITION_MAPPING)
          .select(`
            wildklasse_id,
            wildklassen (code, bezeichnung)
          `)
          .eq("planposition_id", planposition.id);
        if (mappingResult.error) throw mappingResult.error;

        const mappings = (mappingResult.data || []).map((mapping) => ({
          planperiode_id: planperiodeId,
          planperiode_planposition_id: snapshotResult.data.id,
          wildklasse_id: mapping.wildklasse_id,
          wildklasse_code: mapping.wildklassen?.code || "",
          wildklasse_bezeichnung: mapping.wildklassen?.bezeichnung || "",
        }));
        if (mappings.length) {
          const insertMapping = await executePlanMutation(
            "planperiode_planposition_wildklasse",
            "anlegen",
            () => db.from(TABLE.PLANPERIODE_MAPPING).insert(mappings),
          );
          if (insertMapping.error) throw insertMapping.error;
        }
        vorhandeneIds.add(String(planposition.id));
        ergaenzt += 1;
      }
    }

    return ergaenzt;
  }

  async function createPlanperiodePlanpositionen(planperiodeId) {
    await syncPlanperiodePlanpositionen(planperiodeId);
    return getPlanperiodePlanpositionen(planperiodeId);
  }

  async function savePlanperiodePlanpositionen(planperiodeId, positionen) {
    const vorhandene = await getPlanperiodePlanpositionen(planperiodeId);
    const vorhandenById = new Map(
      vorhandene.map((position) => [String(position.id), position]),
    );

    for (const position of positionen) {
      const bisher = vorhandenById.get(String(position.id));
      if (!bisher) continue;

      const result = await executePlanMutation(
        "planperiode_planpositionen",
        "aktualisieren",
        () => db
          .from(TABLE.PLANPERIODE_PLANPOSITIONEN)
          .update({
            aktiv: position.aktiv === true,
          })
          .eq("id", position.id)
          .eq("planperiode_id", planperiodeId),
      );
      if (result.error) throw result.error;

      if (bisher.aktiv !== true && position.aktiv === true) {
        await copyPlanpositionMappingToSnapshot(planperiodeId, bisher);
      }
    }

    // Bereits vorhandene Abschusspläne erhalten neu aktivierte
    // Planpositionen über denselben zentralen Service-Schreibpfad.
    await updateAbschussplanPositionen(planperiodeId);
    return getPlanperiodePlanpositionen(planperiodeId);
  }

  async function copyPlanpositionMappingToSnapshot(planperiodeId, snapshot) {
    const stammdatenResult = await db
      .from(TABLE.PLANPOSITION_MAPPING)
      .select(`
        wildklasse_id,
        wildklassen (code, bezeichnung)
      `)
      .eq("planposition_id", snapshot.planposition_id);
    if (stammdatenResult.error) throw stammdatenResult.error;

    const deleteSnapshotResult = await executePlanMutation(
      "planperiode_planposition_wildklasse",
      "ersetzen",
      () => db
        .from(TABLE.PLANPERIODE_MAPPING)
        .delete()
        .eq("planperiode_id", planperiodeId)
        .eq("planperiode_planposition_id", snapshot.id),
    );
    if (deleteSnapshotResult.error) throw deleteSnapshotResult.error;

    const stammdatenMappings = stammdatenResult.data || [];
    if (!stammdatenMappings.length) return;

    const wildklasseIds = stammdatenMappings.map(
      (mapping) => mapping.wildklasse_id,
    );
    const deleteKonflikteResult = await executePlanMutation(
      "planperiode_planposition_wildklasse",
      "Konflikte bereinigen",
      () => db
        .from(TABLE.PLANPERIODE_MAPPING)
        .delete()
        .eq("planperiode_id", planperiodeId)
        .in("wildklasse_id", wildklasseIds),
    );
    if (deleteKonflikteResult.error) throw deleteKonflikteResult.error;

    const insertResult = await executePlanMutation(
      "planperiode_planposition_wildklasse",
      "anlegen",
      () => db
        .from(TABLE.PLANPERIODE_MAPPING)
        .insert(
          stammdatenMappings.map((mapping) => ({
            planperiode_id: planperiodeId,
            planperiode_planposition_id: snapshot.id,
            wildklasse_id: mapping.wildklasse_id,
            wildklasse_code: mapping.wildklassen?.code || "",
            wildklasse_bezeichnung:
              mapping.wildklassen?.bezeichnung || "",
          })),
        ),
    );
    if (insertResult.error) throw insertResult.error;
  }

  async function createAbschussplaene(planperiodeId, auswahl = "ALLE") {
    const planperioden = await getPlanperioden();
    const planperiode = planperioden.find(
      (eintrag) => String(eintrag.id) === String(planperiodeId),
    );
    if (!planperiode) throw new Error("Planperiode nicht gefunden.");

    const periodPositionen =
      await getPlanperiodePlanpositionen(planperiodeId);
    const aktivePositionen = periodPositionen.filter(
      (eintrag) => eintrag.aktiv === true,
    );
    if (!aktivePositionen.length) {
      throw new Error("Für diese Planperiode sind keine aktiven Planpositionen vorhanden.");
    }

    const vorhandenePlaene = await getAbschussplaene(planperiodeId);
    const gruppen = new Map();
    periodPositionen.forEach((eintrag) => {
      const gruppeId = eintrag.wildgruppe_id;
      if (!gruppeId) return;
      const key = String(gruppeId);
      if (!gruppen.has(key)) gruppen.set(key, []);
      if (eintrag.aktiv === true) gruppen.get(key).push(eintrag);
    });

    const typen = auswahl === "ALLE" ? ["KJ", "INTERN"] : [auswahl];
    let erstellt = 0;
    for (const [wildgruppeId, planpositionen] of gruppen) {
      for (const typ of typen) {
        const jahre = typ === "KJ"
          ? [null]
          : [planperiode.startjahr, planperiode.endjahr];
        for (const jahr of jahre) {
          const vorhanden = vorhandenePlaene.some((plan) =>
            String(plan.wildgruppe_id) === wildgruppeId &&
            plan.plan_typ === typ &&
            String(plan.jahr ?? "") === String(jahr ?? ""),
          );
          if (vorhanden) continue;

          const plan = await createAbschussplan({
            planperiode_id: planperiodeId,
            wildgruppe_id: wildgruppeId,
            plan_typ: typ,
            jahr,
          });
          if (!plan) throw new Error("Ein Abschussplan konnte nicht erstellt werden.");

          for (const planposition of planpositionen) {
            const position = await createPosition({
              plan_id: plan.id,
              planperiode_planposition_id: planposition.id,
              soll: 0,
            });
            if (!position) {
              throw new Error("Eine Abschussplanposition konnte nicht erstellt werden.");
            }
          }
          erstellt += 1;
        }
      }
    }
    return erstellt;
  }

  async function updateAbschussplanPositionen(planperiodeId) {
    const [periodPositionen, plaene] = await Promise.all([
      getPlanperiodePlanpositionen(planperiodeId),
      getAbschussplaene(planperiodeId),
    ]);
    const aktivePlanpositionen = periodPositionen.filter(
      (eintrag) => eintrag.aktiv === true,
    );
    let ergaenzt = 0;

    for (const plan of plaene) {
      const positionen = await getPositionen(plan.id);
      const vorhandenePlanpositionen = new Set(
        positionen.map((position) =>
          String(position.planperiode_planposition_id),
        ),
      );
      const fehlendePlanpositionen = aktivePlanpositionen.filter(
        (eintrag) =>
          String(eintrag.wildgruppe_id) ===
            String(plan.wildgruppe_id) &&
          !vorhandenePlanpositionen.has(String(eintrag.id)),
      );

      for (const planposition of fehlendePlanpositionen) {
        const position = await createPosition({
          plan_id: plan.id,
          planperiode_planposition_id: planposition.id,
          soll: 0,
        });
        if (!position) {
          throw new Error("Eine Abschussplanposition konnte nicht ergänzt werden.");
        }
        ergaenzt += 1;
      }
    }

    return ergaenzt;
  }

  async function isPlanperiodeComplete(planperiodeId) {
    const [planpositionen, plaene] = await Promise.all([
      getPlanperiodePlanpositionen(planperiodeId),
      getAbschussplaene(planperiodeId),
    ]);
    let hatPlanpositionen = planpositionen.length > 0;
    if (!hatPlanpositionen && plaene.length) {
      for (const plan of plaene) {
        const positionen = await getPositionen(plan.id);
        if (positionen.length) {
          hatPlanpositionen = true;
          break;
        }
      }
    }
    const hatAbschussplaene = plaene.length > 0;
    return {
      planpositionen: hatPlanpositionen,
      abschussplaene: hatAbschussplaene,
      complete: hatPlanpositionen && hatAbschussplaene,
    };
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

  function sortPositionenByPlanposition(positionen) {
    return [...positionen].sort((a, b) => {
      const reihenfolgeA = a.planperiode_planpositionen?.reihenfolge;
      const reihenfolgeB = b.planperiode_planpositionen?.reihenfolge;
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
      .from(TABLE.POSITIONEN_IST)
      .select(
        `
            id,
            plan_id,
            planperiode_planposition_id,
            soll,
            ist,
            rest,
            erfuellung_prozent,
            fallwild,
            code,
            bezeichnung,
            reihenfolge,
            wildgruppe_id
        `,
      )
      .eq("plan_id", planId);

    const positionen = (
      handle(result, "Fehler in getPositionen") || []
    ).map((position) => ({
      ...position,
      planperiode_planpositionen: {
        id: position.planperiode_planposition_id,
        code: position.code,
        bezeichnung: position.bezeichnung,
        reihenfolge: position.reihenfolge,
        wildgruppe_id: position.wildgruppe_id,
      },
    }));

    return sortPositionenByPlanposition(positionen);
  }

  async function getPlanperiodeJahresuebersicht(planperiodeId) {
    const result = await db
      .from(TABLE.JAHRESUEBERSICHT)
      .select(`
        planperiode_id,
        wildgruppe_id,
        wildgruppe,
        reihenfolge,
        soll_kj,
        ist_kj
      `)
      .eq("planperiode_id", planperiodeId)
      .order("reihenfolge", { ascending: true });

    return handle(
      result,
      "Fehler in getPlanperiodeJahresuebersicht",
    ) || [];
  }

  async function createPosition(data) {
    const result = await executePlanMutation(
      "abschussplan_positionen",
      "anlegen",
      () => db
        .from(TABLE.POSITIONEN)
        .insert(data)
        .select()
        .single(),
    );

    return handle(result, "Fehler in createPosition");
  }

  async function updatePosition(id, data) {
    //console.log("SERVICE updatePosition", data);

    const result = await executePlanMutation(
      "abschussplan_positionen",
      "aktualisieren",
      () => db
        .from(TABLE.POSITIONEN)
        .update(data)
        .eq("id", id)
        .select()
        .single(),
    );

    //console.log(result);

    return handle(result, "Fehler in updatePosition");
  }

  async function deletePosition(id) {
    const result = await executePlanMutation(
      "abschussplan_positionen",
      "löschen",
      () => db.from(TABLE.POSITIONEN).delete().eq("id", id),
    );

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
    createPlanperiodePlanpositionen,
    getPlanperiodePlanpositionen,
    savePlanperiodePlanpositionen,
    syncPlanperiodePlanpositionen,
    createAbschussplaene,
    updateAbschussplanPositionen,
    isPlanperiodeComplete,

    /* Abschusspläne */

    getAbschussplaene,
    getAbschussplaeneNachTyp,
    getAbschussplan,
    createAbschussplan,
    updateAbschussplan,
    deleteAbschussplan,

    /* Positionen */

    getPositionen,
    getPlanperiodeJahresuebersicht,
    createPosition,
    updatePosition,
    deletePosition,
  };
})();
