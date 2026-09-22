window.JaegerBerichtService = (() => {
  const db = window.db || window.supabase;
  const relation = (value) => Array.isArray(value) ? value[0] : value;
  const norm = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
  const jahrVon = (datum) => Number(String(datum || "").slice(0, 4));

  function pruefen(result, text) {
    if (result?.error) throw new Error(result.error.message || text);
    return result?.data || [];
  }

  async function jahreLaden() {
    const resultate=await Promise.all(["abschuesse","nachsuchen","probeschuesse","fehlschuesse","st_peter_mitterberg"]
      .map((tabelle)=>db.from(tabelle).select("datum")));
    const aktuell = new Date().getFullYear();
    const daten=resultate.flatMap((result)=>pruefen(result,"Berichtsjahre konnten nicht geladen werden."));
    const vorhanden=[aktuell,...daten.map((row) => jahrVon(row.datum)).filter(Number.isInteger)];
    const von=Math.min(...vorhanden),bis=Math.max(...vorhanden);
    return Array.from({length:bis-von+1},(_,index)=>bis-index);
  }

  async function jaegerLaden() {
    const personen = await AbschussService.getAuswaehlbareAbschussJaeger();
    return personen.filter((person) => person.aktiv !== false).sort((a, b) =>
      String(a.nachname || "").localeCompare(String(b.nachname || ""), "de") ||
      String(a.vorname || "").localeCompare(String(b.vorname || ""), "de"));
  }

  function personErwaehnt(row, person) {
    const text = norm(row?.weitere_personen);
    if (!text) return false;
    const teile = text.split(/[,;\n|]+/).map(norm).filter(Boolean);
    const vorname = norm(person.vorname), nachname = norm(person.nachname);
    const vollname = norm(`${person.vorname || ""} ${person.nachname || ""}`);
    return teile.some((teil) => {
      if (teil === vollname || teil === vorname || teil === nachname) return true;
      const woerter = teil.split(/\s+/);
      return (vorname && woerter.includes(vorname)) || (nachname && woerter.includes(nachname));
    });
  }

  function imZeitraum(row, vonJahr, bisJahr) {
    const jahr = jahrVon(row.datum);
    return Number.isInteger(jahr) && jahr >= Number(vonJahr) && jahr <= Number(bisJahr);
  }

  function ortName(row) {
    const ort = relation(row?.erlegungsort || row?.ort_stammdaten);
    return ort ? OrteAuswahl.bezeichnung(ort) : "–";
  }

  async function laden(jaegerId, vonJahr, bisJahr) {
    vonJahr=Number(vonJahr);bisJahr=Number(bisJahr);
    if(!Number.isInteger(vonJahr)||!Number.isInteger(bisJahr)||vonJahr>bisJahr){
      throw new Error("Das Startjahr darf nicht größer als das Endjahr sein.");
    }
    const [personen, abschuesseAlle, nachsuchenAlle, probeschuesseAlle, fehlschuesseAlle,
      stPeterAlle] = await Promise.all([
      jaegerLaden(), AbschussService.getAbschuesse(), NachsuchenService.getEintraege("nachsuchen"),
      NachsuchenService.getEintraege("probeschuesse"), NachsuchenService.getEintraege("fehlschuesse"),
      StPeterMitterbergService.laden(),
    ]);
    const jaeger = personen.find((person) => String(person.id) === String(jaegerId));
    if (!jaeger) throw new Error("Der ausgewählte Jäger ist nicht verfügbar.");

    const personenAbschuesseAlle = abschuesseAlle.filter((row) => String(row.jaeger_id) === String(jaegerId));
    const vorhandeneJahre = [...new Set(personenAbschuesseAlle.map((row) => jahrVon(row.datum))
      .filter(Number.isInteger))].sort((a, b) => a - b);
    const zeitraumJahre=Array.from({length:bisJahr-vonJahr+1},(_,index)=>vonJahr+index);
    const berechnungsJahre = [...new Set([...vorhandeneJahre.filter((wert) => wert <= bisJahr),...zeitraumJahre])];
    const freigabeDaten = await FreigabenService.ladenMehrjahre(berechnungsJahre);
    const statusJahr = bisJahr;
    const freigaben = (freigabeDaten.jahre.get(statusJahr) || [])
      .filter((row) => String(row.jaeger.id) === String(jaegerId));
    const kahlwildStatus = (freigabeDaten.kahlwildJahre.get(statusJahr) || [])
      .find((row) => String(row.jaeger.id) === String(jaegerId)) || null;
    const kahlwildIds = freigabeDaten.basis?.plan?.kahlwildIds || new Set();
    const abschuesse = personenAbschuesseAlle.filter((row) => imZeitraum(row, vonJahr, bisJahr));
    const kahlwild = abschuesse.filter((row) => kahlwildIds.has(String(row.wildklasse_id)));
    const hirsche = abschuesse.filter((row) => norm(relation(row.wildklassen)?.bezeichnung).startsWith("hirsch"));
    const sonderabschuesse = abschuesse.filter((row) => row.sonderabschuss === true);
    const nachsuchen = nachsuchenAlle.filter((row) => String(row.jaeger_id) === String(jaegerId) && imZeitraum(row, vonJahr, bisJahr));
    const probeschuesse = probeschuesseAlle.filter((row) => String(row.jaeger_id) === String(jaegerId) && imZeitraum(row, vonJahr, bisJahr));
    const fehlschuesse = fehlschuesseAlle.filter((row) => String(row.jaeger_id) === String(jaegerId) && imZeitraum(row, vonJahr, bisJahr));
    const stPeter = stPeterAlle.filter((row) => imZeitraum(row, vonJahr, bisJahr) && personErwaehnt(row, jaeger));

    const jahresStatistik = [...new Set(personenAbschuesseAlle.map((row) => jahrVon(row.datum)).filter(Number.isInteger))]
      .sort((a, b) => a - b).map((wert) => {
        const liste = personenAbschuesseAlle.filter((row) => jahrVon(row.datum) === wert);
        return { jahr: wert,
          kahlwild: liste.filter((row) => kahlwildIds.has(String(row.wildklasse_id))).length,
          hirschA: liste.filter((row) => norm(relation(row.wildklassen)?.bezeichnung) === "hirsch a").length,
          hirschB: liste.filter((row) => ["hirsch b", "hirsch b1"].includes(norm(relation(row.wildklassen)?.bezeichnung))).length };
      }).filter((row) => row.jahr>=vonJahr&&row.jahr<=bisJahr);

    const kahlwildJahre = [...freigabeDaten.kahlwildJahre.entries()].map(([wert, rows]) => {
      const status = rows.find((row) => String(row.jaeger.id) === String(jaegerId));
      return status ? { jahr: wert, ...status } : null;
    }).filter(Boolean).filter((row) => row.jahr>=vonJahr&&row.jahr<=bisJahr);

    const wildgruppenStatistik=[...abschuesse.reduce((map,row)=>{
      const gruppe=relation(row.wildgruppen)?.bezeichnung||"Ohne Wildgruppe";
      const basisKlasse=relation(row.wildklassen)?.bezeichnung||"Ohne Wildklasse";
      const klasse=row.fallwild?`${basisKlasse} (Fallwild)`:basisKlasse;
      if(!map.has(gruppe))map.set(gruppe,new Map());
      const klassen=map.get(gruppe);klassen.set(klasse,(klassen.get(klasse)||0)+1);return map;
    },new Map()).entries()].map(([wildgruppe,klassen])=>({wildgruppe,
      anzahl:[...klassen.values()].reduce((summe,wert)=>summe+wert,0),
      wildklassen:[...klassen.entries()].map(([wildklasse,anzahl])=>({wildklasse,anzahl}))}));

    const jahresWildgruppen=zeitraumJahre.map((jahr)=>{const liste=abschuesse.filter((row)=>jahrVon(row.datum)===jahr);const gruppen={};
      liste.filter((row)=>row.fallwild!==true).forEach((row)=>{const name=relation(row.wildgruppen)?.bezeichnung||"Ohne Wildgruppe";gruppen[name]=(gruppen[name]||0)+1;});
      const regulaer=liste.filter((row)=>row.fallwild!==true);
      return{jahr,gruppen,kahlwild:regulaer.filter((row)=>kahlwildIds.has(String(row.wildklasse_id))).length,
        hirschA:regulaer.filter((row)=>norm(relation(row.wildklassen)?.bezeichnung)==="hirsch a").length,
        hirschB:regulaer.filter((row)=>["hirsch b","hirsch b1"].includes(norm(relation(row.wildklassen)?.bezeichnung))).length,
        fallwild:liste.filter((row)=>row.fallwild===true).length};});

    return {
      jaeger, vonJahr, bisJahr, statusJahr, erstelltAm: new Date(), abschuesse, kahlwild, hirsche,
      sonderabschuesse, nachsuchen, probeschuesse, fehlschuesse, stPeter,
      freigaben, kahlwildStatus, kahlwildJahre, jahresStatistik, wildgruppenStatistik,jahresWildgruppen,ortName,
      kennzahlen: {
        abschuesse:abschuesse.length,kahlwild: kahlwild.length,hirsche:hirsche.length,
        hirschA: hirsche.filter((row) => norm(relation(row.wildklassen)?.bezeichnung) === "hirsch a").length,
        hirschB: hirsche.filter((row) => ["hirsch b", "hirsch b1"].includes(norm(relation(row.wildklassen)?.bezeichnung))).length,
        nachsuchen: nachsuchen.length, probeschuesse: probeschuesse.length,
        fehlschuesse: fehlschuesse.length, sonderabschuesse: sonderabschuesse.length,
      },
    };
  }

  return { jaegerLaden, jahreLaden, laden, personErwaehnt };
})();
