window.KeyDatesService = (() => {
  const db = window.db || window.supabase;
  function pruefen(result, text) { if (result.error) throw new Error(result.error.message || text); return result.data || []; }
  async function eintraege(jahr, filter = "key") {
    let query = db.from("st_peter_mitterberg")
      .select("id,datum,titel,kategorie_id,key_dates,kategorie:journal_kategorien!st_peter_mitterberg_kategorie_id_fkey(id,nr,bezeichnung,farbe,aktiv)")
      .gte("datum",`${jahr}-01-01`).lte("datum",`${jahr}-12-31`);
    if (filter === "key") query = query.eq("key_dates", true);
    return pruefen(await query.order("datum").order("titel"), "Key Dates konnten nicht geladen werden.");
  }
  async function jahre() {
    const rows=pruefen(await db.from("st_peter_mitterberg").select("datum").order("datum",{ascending:false}),"Verfügbare Jahre konnten nicht geladen werden.");
    return [...new Set([new Date().getFullYear(),...rows.map((row)=>Number(String(row.datum).slice(0,4))).filter(Number.isInteger)])].sort((a,b)=>b-a);
  }
  return { eintraege, jahre };
})();
