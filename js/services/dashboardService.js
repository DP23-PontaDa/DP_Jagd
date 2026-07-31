const DashboardService = (() => {
  const db = window.db || window.supabase;

  function handle(result, context) {
    if (result.error) {
      console.error(context, result.error);
      throw new Error("Die Dashboard-Daten konnten nicht geladen werden.");
    }
    return result.data;
  }

  async function getAktivePlanperiode() {
    const result = await db
      .from("planperioden")
      .select("id, bezeichnung, startjahr, endjahr")
      .eq("status", "AKTIV")
      .maybeSingle();

    return handle(result, "Fehler in Dashboard.getAktivePlanperiode");
  }

  async function getPlanpositionen(planperiodeId) {
    const result = await db
      .from("vw_dashboard_planpositionen")
      .select(`
        planperiode_id,
        startjahr,
        endjahr,
        wildgruppe_id,
        wildgruppe,
        wildgruppe_reihenfolge,
        planperiode_planposition_id,
        code,
        planposition,
        reihenfolge,
        soll_kj,
        soll_startjahr,
        soll_endjahr,
        ist_kj,
        ist_startjahr,
        ist_endjahr,
        rest,
        erfuellung_prozent,
        fallwild,
        aktuelles_jahr,
        soll_aktuelles_jahr
      `)
      .eq("planperiode_id", planperiodeId)
      .order("wildgruppe_reihenfolge", { ascending: true })
      .order("reihenfolge", { ascending: true });

    return handle(result, "Fehler in Dashboard.getPlanpositionen") || [];
  }

  async function getJaeger(planperiodeId) {
    const result = await db
      .from("vw_dashboard_jaeger")
      .select(`
        planperiode_id,
        jaeger_id,
        jaeger,
        wildgruppe_id,
        wildgruppe,
        wildgruppe_reihenfolge,
        wildklasse_id,
        wildklasse_code,
        wildklasse,
        wildklasse_reihenfolge,
        anzahl
      `)
      .eq("planperiode_id", planperiodeId)
      .order("jaeger", { ascending: true })
      .order("wildgruppe_reihenfolge", { ascending: true })
      .order("wildklasse_reihenfolge", { ascending: true });

    return handle(result, "Fehler in Dashboard.getJaeger") || [];
  }

  async function loadDashboard() {
    const planperiode = await getAktivePlanperiode();
    if (!planperiode) {
      return { planperiode: null, planpositionen: [], jaeger: [] };
    }

    const [planpositionen, jaeger] = await Promise.all([
      getPlanpositionen(planperiode.id),
      getJaeger(planperiode.id),
    ]);
    return { planperiode, planpositionen, jaeger };
  }

  return {
    loadDashboard,
    getAktivePlanperiode,
    getPlanpositionen,
    getJaeger,
  };
})();

window.DashboardService = DashboardService;
