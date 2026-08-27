const FreigabenService = (() => {
  const db = window.db || window.supabase;
  const check = (result) => { if (result.error) throw result.error; return result.data || []; };
  const norm = (wert) => String(wert || "").trim().toLocaleLowerCase("de");
  function addYears(datum, jahre) { const d = new Date(`${datum}T12:00:00`); d.setFullYear(d.getFullYear() + Number(jahre || 0)); return d.toISOString().slice(0, 10); }
  function heute() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function regelDatum(regel) {
    if (regel?.frei_ab) return String(regel.frei_ab);
    const jahr = Number(regel?.freigabejahr);
    return Number.isInteger(jahr) ? `${jahr}-01-01` : null;
  }
  function regelName(regelTyp) {
    return regelTyp === "SPERRE" ? "Sperre"
      : regelTyp === "VORZIEHEN" ? "Vorgezogen"
      : regelTyp === "SONDERFREIGABE" ? "Sonderfreigabe"
      : regelTyp === "INDIVIDUELLES_FREI_DATUM" ? "Individuelles Frei-Datum"
      : regelTyp === "INITIAL" ? "Initial"
      : "Individuelle Ausnahme";
  }
  function abschussFeldwert(abschuss, feld) {
    const erlaubteFelder = {
      geweihgewicht: abschuss?.geweihgewicht,
    };
    return Object.prototype.hasOwnProperty.call(erlaubteFelder, feld)
      ? erlaubteFelder[feld]
      : undefined;
  }
  function vergleichErfuellt(istWert, operator, grenzwert) {
    const ist = Number(istWert); const grenze = Number(grenzwert);
    if (!Number.isFinite(ist) || !Number.isFinite(grenze)) return false;
    if (operator === "<") return ist < grenze;
    if (operator === "<=") return ist <= grenze;
    if (operator === "=") return ist === grenze;
    if (operator === ">=") return ist >= grenze;
    if (operator === ">") return ist > grenze;
    return false;
  }
  function allgemeineRegelPruefen(abschuss, wildklasseId, regeln) {
    if (!abschuss) return { regel: null, fehlendesFeld: null };
    const abschussJahr = Number(String(abschuss.datum || "").slice(0, 4));
    const kandidaten = (regeln || []).filter((regel) =>
      String(regel.wildklasse_id) === String(wildklasseId) &&
      (!regel.ergebnis_typ || regel.ergebnis_typ === "STEHZEIT_JAHRE") &&
      abschussJahr >= Number(regel.jahr_von) && abschussJahr <= Number(regel.jahr_bis))
      .sort((a, b) => Number(b.prioritaet || 0) - Number(a.prioritaet || 0));
    let fehlendesFeld = null;
    for (const regel of kandidaten) {
      const wert = abschussFeldwert(abschuss, regel.bedingung_feld);
      if (wert === null || wert === undefined || wert === "") {
        fehlendesFeld ||= regel.bedingung_feld;
        continue;
      }
      if (vergleichErfuellt(wert, regel.vergleichsoperator, regel.grenzwert)) {
        return { regel, fehlendesFeld: null };
      }
    }
    return { regel: null, fehlendesFeld };
  }
  function calculateKahlwildPflichtProJahr(abschuesse, klasseMap, kahlwildIds, bisJahr) {
    const relevante = (abschuesse || [])
      .filter((abschuss) => {
        const jahr = Number(String(abschuss.datum || "").slice(0, 4));
        return Number.isInteger(jahr) && jahr <= Number(bisJahr);
      })
      .sort((a, b) => String(a.datum || "").localeCompare(String(b.datum || ""), "de"));

    const startjahr = relevante.length
      ? Math.min(...relevante.map((abschuss) => Number(String(abschuss.datum).slice(0, 4))))
      : Number(bisJahr);

    let offenePflichten = [];
    const ergebnis = [];

    for (let jahr = startjahr; jahr <= Number(bisJahr); jahr += 1) {
      const jahresabschuesse = relevante.filter((abschuss) => Number(String(abschuss.datum).slice(0, 4)) === jahr);
      const uebertrag = offenePflichten.reduce((summe, pflicht) => summe + Number(pflicht.offen || 0), 0);
      const pflichtNeu = jahresabschuesse.reduce((summe, abschuss) =>
        summe + Number(klasseMap.get(String(abschuss.wildklasse_id))?.kahlwildpflicht || 0), 0);

      const offeneVerpflichtungen = [...offenePflichten];
      if (pflichtNeu > 0) {
        offeneVerpflichtungen.push({ jahr, pflicht: pflichtNeu, offen: pflichtNeu });
      }

      const kahlwildAbschuesse = jahresabschuesse.filter((abschuss) => kahlwildIds.has(String(abschuss.wildklasse_id))).length;
      let verbleibend = kahlwildAbschuesse;
      let angerechnet = 0;

      offeneVerpflichtungen
        .sort((a, b) => Number(a.jahr) - Number(b.jahr))
        .forEach((pflicht) => {
          if (verbleibend <= 0 || Number(pflicht.offen || 0) <= 0) return;
          const verwendung = Math.min(verbleibend, Number(pflicht.offen || 0));
          pflicht.offen = Number(pflicht.offen || 0) - verwendung;
          verbleibend -= verwendung;
          angerechnet += verwendung;
        });

      offenePflichten = offeneVerpflichtungen.filter((pflicht) => Number(pflicht.offen || 0) > 0);
      const offen = offenePflichten.reduce((summe, pflicht) => summe + Number(pflicht.offen || 0), 0);
      const zeile = {
        jahr,
        pflicht: pflichtNeu,
        uebertrag,
        kahlwild_abschuesse: kahlwildAbschuesse,
        angerechnet,
        erfuellt: angerechnet,
        offen,
      };

      console.debug("[KAHILWILD JAHR DEBUG]", {
        Jahr: jahr,
        "Hirschpflicht neu": pflichtNeu,
        "Übertrag Vorjahr": uebertrag,
        "Kahlwildabschüsse": kahlwildAbschuesse,
        "Auf älteste Pflicht angerechnet": angerechnet,
        Offen: offen,
      });
      ergebnis.push(zeile);
    }

    return ergebnis;
  }

  async function planKontext() {
    const p = await db.from("planperioden").select("id,startjahr,endjahr").eq("status", "AKTIV").maybeSingle();
    if (p.error) throw p.error; if (!p.data) return { periode:null, kahlwildIds:new Set(), b1:null };
    const pp = check(await db.from("planperiode_planpositionen").select("id,code,bezeichnung").eq("planperiode_id",p.data.id).eq("aktiv",true));
    const kahl = pp.find((x)=>norm(x.code)==="kahlwild"||norm(x.bezeichnung)==="kahlwild");
    const mappings = kahl ? check(await db.from("planperiode_planposition_wildklasse").select("wildklasse_id").eq("planperiode_id",p.data.id).eq("planperiode_planposition_id",kahl.id)) : [];
    const b1Result = await db.from("wildklassen").select("id").eq("aktiv",true).or("code.eq.HIRSCH_B1,bezeichnung.ilike.Hirsch B1").limit(1).maybeSingle();
    if (b1Result.error) throw b1Result.error; let b1=null;
    if (b1Result.data) {
      const map = await db.from("planperiode_planposition_wildklasse").select("planperiode_planposition_id").eq("planperiode_id",p.data.id).eq("wildklasse_id",b1Result.data.id).limit(1).maybeSingle();
      if (map.error) throw map.error;
      if (map.data) { const [freigaben,statistik]=await Promise.all([AbschussplanService.getInterneFreigaben(p.data.id,map.data.planperiode_planposition_id),AbschussplanService.getHirschB1Statistik(p.data,b1Result.data.id)]); b1={wildklasseId:b1Result.data.id,freigaben,statistik}; }
    }
    return { periode:p.data, kahlwildIds:new Set(mappings.map((x)=>String(x.wildklasse_id))), b1 };
  }

  async function basisdaten(jahr) {
    const [alleJaeger,klassen,regelnResult,allgemeineRegelnResult,abschuesseResult,plan]=await Promise.all([
      AbschussService.getAuswaehlbareAbschussJaeger(), WildklassenService.getAktivePlanWildklassen(),
      db.from("abschussregeln").select("*").eq("aktiv",true).not("jaeger_id","is",null),
      db.from("allgemeine_abschussregeln").select("*").eq("aktiv",true)
        .order("prioritaet",{ascending:false}),
      db.from("abschuesse").select("id,datum,jaeger_id,wildklasse_id,fallwild,zusatzinfo,interner_hirsch_b1,geweihgewicht").eq("fallwild",false).lte("datum",`${jahr}-12-31`).order("datum",{ascending:false}),
      planKontext(),
    ]);
    const geladeneRegeln=check(regelnResult);
    geladeneRegeln.forEach((regel)=>console.debug("[HIRSCH DEBUG 1 - DB REGEL]", {
      id:regel.id,jaeger_id:regel.jaeger_id,wildklasse_id:regel.wildklasse_id,
      regel_typ:regel.regel_typ,freigabejahr:regel.freigabejahr,
      frei_ab:regel.frei_ab??null,bemerkung:regel.bemerkung,aktiv:regel.aktiv,
    }));
    const aktiveMitglieder=alleJaeger.filter((p)=>norm(p.name_kat)==="mitglied"&&p.aktiv===true)
      .sort((a,b)=>String(a.nachname||"").localeCompare(String(b.nachname||""),"de")||String(a.vorname||"").localeCompare(String(b.vorname||""),"de"));
    return { jaeger:aktiveMitglieder, klassen:WildklassenService.sortiereNachWildgruppeUndWildklasse(klassen), regeln:geladeneRegeln, allgemeineRegeln:check(allgemeineRegelnResult), abschuesse:check(abschuesseResult), plan };
  }

  function berechnen(basis,jahr) {
    const heuteIso=heute(); const klasseMap=new Map(basis.klassen.map((k)=>[String(k.id),k])); const ergebnis=[];
    const kahlwildVerlaufJeJaeger=new Map();
    basis.jaeger.forEach((jaeger)=>basis.klassen.forEach((klasse)=>{
      const personAbschuesse=basis.abschuesse.filter((a)=>String(a.jaeger_id)===String(jaeger.id)&&String(a.datum)<=`${jahr}-12-31`);
      const alleKlassenAbschuesse=personAbschuesse.filter((a)=>String(a.wildklasse_id)===String(klasse.id));
      const allePassendenRegeln=basis.regeln.filter((r)=>String(r.jaeger_id)===String(jaeger.id)&&String(r.wildklasse_id)===String(klasse.id));
      const initialRegel=allePassendenRegeln.filter((r)=>r.regel_typ==="INITIAL"&&regelDatum(r))
        .sort((a,b)=>String(regelDatum(b)).localeCompare(String(regelDatum(a))))[0]||null;
      const initialAb=regelDatum(initialRegel);
      const klassenAbschuesse=initialAb
        ? alleKlassenAbschuesse.filter((a)=>String(a.datum)>=String(initialAb))
        : alleKlassenAbschuesse;
      const letzter=klassenAbschuesse[0]||null;
      const nichtPassend=Boolean(letzter&&norm(letzter.zusatzinfo).includes("nicht passend"));
      const allgemeinePruefung=allgemeineRegelPruefen(letzter,klasse.id,basis.allgemeineRegeln);
      const allgemeineRegel=allgemeinePruefung.regel;
      const stehzeit=allgemeineRegel
        ? Number(allgemeineRegel.stehzeit_jahre)
        : nichtPassend&&Number(klasse.stehzeit_nicht_passend_jahre)>0
          ? Number(klasse.stehzeit_nicht_passend_jahre)
          : Number(klasse.stehzeit_jahre||0);
      let normalAb=letzter?addYears(letzter.datum,stehzeit):(initialAb||`${jahr}-01-01`);
      let grund=allgemeineRegel
        ? allgemeineRegel.bezeichnung
        : letzter
        ? (normalAb>heuteIso ? "Stehzeit noch nicht erfüllt" : nichtPassend ? `Stehzeit nicht passend: ${stehzeit} Jahre` : `Stehzeit ${stehzeit} Jahre`)
        : initialRegel
          ? (initialRegel.bemerkung ? `Initial - ${initialRegel.bemerkung}` : "Initial")
          : "Keine frühere Erlegung";
      const relevanteHirschAbschuesse=personAbschuesse.filter((abschuss)=>
        Number(klasseMap.get(String(abschuss.wildklasse_id))?.kahlwildpflicht||0)>0);
      const jaegerSchluessel=String(jaeger.id);
      if(!kahlwildVerlaufJeJaeger.has(jaegerSchluessel)){
        kahlwildVerlaufJeJaeger.set(jaegerSchluessel,
          calculateKahlwildPflichtProJahr(personAbschuesse,klasseMap,basis.plan.kahlwildIds,jahr));
      }
      const kahlwildJahr=kahlwildVerlaufJeJaeger.get(jaegerSchluessel).find((zeile)=>zeile.jahr===Number(jahr))||
        {jahr:Number(jahr),pflicht:0,uebertrag:0,kahlwild_abschuesse:0,angerechnet:0,erfuellt:0,offen:0};
      const erforderlich=kahlwildJahr.uebertrag+kahlwildJahr.pflicht;
      const kahlwild=kahlwildJahr.angerechnet;
      const kahlwildOffen=kahlwildJahr.offen;
      const kahlwildBlockiert=Number(klasse.kahlwildpflicht)>0&&kahlwildOffen>0;
      const kahlwildGrund=`Kahlwildpflicht nicht erfüllt (${kahlwild} von ${erforderlich} Stück erfüllt)`;
      if (kahlwildBlockiert) grund=kahlwildGrund;

      const passendeRegeln=allePassendenRegeln.filter((r)=>!['INITIAL','SPERRE'].includes(r.regel_typ)&&(!r.freigabejahr||Number(r.freigabejahr)===Number(jahr)));
      const aktiveSperre=allePassendenRegeln.filter((r)=>r.regel_typ==="SPERRE"&&regelDatum(r)&&regelDatum(r)>heuteIso)
        .sort((a,b)=>String(regelDatum(b)).localeCompare(String(regelDatum(a))))[0]||null;
      const individuell=aktiveSperre||passendeRegeln
        .sort((a,b)=>({SONDERFREIGABE:5,VORZIEHEN:4,INDIVIDUELLES_FREI_DATUM:3,INDIVIDUELLE_AUSNAHME:2,INITIAL:1}[b.regel_typ]||0)-({SONDERFREIGABE:5,VORZIEHEN:4,INDIVIDUELLES_FREI_DATUM:3,INDIVIDUELLE_AUSNAHME:2,INITIAL:1}[a.regel_typ]||0))[0]||null;
      const individuellAb=regelDatum(individuell);
      const individuellFreiAbOriginal=String(individuell?.frei_ab||"").trim()||null;
      if (individuell) console.debug("[HIRSCH DEBUG 2 - REGEL SERVICE]", {
        Jaeger:`${jaeger.vorname||""} ${jaeger.nachname||""}`.trim(),Regel:regelName(individuell.regel_typ),
        Freigabejahr:individuell.freigabejahr,"ORIGINAL frei_ab":individuell.frei_ab??null,
        "verarbeitetes frei_ab":individuellFreiAbOriginal,
      });
      let finalAb=individuellAb||normalAb;
      const freigabejahr=Number(individuell?.freigabejahr)||Number(String(finalAb||"").slice(0,4))||null;
      const regulaeresFreigabejahr=Number(String(normalAb||"").slice(0,4))||null;
      const endgueltigesFreigabejahr=Number(String(finalAb||"").slice(0,4))||null;
      if (individuell) console.debug("[HIRSCH DEBUG 3 - FREIGABEBERECHNUNG]", {
        regulaeresFreigabejahr,regulaeresFreigabedatum:normalAb,
        individuelleRegel:regelName(individuell.regel_typ),individuellesFreigabejahr:individuell.freigabejahr,
        individuellesFreiAbOriginal:individuellFreiAbOriginal,effektivesFreigabedatum:individuellAb,
        endgueltigesFreigabejahr,kahlwildOffen,
      });
      let b1Blockiert=false;
      if (individuell) {
        const name = regelName(individuell.regel_typ);
        grund = individuell.bemerkung ? `${name} - ${individuell.bemerkung}` : name;
      }

      if (basis.plan.b1&&String(klasse.id)===String(basis.plan.b1.wildklasseId)&&!individuell) {
        const soll=Number(basis.plan.b1.freigaben.find((x)=>Number(x.jahr)===Number(jahr))?.interne_freigabe||0);
        const ist=Number(jahr)===Number(basis.plan.periode?.startjahr)?basis.plan.b1.statistik.internStartjahr:Number(jahr)===Number(basis.plan.periode?.endjahr)?basis.plan.b1.statistik.internEndjahr:0;
        b1Blockiert=soll-ist<=0;
        grund=!b1Blockiert?`Interne B1-Freigabe: ${soll-ist} verfügbar`:"Keine interne B1-Freigabe";
      }

      const zeitlichFrei=finalAb<=heuteIso;
      let frei=zeitlichFrei;
      if (aktiveSperre) frei=false;
      if (kahlwildBlockiert) frei=false;
      if (b1Blockiert&&!individuell) frei=false;
      const istIndividuellVorgezogen=Boolean(individuell&&individuell.regel_typ!=="SPERRE"&&
        regulaeresFreigabejahr&&endgueltigesFreigabejahr&&regulaeresFreigabejahr>endgueltigesFreigabejahr);
      const freigabegruppe=istIndividuellVorgezogen?(individuellFreiAbOriginal?2:1):0;
      const sonderdatumNochNichtErreicht=Boolean(individuellFreiAbOriginal&&individuellFreiAbOriginal>heuteIso);
      const matrixZustand=aktiveSperre?"nicht-frei"
        :sonderdatumNochNichtErreicht?"sonder"
        :kahlwildBlockiert?"kahlwild":"frei";
      const darstellungsart=aktiveSperre?"NICHT_FREI"
        :sonderdatumNochNichtErreicht?"SONDERDATUM"
        :kahlwildBlockiert?"KAHLWILD_OFFEN"
        :freigabegruppe===2?"SONDERDATUM_ERREICHT"
        :freigabegruppe===1?"VORGEZOGEN_GANZES_JAHR":"REGULAER";
      if (norm(`${jaeger.vorname||""} ${jaeger.nachname||""}`)==="benedikt kohlmayer"&&norm(klasse.bezeichnung)==="hirsch a") {
        console.debug("[FREIGABE KAHLWILD DEBUG]", {
          Jäger:`${jaeger.vorname||""} ${jaeger.nachname||""}`.trim(), Wildklasse:klasse.bezeichnung,
          "Letzter Hirsch":letzter?.datum||null, "Kahlwildpflicht pro Hirsch":Number(klasse.kahlwildpflicht||0),
          "Anzahl relevanter Hirsche":relevanteHirschAbschuesse.length,
          "Kahlwild erforderlich":erforderlich, "Kahlwild erfüllt":kahlwild,
          "Kahlwild offen":kahlwildOffen, "Zeitlich frei ab":finalAb,
          "Individuelle Regel":individuell?regelName(individuell.regel_typ):null,
          "Endgültiger Status":frei?"FREI":"NICHT FREI", Grund:grund,
        });
      }
      if (initialRegel) {
        console.debug("[FREIGABE DEBUG]", {
          "Jäger-ID": jaeger.id,
          Jäger: `${jaeger.vorname || ""} ${jaeger.nachname || ""}`.trim(),
          "Wildklasse-ID": klasse.id,
          Wildklasse: klasse.bezeichnung,
          "Gefundene Abschussregeln": allePassendenRegeln.map((regel) => ({
            Regel: regelName(regel.regel_typ), Aktiv: regel.aktiv,
            Freigabejahr: regel.freigabejahr, "Frei ab": regel.frei_ab,
            Bemerkung: regel.bemerkung,
          })),
          "Initial-Regel gefunden": true,
          Regel: regelName(initialRegel.regel_typ),
          Aktiv: initialRegel.aktiv,
          Freigabejahr: initialRegel.freigabejahr,
          "Initial Frei ab": initialAb,
          Bemerkung: initialRegel.bemerkung,
          "Letzte Hirsch-/Wildklassen-Erlegung": letzter?.datum || null,
          "Allgemeine Stehzeit": stehzeit,
          "Individuelle spätere Regel": individuell
            ? `${regelName(individuell.regel_typ)}${individuell.bemerkung ? ` - ${individuell.bemerkung}` : ""}`
            : null,
          "Normale Freigabe": normalAb,
          "Endgültige Freigabe": finalAb,
          Status: frei ? "FREI" : "NICHT FREI",
          Grund: grund,
        });
      }
      ergebnis.push({jaeger,wildklasse:klasse,letzte_erlegung:letzter?.datum||null,relevante_abschuesse:klassenAbschuesse,
        normale_freigabe_ab:normalAb,individuelle_freigabe_ab:individuellAb,endgueltige_freigabe_ab:finalAb,frei_ab:finalAb,
        freigabejahr,regulaeres_freigabejahr:regulaeresFreigabejahr,endgueltiges_freigabejahr:endgueltigesFreigabejahr,
        individuelles_frei_ab_original:individuellFreiAbOriginal,individuelle_regel_typ:individuell?.regel_typ||null,
        freigabegruppe,darstellungsart,matrix_zustand:matrixZustand,
        status:frei?"FREI":"NICHT FREI",grund,stehzeit,nicht_passend:nichtPassend,regel:null,ausnahme:individuell,initial_regel:initialRegel,
        zeitliche_freigabe_ab:finalAb,zeitlich_frei:zeitlichFrei,
        allgemeine_regel:allgemeineRegel,
        regel_hinweis:allgemeinePruefung.fehlendesFeld === "geweihgewicht"
          ? "Geweihgewicht fehlt – historische Sonderregel konnte nicht geprüft werden."
          : null,
        kahlwild:{jahr:kahlwildJahr.jahr,pflicht:kahlwildJahr.pflicht,uebertrag:kahlwildJahr.uebertrag,
          kahlwild_abschuesse:kahlwildJahr.kahlwild_abschuesse,angerechnet:kahlwildJahr.angerechnet,
          erlegt:kahlwild,erforderlich,offen:kahlwildOffen,blockiert:kahlwildBlockiert,
          grund:kahlwildGrund,relevante_hirsche:relevanteHirschAbschuesse.length}});
    }));
    return ergebnis.sort((a,b)=>
      WildklassenService.vergleicheNachWildgruppeUndWildklasse(a.wildklasse,b.wildklasse)||
      String(a.jaeger.nachname||"").localeCompare(String(b.jaeger.nachname||""),"de")||
      String(a.jaeger.vorname||"").localeCompare(String(b.jaeger.vorname||""),"de"));
  }
  async function laden(jahr){const basis=await basisdaten(jahr);return{basis,freigaben:berechnen(basis,jahr)};}
  async function ladenMehrjahre(jahre) {
    const gueltigeJahre = [...new Set((jahre || []).map(Number).filter(Number.isFinite))]
      .sort((a, b) => a - b);
    if (!gueltigeJahre.length) return { basis: null, jahre: new Map() };
    const basis = await basisdaten(gueltigeJahre[gueltigeJahre.length - 1]);
    return {
      basis,
      jahre: new Map(gueltigeJahre.map((jahr) => [jahr, berechnen(basis, jahr)])),
    };
  }
  async function freigabeFuer(jaegerId,wildklasseId,jahr){const d=await laden(jahr);return d.freigaben.find((x)=>String(x.jaeger.id)===String(jaegerId)&&String(x.wildklasse.id)===String(wildklasseId))||null;}
  return {laden,ladenMehrjahre,freigabeFuer};
})();
