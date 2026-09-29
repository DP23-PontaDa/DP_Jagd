const JagdJahrService = (() => {
  const db = window.db || window.supabase;

  function pruefen(result, meldung) {
    if (result.error) {
      console.error(meldung, result.error);
      throw new Error(result.error.message || meldung);
    }
    return result.data || [];
  }

  async function verfuegbareJahre() {
    const rows = pruefen(await db.from("abschuesse").select("datum")
      .not("datum", "is", null).order("datum"), "Jagdjahre konnten nicht geladen werden.");
    const jahre = new Set(rows.map((row) => Number(String(row.datum).slice(0, 4))));
    jahre.add(new Date().getFullYear());
    return [...jahre].sort((a, b) => b - a);
  }

  async function abschuesse(jahr) {
    const von = `${jahr}-01-01`;
    const bis = `${jahr}-12-31`;
    return pruefen(await db.from("abschuesse").select(`
      id,nr,datum,tageszeit,fallwild,sonderabschuss,alter,
      jaeger:personen(id,vorname,nachname),
      wildgruppe:wildgruppen(id,bezeichnung),
      wildklasse:wildklassen(id,code,bezeichnung,kuerzel),
      erlegungsort:orte(id,name,art,reviereinrichtung)
    `).gte("datum", von).lte("datum", bis).order("datum").order("nr"),
    "Abschüsse des Jagdjahres konnten nicht geladen werden.");
  }

  function normal(wert) {
    return String(wert || "").trim().toLocaleLowerCase("de");
  }

  async function hirschAFreigabeEreignisse(jahr) {
    if (Number(jahr) < 2025 || !window.AbschussplanService) return [];
    const planperiode = await AbschussplanService.getAktivePlanperiode();
    if (!planperiode) return [];
    const positionen = await AbschussplanService.getPlanperiodePlanpositionen(planperiode.id);
    const finde = (bezeichnung) => positionen.find((position) => normal(position.bezeichnung) === bezeichnung && position.aktiv === true);
    const kahlwild = finde("kahlwild");
    const hirschA = finde("hirsch a");
    const hirschB = finde("hirsch b");
    if (!kahlwild || !hirschA || !hirschB) return [];
    const daten = await AbschussplanService.getRotwildFreigabeDaten(
      planperiode,
      { kahlwild: kahlwild.id, hirschA: hirschA.id, hirschB: hirschB.id },
      jahr,
    );
    return daten.freigabeEreignisse || [];
  }

  async function datenFuerJahr(jahr) {
    const [jahresAbschuesse, freigabeEreignisse] = await Promise.all([
      abschuesse(jahr),
      hirschAFreigabeEreignisse(jahr),
    ]);
    return { abschuesse: jahresAbschuesse, freigabeEreignisse };
  }

  return { verfuegbareJahre, abschuesse, datenFuerJahr, hirschAFreigabeEreignisse };
})();
