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
        POSITIONEN: "abschussplan_positionen"
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

        const result = await db
            .from(TABLE.PLANPERIODEN)
            .delete()
            .eq("id", id);

        if (result.error) {
            console.error(result.error);
            return false;
        }

        return true;

    }

    async function setPlanperiodeStatus(id, status) {

    try {

        if (status === "AKTIV") {

            const archiveResult = await db
                .from(TABLE.PLANPERIODEN)
                .update({
                    status: "ARCHIV"
                })
                .eq("status", "AKTIV");

            if (archiveResult.error) {
                throw archiveResult.error;
            }

        }

        const result = await db
            .from(TABLE.PLANPERIODEN)
            .update({
                status: status
            })
            .eq("id", id)
            .select()
            .single();

        return handle(result, "Fehler in setPlanperiodeStatus");

    } catch (error) {

        console.error("Fehler in setPlanperiodeStatus", error);

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

    async function getWildklassen(wildgruppeId) {

        const result = await db
            .from(TABLE.WILDKLASSEN)
            .select("*")
            .eq("wildgruppe_id", wildgruppeId)
            .eq("aktiv", true)
            .order("reihenfolge");

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

    async function getAbschussplan(id) {

        const result = await db
            .from(TABLE.PLAENE)
            .select("*")
            .eq("id", id)
            .single();

        return handle(result, "Fehler in getAbschussplan");

    }

    async function createAbschussplan(data) {

        const result = await db
            .from(TABLE.PLAENE)
            .insert(data)
            .select()
            .single();

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

        const result = await db
            .from(TABLE.PLAENE)
            .delete()
            .eq("id", id);

        if (result.error) {
            console.error(result.error);
            return false;
        }

        return true;

    }

    /* =======================================================
       POSITIONEN
    ======================================================= */

    async function getPositionen(planId) {

        const result = await db
            .from(TABLE.POSITIONEN)
            .select("*")
            .eq("plan_id", planId)
            .order("klasse_id");

        return handle(result, "Fehler in getPositionen") || [];

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

        const result = await db
            .from(TABLE.POSITIONEN)
            .update(data)
            .eq("id", id)
            .select()
            .single();

        return handle(result, "Fehler in updatePosition");

    }

    async function deletePosition(id) {

        const result = await db
            .from(TABLE.POSITIONEN)
            .delete()
            .eq("id", id);

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
        getAbschussplan,
        createAbschussplan,
        updateAbschussplan,
        deleteAbschussplan,

        /* Positionen */

        getPositionen,
        createPosition,
        updatePosition,
        deletePosition

    };

})();