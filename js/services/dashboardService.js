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

    const rows = handle(result, "Fehler in Dashboard.getJaeger") || [];
    const jaegerIds = [...new Set(rows.map((row) => row.jaeger_id).filter(Boolean))];
    if (!jaegerIds.length) return rows;

    const personenResult = await db
      .from("personen")
      .select("id, personen_nr")
      .in("id", jaegerIds);
    const personen = handle(
      personenResult,
      "Fehler in Dashboard.getJaegerNummern",
    ) || [];
    const nummern = new Map(
      personen.map((person) => [String(person.id), person.personen_nr]),
    );

    return rows.map((row) => ({
      ...row,
      jaeger_nr: nummern.get(String(row.jaeger_id)) ?? null,
    }));
  }

  function relationValue(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function aggregateWildhaendler(rows, allowedGroups) {
    const grouped = new Map();
    rows.forEach((row) => {
      const wildgruppe = relationValue(row.wildgruppen);
      const wildhaendler = relationValue(row.wildhaendler);
      const groupName = String(wildgruppe?.bezeichnung || "").toLocaleLowerCase("de");
      if (!wildhaendler || !allowedGroups.has(groupName)) return;

      const id = String(wildhaendler.id);
      const current = grouped.get(id) || {
        wildhaendler_id: wildhaendler.id,
        wildhaendler: wildhaendler.bezeichnung,
        anzahl: 0,
        gesamtpreis: 0,
        gewicht: 0,
      };
      current.anzahl += 1;
      current.gesamtpreis += Number(row.gesamtpreis) || 0;
      current.gewicht += Number(row.gewicht) || 0;
      grouped.set(id, current);
    });

    return [...grouped.values()].sort(
      (left, right) =>
        right.anzahl - left.anzahl ||
        left.wildhaendler.localeCompare(right.wildhaendler, "de", {
          sensitivity: "base",
        }),
    );
  }

  async function getWildhaendler(planperiode) {
    const pageSize = 1000;
    const rows = [];
    let offset = 0;
    let page = [];
    do {
      const result = await db
        .from("abschuesse")
        .select(`
          wildhaendler_id,
          gewicht,
          gesamtpreis,
          wildhaendler:wildhaendler (id, bezeichnung),
          wildgruppen (id, bezeichnung)
        `)
        .eq("fallwild", false)
        .not("wildhaendler_id", "is", null)
        .gte("datum", `${planperiode.startjahr}-01-01`)
        .lt("datum", `${Number(planperiode.endjahr) + 1}-01-01`)
        .range(offset, offset + pageSize - 1);
      page = handle(result, "Fehler in Dashboard.getWildhaendler") || [];
      rows.push(...page);
      offset += pageSize;
    } while (page.length === pageSize);

    return {
      gesamt: aggregateWildhaendler(
        rows,
        new Set(["rotwild", "rehwild", "gamswild"]),
      ),
      rotwild: aggregateWildhaendler(rows, new Set(["rotwild"])),
      rehwild: aggregateWildhaendler(rows, new Set(["rehwild"])),
    };
  }

  async function loadDashboard() {
    const planperiode = await getAktivePlanperiode();
    if (!planperiode) {
      return {
        planperiode: null,
        planpositionen: [],
        jaeger: [],
        wildhaendler: { gesamt: [], rotwild: [], rehwild: [] },
      };
    }

    const [planpositionen, jaeger, wildhaendler] = await Promise.all([
      getPlanpositionen(planperiode.id),
      getJaeger(planperiode.id),
      getWildhaendler(planperiode),
    ]);
    return { planperiode, planpositionen, jaeger, wildhaendler };
  }

  return {
    loadDashboard,
    getAktivePlanperiode,
    getPlanpositionen,
    getJaeger,
    getWildhaendler,
  };
})();

window.DashboardService = DashboardService;
