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

  async function getAbschussplanWildgruppen() {
    const result = await db
      .from("wildgruppen")
      .select("id, code, bezeichnung, reihenfolge")
      .eq("aktiv", true)
      .eq("abschussplan", true)
      .order("reihenfolge", { ascending: true });

    return handle(result, "Fehler in Dashboard.getAbschussplanWildgruppen") || [];
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

  async function getJaeger(planperiode) {
    const result = await db
      .from("abschuesse")
      .select(`
        jaeger_id,
        datum,
        wildgruppe_id,
        wildklasse_id,
        jaeger:personen (id, personen_nr, vorname, nachname),
        wildgruppe:wildgruppen (id, bezeichnung, reihenfolge),
        wildklasse:wildklassen (id, code, bezeichnung, reihenfolge)
      `)
      .eq("fallwild", false)
      .gte("datum", `${planperiode.startjahr}-01-01`)
      .lt("datum", `${Number(planperiode.endjahr) + 1}-01-01`);

    const abschuesse = handle(result, "Fehler in Dashboard.getJaeger") || [];
    const gruppiert = new Map();
    abschuesse.forEach((abschuss) => {
      const person = relationValue(abschuss.jaeger) || {};
      const gruppe = relationValue(abschuss.wildgruppe) || {};
      const klasse = relationValue(abschuss.wildklasse) || {};
      const jahr = Number(String(abschuss.datum || "").slice(0, 4));
      const key = `${abschuss.jaeger_id}|${abschuss.wildgruppe_id}|${abschuss.wildklasse_id}|${jahr}`;
      const row = gruppiert.get(key) || {
        planperiode_id: planperiode.id,
        jaeger_id: abschuss.jaeger_id,
        jaeger: [person.vorname, person.nachname].filter(Boolean).join(" "),
        jaeger_nr: person.personen_nr ?? null,
        wildgruppe_id: abschuss.wildgruppe_id,
        wildgruppe: gruppe.bezeichnung,
        wildgruppe_reihenfolge: gruppe.reihenfolge,
        wildklasse_id: abschuss.wildklasse_id,
        wildklasse_code: klasse.code,
        wildklasse: klasse.bezeichnung,
        wildklasse_reihenfolge: klasse.reihenfolge,
        jahr,
        anzahl: 0,
      };
      row.anzahl += 1;
      gruppiert.set(key, row);
    });
    return [...gruppiert.values()];
  }

  async function getHirschB1Statistik(planperiode) {
    const klasseResult = await db.from("wildklassen")
      .select("id")
      .ilike("bezeichnung", "Hirsch B1")
      .limit(1)
      .maybeSingle();
    const klasse = handle(
      klasseResult,
      "Fehler in Dashboard.getHirschB1Statistik.Wildklasse",
    );
    if (!klasse) return null;

    const [abschussResult, freigabeResult] = await Promise.all([
      db.from("abschuesse")
        .select("datum,fallwild,interner_hirsch_b1")
        .eq("wildklasse_id", klasse.id)
        .gte("datum", `${planperiode.startjahr}-01-01`)
        .lt("datum", `${Number(planperiode.endjahr) + 1}-01-01`),
      db.from("planperiode_wildklasse_freigaben")
        .select("jahr,interne_freigabe")
        .eq("planperiode_id", planperiode.id)
        .eq("wildklasse_id", klasse.id),
    ]);
    const abschuesse = handle(
      abschussResult,
      "Fehler in Dashboard.getHirschB1Statistik.Abschuesse",
    ) || [];
    const freigaben = handle(
      freigabeResult,
      "Fehler in Dashboard.getHirschB1Statistik.Freigaben",
    ) || [];
    const statistik = {
      gesamt: 0, startjahr: 0, endjahr: 0, fallwild: 0,
      internGesamt: 0, internStartjahr: 0, internEndjahr: 0,
      internFallwild: 0, freigabeStartjahr: 0, freigabeEndjahr: 0,
    };
    freigaben.forEach((freigabe) => {
      if (Number(freigabe.jahr) === Number(planperiode.startjahr)) {
        statistik.freigabeStartjahr = Number(freigabe.interne_freigabe) || 0;
      }
      if (Number(freigabe.jahr) === Number(planperiode.endjahr)) {
        statistik.freigabeEndjahr = Number(freigabe.interne_freigabe) || 0;
      }
    });
    abschuesse.forEach((abschuss) => {
      const jahr = Number(String(abschuss.datum || "").slice(0, 4));
      const intern = abschuss.interner_hirsch_b1 === true;
      if (abschuss.fallwild === true) {
        statistik.fallwild += 1;
        if (intern) statistik.internFallwild += 1;
        return;
      }
      statistik.gesamt += 1;
      if (jahr === Number(planperiode.startjahr)) statistik.startjahr += 1;
      if (jahr === Number(planperiode.endjahr)) statistik.endjahr += 1;
      if (intern) {
        statistik.internGesamt += 1;
        if (jahr === Number(planperiode.startjahr)) statistik.internStartjahr += 1;
        if (jahr === Number(planperiode.endjahr)) statistik.internEndjahr += 1;
      }
    });
    return statistik;
  }

  function relationValue(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function aggregateWildhaendler(rows, allowedGroupIds) {
    const grouped = new Map();
    rows.forEach((row) => {
      const wildgruppe = relationValue(row.wildgruppen);
      const wildhaendler = relationValue(row.wildhaendler);
      if (!wildhaendler || !allowedGroupIds.has(String(wildgruppe?.id))) return;

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

  async function getWildhaendler(planperiode, wildgruppen) {
    const pageSize = 1000;
    const rows = [];
    let offset = 0;
    let page = [];
    do {
      const result = await db
        .from("abschuesse")
        .select(`
          wildhaendler_id,
          datum,
          gewicht,
          gesamtpreis,
          wildhaendler:wildhaendler (id, bezeichnung),
          wildgruppen (id, bezeichnung, abschussplan)
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

    const ids = new Set(wildgruppen.map((wildgruppe) => String(wildgruppe.id)));
    const idNachName = new Map(
      wildgruppen.map((wildgruppe) => [
        String(wildgruppe.bezeichnung || "").toLocaleLowerCase("de"),
        String(wildgruppe.id),
      ]),
    );
    function auswertung(gefilterteZeilen) {
      return {
        gesamt: aggregateWildhaendler(gefilterteZeilen, ids),
        rotwild: aggregateWildhaendler(gefilterteZeilen,
          new Set([idNachName.get("rotwild")].filter(Boolean))),
        rehwild: aggregateWildhaendler(gefilterteZeilen,
          new Set([idNachName.get("rehwild")].filter(Boolean))),
      };
    }
    return {
      beide: auswertung(rows),
      [planperiode.startjahr]: auswertung(rows.filter((row) =>
        Number(String(row.datum).slice(0, 4)) === Number(planperiode.startjahr))),
      [planperiode.endjahr]: auswertung(rows.filter((row) =>
        Number(String(row.datum).slice(0, 4)) === Number(planperiode.endjahr))),
    };
  }

  async function getAbschussHeatmapDaten({
    planperiode, jahr = "beide", wildgruppeIds = [], wildklasseId = null,
    inklusiveFallwild = false,
  }) {
    if (!planperiode) return { punkte: [], wildgruppen: [], wildklassen: [], ohneKoordinaten: 0 };
    const pageSize = 1000;
    const rows = [];
    let offset = 0;
    let page = [];
    do {
      let query = db.from("abschuesse").select(`
        id,datum,ort_id,wildgruppe_id,wildklasse_id,
        wildgruppe:wildgruppen(id,bezeichnung,reihenfolge),
        wildklasse:wildklassen(id,bezeichnung,reihenfolge,wildgruppe_id),
        erlegungsort:orte(id,name,art,reviereinrichtung,latitude,longitude)
      `);
      if (jahr === "beide") {
        query = query.gte("datum", `${planperiode.startjahr}-01-01`)
          .lt("datum", `${Number(planperiode.endjahr) + 1}-01-01`);
      } else {
        query = query.gte("datum", `${jahr}-01-01`)
          .lt("datum", `${Number(jahr) + 1}-01-01`);
      }
      if (!inklusiveFallwild) query = query.eq("fallwild", false);
      if (wildgruppeIds.length) query = query.in("wildgruppe_id", wildgruppeIds);
      if (wildklasseId) query = query.eq("wildklasse_id", wildklasseId);
      const result = await query.order("datum", { ascending: true })
        .order("id", { ascending: true }).range(offset, offset + pageSize - 1);
      page = handle(result, "Fehler in Dashboard.getAbschussHeatmapDaten") || [];
      rows.push(...page);
      offset += pageSize;
    } while (page.length === pageSize);

    const gruppen = new Map();
    const klassen = new Map();
    const orte = new Map();
    let ohneKoordinaten = 0;
    rows.forEach((row) => {
      const gruppe = relationValue(row.wildgruppe) || {};
      const klasse = relationValue(row.wildklasse) || {};
      const ort = relationValue(row.erlegungsort);
      if (gruppe.id) gruppen.set(String(gruppe.id), gruppe);
      if (klasse.id) klassen.set(String(klasse.id), klasse);
      const latitude = Number(ort?.latitude);
      const longitude = Number(ort?.longitude);
      if (!row.ort_id || !ort || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        ohneKoordinaten += 1;
        return;
      }
      const key = String(ort.id);
      const punkt = orte.get(key) || {
        ort_id: ort.id,
        ort_name: ort.reviereinrichtung
          ? [ort.name, ort.art].filter(Boolean).join(" - ")
          : ort.name,
        latitude,
        longitude,
        anzahl: 0,
        wildgruppen: new Map(),
      };
      punkt.anzahl += 1;
      if (gruppe.id) {
        const gruppenKey = String(gruppe.id);
        const wert = punkt.wildgruppen.get(gruppenKey) || {
          id: gruppe.id, bezeichnung: gruppe.bezeichnung, anzahl: 0,
        };
        wert.anzahl += 1;
        punkt.wildgruppen.set(gruppenKey, wert);
      }
      orte.set(key, punkt);
    });

    const nachReihenfolge = (left, right) =>
      Number(left.reihenfolge || 0) - Number(right.reihenfolge || 0) ||
      String(left.bezeichnung || "").localeCompare(String(right.bezeichnung || ""), "de");
    return {
      punkte: [...orte.values()].map((punkt) => ({
        ...punkt,
        wildgruppen: [...punkt.wildgruppen.values()].sort((a, b) =>
          a.bezeichnung.localeCompare(b.bezeichnung, "de")),
      })),
      wildgruppen: [...gruppen.values()].sort(nachReihenfolge),
      wildklassen: [...klassen.values()].sort(nachReihenfolge),
      ohneKoordinaten,
    };
  }

  async function loadDashboard(bereiche = {}) {
    const planperiode = await getAktivePlanperiode();
    if (!planperiode) {
      return {
        planperiode: null,
        planpositionen: [],
        jaeger: [],
        wildgruppen: [],
        wildhaendler: { gesamt: [], rotwild: [], rehwild: [] },
      };
    }

    const wildgruppen = await getAbschussplanWildgruppen();
    const wildgruppenIds = new Set(
      wildgruppen.map((wildgruppe) => String(wildgruppe.id)),
    );
    const [allePlanpositionen, alleJaeger, wildhaendler, hirschB1] = await Promise.all([
      bereiche.abschuss ? getPlanpositionen(planperiode.id) : Promise.resolve([]),
      (bereiche.jaeger || bereiche.abschuss) ? getJaeger(planperiode) : Promise.resolve([]),
      bereiche.wildhaendler
        ? getWildhaendler(planperiode, wildgruppen)
        : Promise.resolve({ beide: { gesamt: [], rotwild: [], rehwild: [] } }),
      bereiche.abschuss
        ? getHirschB1Statistik(planperiode)
        : Promise.resolve(null),
    ]);
    const planpositionen = allePlanpositionen.filter((row) =>
      wildgruppenIds.has(String(row.wildgruppe_id)));
    const jaeger = alleJaeger.filter((row) =>
      wildgruppenIds.has(String(row.wildgruppe_id)));
    return {
      planperiode, wildgruppen, planpositionen, jaeger, wildhaendler,
      hirsch_b1: hirschB1,
    };
  }

  return {
    loadDashboard,
    getAktivePlanperiode,
    getAbschussplanWildgruppen,
    getPlanpositionen,
    getJaeger,
    getWildhaendler,
    getHirschB1Statistik,
    getAbschussHeatmapDaten,
  };
})();

window.DashboardService = DashboardService;
