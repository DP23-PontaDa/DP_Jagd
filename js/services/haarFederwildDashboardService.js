const HaarFederwildDashboardService = (() => {
  const db = window.db || window.supabase;
  const relation = (wert) => Array.isArray(wert) ? wert[0] : wert;

  function pruefen(result, context) {
    if (result.error) {
      console.error(context, result.error);
      throw new Error("Die Haar- und Federwild-Daten konnten nicht geladen werden.");
    }
    return result.data || [];
  }

  async function aktivePlanperiode() {
    const result = await db.from("planperioden")
      .select("id,bezeichnung,startjahr,endjahr")
      .eq("status", "AKTIV").maybeSingle();
    if (result.error) throw result.error;
    return result.data || null;
  }

  async function relevanteWildgruppen() {
    return WildgruppenService.getAktiveWildgruppenNachAbschussplan(false);
  }

  async function abschuesseLaden(planperiode, gruppen) {
    if (!gruppen.length) return [];
    const rows = []; const pageSize = 1000; let offset = 0; let page = [];
    do {
      const result = await db.from("abschuesse").select(`
        datum,jaeger_id,wildgruppe_id,wildklasse_id,
        jaeger:personen(id,personen_nr,vorname,nachname),
        wildgruppe:wildgruppen(id,bezeichnung,reihenfolge),
        wildklasse:wildklassen(id,bezeichnung,reihenfolge)
      `).eq("fallwild", false)
        .in("wildgruppe_id", gruppen.map((gruppe) => gruppe.id))
        .gte("datum", `${planperiode.startjahr}-01-01`)
        .lt("datum", `${Number(planperiode.endjahr) + 1}-01-01`)
        .range(offset, offset + pageSize - 1);
      page = pruefen(result, "HaarFederwildDashboard.Abschuesse");
      rows.push(...page); offset += pageSize;
    } while (page.length === pageSize);
    return rows;
  }

  function aggregieren(abschuesse) {
    const klassen = new Map(); const jaeger = new Map();
    abschuesse.forEach((abschuss) => {
      const gruppe = relation(abschuss.wildgruppe) || {};
      const klasse = relation(abschuss.wildklasse) || {};
      const person = relation(abschuss.jaeger) || {};
      const jahr = Number(String(abschuss.datum || "").slice(0, 4));
      if (!klasse.id || !jahr) return;
      const klassenKey = `${jahr}|${klasse.id}`;
      const klassenRow = klassen.get(klassenKey) || {
        jahr, wildklasse_id: klasse.id, wildklasse: klasse.bezeichnung,
        wildklasse_reihenfolge: Number(klasse.reihenfolge) || 0,
        wildgruppe: gruppe.bezeichnung,
        wildgruppe_reihenfolge: Number(gruppe.reihenfolge) || 0, anzahl: 0,
      };
      klassenRow.anzahl += 1; klassen.set(klassenKey, klassenRow);

      if (!person.id) return;
      const jaegerKey = `${jahr}|${person.id}`;
      const jaegerRow = jaeger.get(jaegerKey) || {
        jahr, jaeger_id: person.id, jaeger_nr: person.personen_nr ?? null,
        jaeger: [person.vorname, person.nachname].filter(Boolean).join(" "), anzahl: 0,
      };
      jaegerRow.anzahl += 1; jaeger.set(jaegerKey, jaegerRow);
    });
    return { klassen: [...klassen.values()], jaeger: [...jaeger.values()] };
  }

  async function laden() {
    const planperiode = await aktivePlanperiode();
    if (!planperiode) return { planperiode: null, klassen: [], jaeger: [] };
    const gruppen = await relevanteWildgruppen();
    const abschuesse = await abschuesseLaden(planperiode, gruppen);
    console.info("[Haar-/Federwild Dashboard]", {
      wildgruppen: gruppen.map((gruppe) => gruppe.bezeichnung),
      abschuesse: abschuesse.length,
      planperiode: `${planperiode.startjahr}/${planperiode.endjahr}`,
    });
    return { planperiode, ...aggregieren(abschuesse) };
  }

  return { laden };
})();

window.HaarFederwildDashboardService = HaarFederwildDashboardService;
