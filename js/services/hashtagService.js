window.HashtagService = (() => {
  const db = window.db || window.supabase;
  let cache = null;

  function normalisieren(value) {
    return String(value || "").replace(/^#+/, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
  }

  function zusammenfuehren(...listen) {
    const eindeutig = new Map();
    listen.flat().forEach((tag) => {
      const bezeichnung = String(tag?.bezeichnung || tag || "").replace(/^#+/, "").trim().replace(/\s+/g, " ");
      const key = normalisieren(bezeichnung);
      if (key && !eindeutig.has(key)) eindeutig.set(key, bezeichnung);
    });
    return [...eindeutig.values()].sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
  }

  async function vorschlaegeLaden(neuLaden = false) {
    if (cache && !neuLaden) return [...cache];
    const [tagebuch, journal] = await Promise.all([
      db.from("tagebuch_hashtags").select("bezeichnung"),
      db.from("journal_hashtags").select("bezeichnung"),
    ]);
    const fehler = [tagebuch, journal].find((result) => result.error);
    if (fehler) {
      console.error("Hashtag-Vorschläge konnten nicht geladen werden:", fehler.error);
      throw new Error(fehler.error.message || "Hashtag-Vorschläge konnten nicht geladen werden.");
    }
    cache = zusammenfuehren(tagebuch.data || [], journal.data || []);
    return [...cache];
  }

  function hinzufuegenLokal(tags) {
    cache = zusammenfuehren(cache || [], tags || []);
  }

  return { vorschlaegeLaden, hinzufuegenLokal, normalisieren };
})();
