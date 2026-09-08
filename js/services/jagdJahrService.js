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
      id,nr,datum,tageszeit,fallwild,
      jaeger:personen(id,vorname,nachname),
      wildgruppe:wildgruppen(id,bezeichnung),
      wildklasse:wildklassen(id,bezeichnung,kuerzel),
      erlegungsort:orte(id,name,art,reviereinrichtung)
    `).gte("datum", von).lte("datum", bis).order("datum").order("nr"),
    "Abschüsse des Jagdjahres konnten nicht geladen werden.");
  }

  return { verfuegbareJahre, abschuesse };
})();
