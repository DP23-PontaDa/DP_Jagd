/* ==========================================
   DP_Jagd V2
   wildklassenService.js
========================================== */

const WildklassenService = (() => {
  const db = window.db || window.supabase;

  const nummer = (wert) => {
    const zahl = Number(wert);
    return Number.isFinite(zahl) ? zahl : Number.MAX_SAFE_INTEGER;
  };

  function vergleicheNachWildgruppeUndWildklasse(a, b) {
    return nummer(a?.wildgruppe_reihenfolge ?? a?.wildgruppe?.reihenfolge) -
      nummer(b?.wildgruppe_reihenfolge ?? b?.wildgruppe?.reihenfolge) ||
      nummer(a?.wildklasse_reihenfolge ?? a?.reihenfolge) -
      nummer(b?.wildklasse_reihenfolge ?? b?.reihenfolge) ||
      String(a?.bezeichnung || "").localeCompare(String(b?.bezeichnung || ""), "de");
  }

  function sortiereNachWildgruppeUndWildklasse(wildklassen) {
    return [...(wildklassen || [])].sort(vergleicheNachWildgruppeUndWildklasse);
  }

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
      .select("id, wildgruppe_id, reihenfolge, wildgruppen(bezeichnung,reihenfolge)")
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
        wildklassen!inner (aktiv, reihenfolge, stehzeit_jahre, stehzeit_nicht_passend_jahre, kahlwildpflicht)
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
          wildgruppe_bezeichnung: position?.wildgruppen?.bezeichnung || "Ohne Wildgruppe",
          wildgruppe_reihenfolge: Number(position?.wildgruppen?.reihenfolge) || Number.MAX_SAFE_INTEGER,
          planposition_reihenfolge: Number(position?.reihenfolge) || 0,
          wildklasse_reihenfolge: Number(mapping.wildklassen?.reihenfolge) || 0,
          stehzeit_jahre: Number(mapping.wildklassen?.stehzeit_jahre) || 0,
          stehzeit_nicht_passend_jahre: Number(mapping.wildklassen?.stehzeit_nicht_passend_jahre) || 0,
          kahlwildpflicht: Number(mapping.wildklassen?.kahlwildpflicht) || 0,
        };
      })
      .sort(vergleicheNachWildgruppeUndWildklasse);
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
    vergleicheNachWildgruppeUndWildklasse,
    sortiereNachWildgruppeUndWildklasse,
    createWildklasse,
    updateWildklasse,
    deleteWildklasse
  };
})();
