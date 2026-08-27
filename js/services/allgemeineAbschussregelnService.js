const AllgemeineAbschussregelnService = (() => {
  const db = window.db || window.supabase;
  const BEDINGUNGEN = [["geweihgewicht", "Geweihgewicht"]];
  const OPERATOREN = ["<", "<=", "=", ">=", ">"];
  const check = (result) => { if (result.error) throw result.error; return result.data || []; };

  async function laden(nurAktive = false) {
    let query = db.from("allgemeine_abschussregeln").select(
      "*,wildklasse:wildklassen(id,bezeichnung,reihenfolge,wildgruppe_id,wildgruppe:wildgruppen(id,bezeichnung,reihenfolge))");
    if (nurAktive) query = query.eq("aktiv", true);
    const regeln = check(await query);
    return regeln.sort((a, b) =>
      WildklassenService.vergleicheNachWildgruppeUndWildklasse(a.wildklasse, b.wildklasse) ||
      Number(a.jahr_von) - Number(b.jahr_von) || Number(a.nr) - Number(b.nr));
  }

  async function naechsteNr() {
    const rows = check(await db.from("allgemeine_abschussregeln")
      .select("nr").order("nr", { ascending: false }).limit(1));
    return Number(rows[0]?.nr || 0) + 1;
  }

  async function speichern(daten, id = null) {
    if (Number(daten.jahr_bis) < Number(daten.jahr_von)) {
      throw new Error("Gültig bis darf nicht vor Gültig von liegen.");
    }
    const query = id
      ? db.from("allgemeine_abschussregeln").update(daten).eq("id", id)
      : db.from("allgemeine_abschussregeln").insert(daten);
    const result = await query.select().single();
    if (result.error?.code === "23505") throw new Error(`Die Regel-Nr. ${daten.nr} ist bereits vergeben.`);
    if (result.error) throw result.error;
    return result.data;
  }

  async function loeschen(id) {
    const result = await db.from("allgemeine_abschussregeln").delete().eq("id", id);
    if (result.error) throw result.error;
  }

  function giltFuer(regel, wildklasseId, jahr, bedingung = null) {
    return regel?.aktiv === true && String(regel.wildklasse_id) === String(wildklasseId) &&
      Number(jahr) >= Number(regel.jahr_von) && Number(jahr) <= Number(regel.jahr_bis) &&
      (!bedingung || regel.bedingung_feld === bedingung);
  }

  return { BEDINGUNGEN, OPERATOREN, laden, naechsteNr, speichern, loeschen, giltFuer };
})();
