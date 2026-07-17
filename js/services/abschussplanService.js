/* Abschussplan Service
   Kapselt alle Supabase-Zugriffe für das Abschussplan-Modul.
   UI darf nicht direkt auf Supabase zugreifen.
*/

const AbschussplanService = (function () {
    const TABLES = {
        planperiode: 'planperiode',
        wildgruppe: 'wildgruppe',
        wildklasse: 'wildklasse',
        abschussplan: 'abschussplaene',
        abschussplan_positionen: 'abschussplan_positionen'
    };

    function normalizeResult(result) {
        if (!result) return null;
        return result.data || null;
    }

    async function getAktivePlanperiode() {
        try {
            const response = await db.from(TABLES.planperiode).select('*').eq('active', true).single();
            if (response.error) throw response.error;
            return normalizeResult(response);
        } catch (error) {
            console.error('Fehler in getAktivePlanperiode:', error);
            return null;
        }
    }

    async function getPlanperioden() {
        try {
            const response = await db.from(TABLES.planperiode)
                .select('*')
                .order('active', { ascending: false })
                .order('startjahr', { ascending: false });
            if (response.error) throw response.error;
            return normalizeResult(response) || [];
        } catch (error) {
            console.error('Fehler in getPlanperioden:', error);
            return [];
        }
    }

    async function createPlanperiode(payload) {
        try {
            const response = await db.from(TABLES.planperiode).insert(payload).select('*').single();
            if (response.error) throw response.error;
            return normalizeResult(response);
        } catch (error) {
            console.error('Fehler in createPlanperiode:', error);
            return null;
        }
    }

    async function updatePlanperiode(planperiodeId, payload) {
        try {
            const response = await db.from(TABLES.planperiode).update(payload).eq('id', planperiodeId).select('*').single();
            if (response.error) throw response.error;
            return normalizeResult(response);
        } catch (error) {
            console.error('Fehler in updatePlanperiode:', error);
            return null;
        }
    }

    async function hasAbschussplaene(planperiodeId) {
        try {
            const response = await db.from(TABLES.abschussplan).select('id').eq('planperiode_id', planperiodeId).limit(1);
            if (response.error) throw response.error;
            const data = normalizeResult(response) || [];
            return data.length > 0;
        } catch (error) {
            console.error('Fehler in hasAbschussplaene:', error);
            return false;
        }
    }

    async function deletePlanperiode(planperiodeId) {
        try {
            if (await hasAbschussplaene(planperiodeId)) {
                return false;
            }
            const response = await db.from(TABLES.planperiode).delete().eq('id', planperiodeId).select('*');
            if (response.error) throw response.error;
            return true;
        } catch (error) {
            console.error('Fehler in deletePlanperiode:', error);
            return false;
        }
    }

    async function setPlanperiodeStatus(planperiodeId, status) {
        try {
            if (status === 'Aktiv') {
                const archiveResponse = await db.from(TABLES.planperiode).update({ status: 'Archiv', active: false }).neq('id', planperiodeId).eq('status', 'Aktiv');
                if (archiveResponse.error) throw archiveResponse.error;
                const response = await db.from(TABLES.planperiode).update({ status, active: true }).eq('id', planperiodeId).select('*').single();
                if (response.error) throw response.error;
                return normalizeResult(response);
            }
            const response = await db.from(TABLES.planperiode).update({ status, active: status === 'Aktiv' }).eq('id', planperiodeId).select('*').single();
            if (response.error) throw response.error;
            return normalizeResult(response);
        } catch (error) {
            console.error('Fehler in setPlanperiodeStatus:', error);
            return null;
        }
    }

    async function getWildgruppen() {
        try {
            const response = await db.from(TABLES.wildgruppe).select('*').order('name', { ascending: true });
            if (response.error) throw response.error;
            return normalizeResult(response) || [];
        } catch (error) {
            console.error('Fehler in getWildgruppen:', error);
            return [];
        }
    }

    async function getWildklassen(wildgruppeId) {
        try {
            const response = await db.from(TABLES.wildklasse).select('*').eq('wildgruppe_id', wildgruppeId).order('name', { ascending: true });
            if (response.error) throw response.error;
            return normalizeResult(response) || [];
        } catch (error) {
            console.error('Fehler in getWildklassen:', error);
            return [];
        }
    }

    async function getAbschussplaene(planperiodeId) {
        try {
            const response = await db.from(TABLES.abschussplan).select('*').eq('planperiode_id', planperiodeId).order('created_at', { ascending: false });
            if (response.error) throw response.error;
            return normalizeResult(response) || [];
        } catch (error) {
            console.error('Fehler in getAbschussplaene:', error);
            return [];
        }
    }

    async function getAbschussplan(planId) {
        try {
            const response = await db.from(TABLES.abschussplan).select('*').eq('id', planId).single();
            if (response.error) throw response.error;
            return normalizeResult(response);
        } catch (error) {
            console.error('Fehler in getAbschussplan:', error);
            return null;
        }
    }

    async function getPositionen(planId) {
        try {
            const response = await db.from(TABLES.abschussplan_positionen).select('*').eq('abschussplan_id', planId).order('wildklasse_id', { ascending: true });
            if (response.error) throw response.error;
            return normalizeResult(response) || [];
        } catch (error) {
            console.error('Fehler in getPositionen:', error);
            return [];
        }
    }

    async function createAbschussplan(payload) {
        try {
            const response = await db.from(TABLES.abschussplan).insert(payload).select('*').single();
            if (response.error) throw response.error;
            return normalizeResult(response);
        } catch (error) {
            console.error('Fehler in createAbschussplan:', error);
            return null;
        }
    }

    async function updateAbschussplan(planId, payload) {
        try {
            const response = await db.from(TABLES.abschussplan).update(payload).eq('id', planId).select('*').single();
            if (response.error) throw response.error;
            return normalizeResult(response);
        } catch (error) {
            console.error('Fehler in updateAbschussplan:', error);
            return null;
        }
    }

    async function deleteAbschussplan(planId) {
        try {
            const response = await db.from(TABLES.abschussplan).delete().eq('id', planId).select('*');
            if (response.error) throw response.error;
            return normalizeResult(response) || [];
        } catch (error) {
            console.error('Fehler in deleteAbschussplan:', error);
            return [];
        }
    }

    async function createPosition(payload) {
        try {
            const response = await db.from(TABLES.abschussplan_positionen).insert(payload).select('*').single();
            if (response.error) throw response.error;
            return normalizeResult(response);
        } catch (error) {
            console.error('Fehler in createPosition:', error);
            return null;
        }
    }

    async function updatePosition(positionId, payload) {
        try {
            const response = await db.from(TABLES.abschussplan_positionen).update(payload).eq('id', positionId).select('*').single();
            if (response.error) throw response.error;
            return normalizeResult(response);
        } catch (error) {
            console.error('Fehler in updatePosition:', error);
            return null;
        }
    }

    async function deletePosition(positionId) {
        try {
            const response = await db.from(TABLES.abschussplan_positionen).delete().eq('id', positionId).select('*');
            if (response.error) throw response.error;
            return normalizeResult(response) || [];
        } catch (error) {
            console.error('Fehler in deletePosition:', error);
            return [];
        }
    }

    return {
        getAktivePlanperiode,
        getPlanperioden,
        createPlanperiode,
        updatePlanperiode,
        deletePlanperiode,
        setPlanperiodeStatus,
        getWildgruppen,
        getWildklassen,
        getAbschussplaene,
        getAbschussplan,
        getPositionen,
        createAbschussplan,
        updateAbschussplan,
        deleteAbschussplan,
        createPosition,
        updatePosition,
        deletePosition
    };
})();
