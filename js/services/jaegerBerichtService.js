window.JaegerBerichtService = (() => {
  const db = window.db || window.supabase;
  const relation = (value) => Array.isArray(value) ? value[0] : value;
  const norm = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
  const jahrVon = (datum) => Number(String(datum || "").slice(0, 4));
  const VEREIN_VALUE = "__jv_st_peter_mitterberg__";

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
    return Array.from({length:bis-von+1},(_,index)=>von+index);
  }

  async function jaegerBasisLaden() {
    return AbschussService.getAuswaehlbareAbschussJaeger();
  }
  async function jaegerLaden() {
    const personen = await jaegerBasisLaden();
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
  function nachDatumSortieren(liste, weitereVergleiche = () => 0) {
    return [...liste].sort((a, b) => String(a?.datum || "").localeCompare(String(b?.datum || ""))
      || weitereVergleiche(a, b)
      || String(a?.id || a?.nr || "").localeCompare(String(b?.id || b?.nr || "")));
  }
  function istRegulaererAbschuss(row) { return row?.fallwild !== true; }

  function ortName(row) {
    const ort = relation(row?.erlegungsort || row?.ort_stammdaten);
    return ort ? OrteAuswahl.bezeichnung(ort) : "–";
  }
  function jaegerName(row) {
    const person = relation(row?.jaeger) || {};
    return [person.vorname, person.nachname].filter(Boolean).join(" ") || "–";
  }

  function wildklasseInfo(row) {
    const wildklasse = relation(row?.wildklassen) || {};
    const wildgruppe = relation(row?.wildgruppen) || {};
    return {
      klasse: String(wildklasse.bezeichnung || "Ohne Wildklasse"),
      klasseNorm: norm(wildklasse.bezeichnung),
      code: String(wildklasse.code || "").trim().toUpperCase().replace(/[ -]+/g, "_"),
      gruppe: String(wildgruppe.bezeichnung || "Ohne Wildgruppe"),
      gruppeNorm: norm(wildgruppe.bezeichnung),
    };
  }
  function istRotwild(row) { return wildklasseInfo(row).gruppeNorm === "rotwild"; }
  function istRehwild(row) { return wildklasseInfo(row).gruppeNorm === "rehwild"; }
  function istHirsch(row) { const info = wildklasseInfo(row); return info.klasseNorm.startsWith("hirsch") || info.code.startsWith("HIRSCH_"); }
  function istHirschKlasse(row, klasse) { const info = wildklasseInfo(row); return info.code === `HIRSCH_${klasse}` || info.klasseNorm === `hirsch ${klasse.toLowerCase()}`; }
  function istTier(row) { const info = wildklasseInfo(row); return info.code === "TIER" || info.klasseNorm === "tier"; }
  function istSchmaltier(row) { const info = wildklasseInfo(row); return info.code === "SCHMALTIER" || info.klasseNorm.includes("schmaltier"); }
  function istKalb(row) { const info = wildklasseInfo(row); return info.code.startsWith("KALB") || info.klasseNorm.startsWith("kalb"); }
  function istRehbock(row, typ) { const info = wildklasseInfo(row); return info.code === `REHBOCK_${typ}` || info.code === `BOCK_${typ}` || info.klasseNorm === `rehbock ${typ.toLowerCase()}` || info.klasseNorm === `bock ${typ.toLowerCase()}`; }
  function istRehgeiss(row) { const info = wildklasseInfo(row); return info.code.includes("GEISS") || info.klasseNorm.includes("geiss") || info.klasseNorm.includes("geiß"); }
  function istRehkitz(row) { const info = wildklasseInfo(row); return info.code.includes("KITZ") || info.klasseNorm.includes("kitz"); }
  function istRaubwild(row) { const gruppe = wildklasseInfo(row).gruppeNorm; return gruppe.includes("raub") || gruppe.includes("haar"); }
  function istFederwild(row) { const gruppe = wildklasseInfo(row).gruppeNorm; return gruppe.includes("feder") || gruppe.includes("vogel"); }
  function nachKlassen(liste) {
    const gruppen = new Map();
    liste.forEach((row) => {
      const bezeichnung = `${wildklasseInfo(row).klasse}${row.fallwild ? " (Fallwild)" : ""}`;
      const eintrag = gruppen.get(bezeichnung) || { bezeichnung, anzahl: 0 };
      eintrag.anzahl += 1; gruppen.set(bezeichnung, eintrag);
    });
    return [...gruppen.values()].sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de"));
  }
  function geschlechter(liste) {
    const maennlich = liste.filter((row) => /männlich|maennlich/.test(wildklasseInfo(row).klasseNorm)).length;
    const weiblich = liste.filter((row) => /weiblich/.test(wildklasseInfo(row).klasseNorm)).length;
    return { maennlich, weiblich, vorhanden: maennlich > 0 || weiblich > 0 };
  }
  function jahreswerte(liste, jahre, zusammenfassung) { return jahre.map((jahr) => ({ jahr, ...zusammenfassung(liste.filter((row) => jahrVon(row.datum) === jahr)) })); }
  function auswertungErstellen(abschuesse, zeitraumJahre) {
    const rotwild = abschuesse.filter(istRotwild), rehwild = abschuesse.filter(istRehwild);
    const haarFederwild = abschuesse.filter((row) => istRaubwild(row) || istFederwild(row));
    const hirsche = rotwild.filter(istHirsch), tier = rotwild.filter(istTier), schmaltier = rotwild.filter(istSchmaltier), kalb = rotwild.filter(istKalb);
    const rehbockA = rehwild.filter((row) => istRehbock(row, "A")), rehbockB = rehwild.filter((row) => istRehbock(row, "B"));
    const rehgeiss = rehwild.filter(istRehgeiss), rehkitz = rehwild.filter(istRehkitz);
    const details = (liste, alter = true) => nachDatumSortieren(liste, (a, b) =>
      wildklasseInfo(a).klasse.localeCompare(wildklasseInfo(b).klasse, "de") || jaegerName(a).localeCompare(jaegerName(b), "de"))
      .map((row) => ({ id: row.id, datum: row.datum, klasse: wildklasseInfo(row).klasse, jaeger: jaegerName(row), alter: alter ? row.alter : null, jahr: jahrVon(row.datum), fallwild: row.fallwild === true }));
    const haarFederJahre = zeitraumJahre.flatMap((jahr) => {
      const werte = new Map();
      haarFederwild.filter((row) => jahrVon(row.datum) === jahr).forEach((row) => {
        const info = wildklasseInfo(row);
        const kategorie = istRaubwild(row) ? "Raubwild" : "Federwild";
        const bezeichnung = `${info.klasse}${row.fallwild ? " (Fallwild)" : ""}`;
        const key = `${kategorie}|${info.gruppe}|${bezeichnung}`;
        const eintrag = werte.get(key) || { jahr, wildgruppe: info.gruppe, bezeichnung, anzahl: 0 };
        eintrag.anzahl += 1; werte.set(key, eintrag);
      });
      return [...werte.values()].sort((a, b) => a.wildgruppe.localeCompare(b.wildgruppe, "de") || a.bezeichnung.localeCompare(b.bezeichnung, "de"));
    });
    return {
      rotwild: {
        gesamt: rotwild.length, hirsche: hirsche.length,
        hirschKlassen: ["A", "B", "B1"].map((klasse) => ({ klasse, anzahl: hirsche.filter((row) => istHirschKlasse(row, klasse)).length })).filter((wert) => wert.anzahl),
        kahlwild: tier.length + schmaltier.length + kalb.length, tiere: tier.length + schmaltier.length, kalb: kalb.length,
        hirschDetails: details(hirsche),
        kahlwildDetails: [["Tier", tier], ["Schmaltier", schmaltier], ["Kalb", kalb]].filter(([, liste]) => liste.length).map(([bezeichnung, liste]) => ({ bezeichnung, anzahl: liste.length, geschlechter: geschlechter(liste), klassen: nachKlassen(liste) })),
        jahre: jahreswerte(rotwild, zeitraumJahre, (liste) => ({ hirsche: ["A", "B", "B1"].map((klasse) => ({ klasse, anzahl: liste.filter((row) => istHirschKlasse(row, klasse)).length })).filter((wert) => wert.anzahl), tiere: liste.filter((row) => istTier(row) || istSchmaltier(row)).length, kalb: liste.filter(istKalb).length })),
      },
      rehwild: {
        gesamt: rehwild.length, rehbockA: rehbockA.length, rehbockB: rehbockB.length, rehgeiss: rehgeiss.length, rehkitz: rehkitz.length,
        rehbockADetails: details(rehbockA), rehbockBDetails: details(rehbockB, false),
        jahre: jahreswerte(rehwild, zeitraumJahre, (liste) => ({ rehbockA: liste.filter((row) => istRehbock(row, "A")).length, rehbockB: liste.filter((row) => istRehbock(row, "B")).length, rehgeiss: liste.filter(istRehgeiss).length, rehkitz: liste.filter(istRehkitz).length })),
      },
      haarFederwild: { raubwild: nachKlassen(haarFederwild.filter(istRaubwild)), federwild: nachKlassen(haarFederwild.filter(istFederwild)), jahre: haarFederJahre },
    };
  }

  async function laden(jaegerId, vonJahr, bisJahr) {
    vonJahr=Number(vonJahr);bisJahr=Number(bisJahr);
    if(!Number.isInteger(vonJahr)||!Number.isInteger(bisJahr)||vonJahr>bisJahr){
      throw new Error("Das Startjahr darf nicht größer als das Endjahr sein.");
    }
    const istVerein = String(jaegerId) === VEREIN_VALUE;
    const [personen, abschuesseAlle, nachsuchenAlle, probeschuesseAlle, fehlschuesseAlle,
      stPeterAlle] = await Promise.all([
      jaegerBasisLaden(), AbschussService.getAbschuesse(), NachsuchenService.getEintraege("nachsuchen"),
      NachsuchenService.getEintraege("probeschuesse"), NachsuchenService.getEintraege("fehlschuesse"),
      StPeterMitterbergService.laden(),
    ]);
    const jaeger = istVerein ? { id: null, vorname: "JV St. Peter/Mitterberg", nachname: "" }
      : personen.find((person) => String(person.id) === String(jaegerId));
    if (!jaeger) throw new Error("Der ausgewählte Jäger ist nicht verfügbar.");

    const jaegerIds = new Set(personen.map((person) => String(person.id)));
    const gehoertZumVerein = (row) => jaegerIds.has(String(row.jaeger_id));
    const personenAbschuesseAlle = abschuesseAlle.filter((row) => istVerein ? gehoertZumVerein(row) : String(row.jaeger_id) === String(jaegerId));
    const personenRegulaereAbschuesseAlle = personenAbschuesseAlle.filter(istRegulaererAbschuss);
    const vorhandeneJahre = [...new Set(personenRegulaereAbschuesseAlle.map((row) => jahrVon(row.datum))
      .filter(Number.isInteger))].sort((a, b) => a - b);
    const zeitraumJahre=Array.from({length:bisJahr-vonJahr+1},(_,index)=>vonJahr+index);
    const berechnungsJahre = [...new Set([...vorhandeneJahre.filter((wert) => wert <= bisJahr),...zeitraumJahre])];
    const freigabeDaten = await FreigabenService.ladenMehrjahre(berechnungsJahre);
    const statusJahr = bisJahr;
    const freigaben = (freigabeDaten.jahre.get(statusJahr) || [])
      .filter((row) => istVerein ? jaegerIds.has(String(row.jaeger?.id)) : String(row.jaeger.id) === String(jaegerId));
    const kahlwildStatus = istVerein ? null : (freigabeDaten.kahlwildJahre.get(statusJahr) || [])
      .find((row) => String(row.jaeger.id) === String(jaegerId)) || null;
    const kahlwildIds = freigabeDaten.basis?.plan?.kahlwildIds || new Set();
    const abschuesse = nachDatumSortieren(personenAbschuesseAlle.filter((row) => imZeitraum(row, vonJahr, bisJahr)), (a, b) =>
      wildklasseInfo(a).klasse.localeCompare(wildklasseInfo(b).klasse, "de") || jaegerName(a).localeCompare(jaegerName(b), "de"));
    const regulaereAbschuesse = abschuesse.filter(istRegulaererAbschuss);
    const fallwild = abschuesse.filter((row) => row.fallwild === true);
    const kahlwild = regulaereAbschuesse.filter((row) => kahlwildIds.has(String(row.wildklasse_id)));
    const hirsche = regulaereAbschuesse.filter((row) => norm(relation(row.wildklassen)?.bezeichnung).startsWith("hirsch"));
    const sonderabschuesse = regulaereAbschuesse.filter((row) => row.sonderabschuss === true);
    const nachsuchen = nachDatumSortieren(nachsuchenAlle.filter((row) => imZeitraum(row, vonJahr, bisJahr) && (istVerein ? gehoertZumVerein(row) : String(row.jaeger_id) === String(jaegerId))));
    const probeschuesse = nachDatumSortieren(probeschuesseAlle.filter((row) => imZeitraum(row, vonJahr, bisJahr) && (istVerein ? gehoertZumVerein(row) : String(row.jaeger_id) === String(jaegerId))));
    const fehlschuesse = nachDatumSortieren(fehlschuesseAlle.filter((row) => imZeitraum(row, vonJahr, bisJahr) && (istVerein ? gehoertZumVerein(row) : String(row.jaeger_id) === String(jaegerId))));
    const stPeter = nachDatumSortieren(stPeterAlle.filter((row) => imZeitraum(row, vonJahr, bisJahr) && (istVerein || personErwaehnt(row, jaeger))));

    const jahresStatistik = [...new Set(personenRegulaereAbschuesseAlle.map((row) => jahrVon(row.datum)).filter(Number.isInteger))]
      .sort((a, b) => a - b).map((wert) => {
        const liste = personenRegulaereAbschuesseAlle.filter((row) => jahrVon(row.datum) === wert);
        return { jahr: wert,
          kahlwild: liste.filter((row) => kahlwildIds.has(String(row.wildklasse_id))).length,
          hirschA: liste.filter((row) => norm(relation(row.wildklassen)?.bezeichnung) === "hirsch a").length,
          hirschB: liste.filter((row) => ["hirsch b", "hirsch b1"].includes(norm(relation(row.wildklassen)?.bezeichnung))).length };
      }).filter((row) => row.jahr>=vonJahr&&row.jahr<=bisJahr);

    const kahlwildJahre = istVerein ? [] : [...freigabeDaten.kahlwildJahre.entries()].map(([wert, rows]) => {
      const status = rows.find((row) => String(row.jaeger.id) === String(jaegerId));
      return status ? { jahr: wert, ...status } : null;
    }).filter(Boolean).filter((row) => row.jahr>=vonJahr&&row.jahr<=bisJahr);

    const wildgruppenStatistik=[...regulaereAbschuesse.reduce((map,row)=>{
      const gruppe=relation(row.wildgruppen)?.bezeichnung||"Ohne Wildgruppe";
      const basisKlasse=relation(row.wildklassen)?.bezeichnung||"Ohne Wildklasse";
      const klasse=row.fallwild?`${basisKlasse} (Fallwild)`:basisKlasse;
      if(!map.has(gruppe))map.set(gruppe,new Map());
      const klassen=map.get(gruppe);klassen.set(klasse,(klassen.get(klasse)||0)+1);return map;
    },new Map()).entries()].map(([wildgruppe,klassen])=>({wildgruppe,
      anzahl:[...klassen.values()].reduce((summe,wert)=>summe+wert,0),
      wildklassen:[...klassen.entries()].map(([wildklasse,anzahl])=>({wildklasse,anzahl}))}));

    const jahresWildgruppen=zeitraumJahre.map((jahr)=>{const liste=regulaereAbschuesse.filter((row)=>jahrVon(row.datum)===jahr);const gruppen={};
      liste.filter((row)=>row.fallwild!==true).forEach((row)=>{const name=relation(row.wildgruppen)?.bezeichnung||"Ohne Wildgruppe";gruppen[name]=(gruppen[name]||0)+1;});
      const regulaer=liste.filter((row)=>row.fallwild!==true);
      return{jahr,gruppen,kahlwild:regulaer.filter((row)=>kahlwildIds.has(String(row.wildklasse_id))).length,
        hirschA:regulaer.filter((row)=>norm(relation(row.wildklassen)?.bezeichnung)==="hirsch a").length,
        hirschB:regulaer.filter((row)=>["hirsch b","hirsch b1"].includes(norm(relation(row.wildklassen)?.bezeichnung))).length,
        fallwild:liste.filter((row)=>row.fallwild===true).length};});
    const auswertung = auswertungErstellen(regulaereAbschuesse, zeitraumJahre);

    const nachJaeger = (liste, filter = () => true) => [...liste.filter(filter).reduce((werte, row) => {
      const name = jaegerName(row), aktuell = werte.get(name) || { jaeger: name, anzahl: 0 };
      aktuell.anzahl += 1; werte.set(name, aktuell); return werte;
    }, new Map()).values()].sort((a, b) => b.anzahl - a.anzahl || a.jaeger.localeCompare(b.jaeger, "de"));
    const rotwildNachJaeger = [...regulaereAbschuesse.filter(istRotwild).reduce((werte, row) => {
      const name = jaegerName(row), aktuell = werte.get(name) || { jaeger: name, kahlwild: 0, hirsche: 0 };
      if (kahlwildIds.has(String(row.wildklasse_id))) aktuell.kahlwild += 1;
      if (istHirsch(row)) aktuell.hirsche += 1;
      werte.set(name, aktuell); return werte;
    }, new Map()).values()].sort((a, b) => (b.kahlwild + b.hirsche) - (a.kahlwild + a.hirsche) || a.jaeger.localeCompare(b.jaeger, "de"));

    return {
      jaeger, istVerein, vonJahr, bisJahr, statusJahr, erstelltAm: new Date(), abschuesse, fallwild, kahlwild, hirsche,
      sonderabschuesse, nachsuchen, probeschuesse, fehlschuesse, stPeter,
      freigaben, kahlwildStatus, kahlwildJahre, jahresStatistik, wildgruppenStatistik,jahresWildgruppen,ortName, auswertung,
      nachJaeger: { kahlwild: nachJaeger(kahlwild), rotwild: rotwildNachJaeger, rehwild: nachJaeger(regulaereAbschuesse, istRehwild), gesamt: nachJaeger(regulaereAbschuesse) },
      kennzahlen: {
        abschuesse:regulaereAbschuesse.length,kahlwild: kahlwild.length,hirsche:hirsche.length,
        hirschA: hirsche.filter((row) => norm(relation(row.wildklassen)?.bezeichnung) === "hirsch a").length,
        hirschB: hirsche.filter((row) => ["hirsch b", "hirsch b1"].includes(norm(relation(row.wildklassen)?.bezeichnung))).length,
        nachsuchen: nachsuchen.length, probeschuesse: probeschuesse.length,
        fehlschuesse: fehlschuesse.length, sonderabschuesse: sonderabschuesse.length,
      },
    };
  }

  return { jaegerLaden, jahreLaden, laden, personErwaehnt, VEREIN_VALUE };
})();
