window.PersonenAutocompleteService = (() => {
  const db = window.db || window.supabase;
  let cache = null;
  let ladePromise = null;

  const normalisieren = (wert) => String(wert || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
  const name = (person) => [person?.vorname, person?.nachname].filter(Boolean).join(" ").trim();

  async function laden(force = false) {
    if (force) invalidate();
    if (cache) return cache;
    if (ladePromise) return ladePromise;
    ladePromise = db.from("personen")
      .select("id,personen_nr,vorname,nachname,name_kat,aktiv")
      .order("nachname").order("vorname")
      .then(({ data, error }) => {
        if (error) throw new Error(error.message || "Personen konnten nicht geladen werden.");
        cache = data || [];
        return cache;
      }).finally(() => { ladePromise = null; });
    return ladePromise;
  }

  function invalidate() { cache = null; ladePromise = null; }

  function optionen(personen) {
    const anzahl = new Map();
    (personen || []).forEach((person) => {
      const key = normalisieren(name(person)); anzahl.set(key, (anzahl.get(key) || 0) + 1);
    });
    return (personen || []).map((person) => {
      const basis = name(person);
      const doppelt = (anzahl.get(normalisieren(basis)) || 0) > 1;
      return { value: person.id, label: doppelt && person.name_kat ? `${basis} – ${person.name_kat}` : basis, data: person };
    });
  }

  function suchen(personen, query, ausgeschlossen = new Set(), limit = 10) {
    const needle = normalisieren(query);
    if (needle.length < 2) return [];
    const teile = needle.split(" ");
    const treffer = (personen || []).filter((person) => {
      if (ausgeschlossen.has(String(person.id))) return false;
      const vorname = normalisieren(person.vorname), nachname = normalisieren(person.nachname);
      const vollname = normalisieren(name(person));
      return teile.every((teil) => vorname.includes(teil) || nachname.includes(teil) || vollname.includes(teil));
    });
    const rang = (person) => {
      const vorname = normalisieren(person.vorname), nachname = normalisieren(person.nachname), vollname = normalisieren(name(person));
      if (vollname === needle) return 0;
      if (vorname.startsWith(needle)) return 1;
      if (nachname.startsWith(needle)) return 2;
      if (vollname.startsWith(needle)) return 3;
      return 4;
    };
    return treffer.sort((a, b) => rang(a) - rang(b) || name(a).localeCompare(name(b), "de")).slice(0, limit);
  }

  return { laden, invalidate, optionen, suchen, normalisieren, name };
})();
