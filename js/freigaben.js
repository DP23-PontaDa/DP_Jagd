window.Freigaben = (() => {
  const el = (id) => document.getElementById(id);
  const esc = (wert) => { const div = document.createElement("div"); div.textContent = wert ?? ""; return div.innerHTML; };
  const jahrAnzeigen = (datum) => {
    if (!datum) return "–";
    const treffer = String(datum).match(/(?:^|\D)(\d{4})(?:\D|$)/);
    return treffer ? treffer[1] : datum;
  };
  let daten = []; let basis = null; let jahresdaten = new Map();
  let aktiveAnsicht = "hirsche"; let nachJahrenSortieren = true;

  function matrixJahre() {
    const mitte = Number(el("fgJahr").value) || new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => mitte - 1 + index);
  }

  async function init() {
    nachJahrenSortieren = true;
    el("fgSortJahre").classList.add("active");
    el("fgSortJahre").setAttribute("aria-pressed", "true");
    const jahr = new Date().getFullYear();
    for (let wert = jahr - 2; wert <= jahr + 2; wert += 1) el("fgJahr").add(new Option(wert, wert));
    el("fgJahr").value = jahr;
    ["fgJaeger", "fgWildklasse", "fgStatus"].forEach((id) => el(id).addEventListener("change", rendern));
    el("fgJahr").addEventListener("change", laden);
    el("fgTabUebersicht").addEventListener("click", () => ansichtSetzen("uebersicht"));
    el("fgTabHirsche").addEventListener("click", () => ansichtSetzen("hirsche"));
    el("fgSortJahre").addEventListener("click", () => {
      nachJahrenSortieren = !nachJahrenSortieren;
      el("fgSortJahre").classList.toggle("active", nachJahrenSortieren);
      el("fgSortJahre").setAttribute("aria-pressed", String(nachJahrenSortieren));
      rendern();
    });
    ["fgHirschDetailClose", "fgHirschDetailOk"].forEach((id) =>
      el(id).addEventListener("click", hirschDetailSchliessen));
    el("fgHirschDetail").addEventListener("click", (event) => {
      if (event.target === el("fgHirschDetail")) hirschDetailSchliessen();
    });
    ansichtSetzen("hirsche");
    await laden();
  }

  async function laden() {
    try {
      const jahr = Number(el("fgJahr").value);
      const ergebnis = await FreigabenService.ladenMehrjahre(matrixJahre());
      jahresdaten = ergebnis.jahre; basis = ergebnis.basis;
      daten = jahresdaten.get(jahr) || [];
      optionen(); rendern();
    } catch (error) {
      console.error("Freigaben konnten nicht geladen werden:", error);
      AppFeedback.error(error.message || "Freigaben konnten nicht geladen werden.");
    }
  }

  function ansichtSetzen(ansicht) {
    aktiveAnsicht = ansicht;
    const hirsche = ansicht === "hirsche";
    el("fgTabUebersicht").classList.toggle("active", !hirsche);
    el("fgTabHirsche").classList.toggle("active", hirsche);
    el("fgTabUebersicht").setAttribute("aria-selected", String(!hirsche));
    el("fgTabHirsche").setAttribute("aria-selected", String(hirsche));
    el("fgUebersichtPanel").hidden = hirsche;
    el("fgHirschePanel").hidden = !hirsche;
    rendern();
  }

  function auswahlFuellen(id, elemente, label) {
    const select = el(id); const wert = select.value;
    select.innerHTML = id.startsWith("fgForm") ? "" : '<option value="">Alle</option>';
    elemente.forEach((element) => select.add(new Option(label(element), element.id)));
    select.value = wert;
  }
  function optionen() {
    auswahlFuellen("fgJaeger", basis.jaeger, (wert) => `${wert.vorname} ${wert.nachname}`);
    wildklassenAuswahlFuellen();
  }

  function wildklassenAuswahlFuellen() {
    const select = el("fgWildklasse"); const wert = select.value;
    select.innerHTML = '<option value="">Alle</option>';
    let gruppe = null; let optgroup = null;
    WildklassenService.sortiereNachWildgruppeUndWildklasse(basis.klassen).forEach((klasse) => {
      const gruppenId = String(klasse.wildgruppe_id || "");
      if (gruppenId !== gruppe) {
        gruppe = gruppenId; optgroup = document.createElement("optgroup");
        optgroup.label = klasse.wildgruppe_bezeichnung || "Ohne Wildgruppe"; select.append(optgroup);
      }
      optgroup.append(new Option(klasse.bezeichnung, klasse.id));
    });
    select.value = wert;
  }

  function rendern() {
    if (aktiveAnsicht === "hirsche") return hirscheRendern();
    const gefiltert = daten.filter((wert) =>
      (!el("fgJaeger").value || String(wert.jaeger.id) === el("fgJaeger").value) &&
      (!el("fgWildklasse").value || String(wert.wildklasse.id) === el("fgWildklasse").value) &&
      (!el("fgStatus").value || wert.status === el("fgStatus").value));
    if (el("fgJaeger").value) return einzelansichtRendern(gefiltert);
    sammelansichtRendern(gefiltert);
  }

  function datumsJahr(datum) { return datum ? Number(String(datum).slice(0, 4)) : null; }
  function heutigesDatumIso() {
    const datum = new Date();
    return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(datum.getDate()).padStart(2, "0")}`;
  }
  function datumKurz(datum) {
    if (!datum) return "–";
    const teile = String(datum).split("-");
    return teile.length === 3 ? `${teile[2]}.${teile[1]}.` : datum;
  }
  function datumVoll(datum) {
    if (!datum) return "–";
    const teile = String(datum).slice(0, 10).split("-");
    return teile.length === 3 ? `${teile[2]}.${teile[1]}.${teile[0]}` : datum;
  }
  function matrixZustand(wert, jahr) {
    const jahresende = `${jahr}-12-31`;
    const ausnahme = wert.ausnahme;
    const sperre = ausnahme?.regel_typ === "SPERRE";
    const sperreAmJahresendeAktiv = sperre &&
      String(wert.individuelle_freigabe_ab || "9999-12-31") > jahresende;
    const kahlwildOffen = Number(wert.kahlwild?.erforderlich || 0) >
      Number(wert.kahlwild?.erlegt || 0) &&
      String(wert.normale_freigabe_ab || "9999-12-31") <= jahresende;
    const sonderImJahr = istSonderregel(wert) &&
      datumsJahr(wert.individuelle_freigabe_ab) === Number(jahr);
    if (sperreAmJahresendeAktiv) return "nicht-frei";
    if (kahlwildOffen) return "kahlwild";
    if (sonderImJahr) return "sonder";
    const wirksameFreigabe = sperre
      ? wert.normale_freigabe_ab
      : wert.endgueltige_freigabe_ab;
    return String(wirksameFreigabe || "9999-12-31") <= jahresende
      ? "frei" : "nicht-frei";
  }
  function matrixGrund(wert, zustand) {
    if (zustand === "kahlwild") {
      return `Kahlwildpflicht nicht erfüllt (${Number(wert.kahlwild?.erlegt || 0)} / ${Number(wert.kahlwild?.erforderlich || 0)} Kahlwild)`;
    }
    return wert.grund || (zustand === "frei" ? "Frei" : "Nicht frei");
  }
  function istSonderregel(wert) {
    const regel = wert?.ausnahme;
    return Boolean(regel && regel.regel_typ !== "SPERRE" && originalesFreiAb(wert));
  }
  function originalesFreiAb(wert) {
    return String(wert?.individuelles_frei_ab_original ?? wert?.ausnahme?.frei_ab ?? "").trim() || null;
  }
  function istFixesFreigabedatum(regel) {
    return Boolean(String(regel?.frei_ab || "").trim());
  }
  function individuelleAbweichung(wert) {
    const typ = wert?.ausnahme?.regel_typ;
    return Boolean(typ && !["INITIAL", "SPERRE"].includes(typ) &&
      Number(wert.regulaeres_freigabejahr) !== Number(wert.endgueltiges_freigabejahr));
  }
  function matrixPlan(jaegerId, wildklasseId, jahre, zentralesJahr) {
    const werte = new Map(jahre.map((jahr) =>
      [jahr, freigabeFinden(jahr, jaegerId, wildklasseId)]));
    const aktuell = werte.get(zentralesJahr) || null;
    const zukunft = jahre.filter((jahr) => jahr >= zentralesJahr);
    const abweichungsJahr = zukunft.find((jahr) => Number(werte.get(jahr)?.freigabegruppe || 0) > 0);
    if (abweichungsJahr != null) {
      const zielWert = werte.get(abweichungsJahr);
      const freiAb = originalesFreiAb(zielWert);
      const fixesDatum = Boolean(freiAb);
      return {
        werte, zielJahr: abweichungsJahr,
        zielZustand: zielWert.matrix_zustand,
        darstellungsart: zielWert.darstellungsart, zielWert,
        tatsaechlichesFreigabeJahr: zielWert?.endgueltiges_freigabejahr || abweichungsJahr,
        regulaeresFreigabeJahr: zielWert?.regulaeres_freigabejahr || datumsJahr(zielWert?.normale_freigabe_ab),
        individuelleAbweichung: individuelleAbweichung(zielWert),
        fixesFreigabedatum: fixesDatum,
        bereitsVorherFrei: false,
      };
    }
    if (!aktuell) return { werte, zielJahr: null, zielZustand: "nicht-frei", zielWert: null };

    const sperre = aktuell.ausnahme?.regel_typ === "SPERRE";
    const normaleFreigabe = String(aktuell.normale_freigabe_ab || "9999-12-31");
    const sperrEnde = String(aktuell.individuelle_freigabe_ab || "0000-01-01");
    const relevanteFreigabe = sperre && normaleFreigabe > sperrEnde
      ? normaleFreigabe
      : String(aktuell.endgueltige_freigabe_ab || "9999-12-31");
    const freigabeJahr = datumsJahr(relevanteFreigabe);
    const bereitsVorherFrei = Boolean(freigabeJahr && freigabeJahr < zentralesJahr);
    const zielJahr = bereitsVorherFrei
      ? zentralesJahr - 1
      : freigabeJahr || null;
    const imZieljahr = werte.get(zielJahr) || aktuell;
    const kahlwildOffen = Number(imZieljahr.kahlwild?.offen || 0) > 0 &&
      relevanteFreigabe <= `${zielJahr}-12-31`;
    return {
      werte,
      zielJahr,
      zielZustand: imZieljahr.matrix_zustand || (kahlwildOffen ? "kahlwild" : "frei"),
      darstellungsart: imZieljahr.darstellungsart || (kahlwildOffen ? "KAHLWILD_OFFEN" : "REGULAER"),
      zielWert: imZieljahr,
      tatsaechlichesFreigabeJahr: freigabeJahr,
      regulaeresFreigabeJahr: aktuell.regulaeres_freigabejahr || datumsJahr(aktuell.normale_freigabe_ab),
      individuelleAbweichung: individuelleAbweichung(aktuell),
      fixesFreigabedatum: istFixesFreigabedatum(aktuell.ausnahme) ||
        istFixesFreigabedatum(aktuell.initial_regel),
      bereitsVorherFrei,
    };
  }
  function vorjahrAnzeige(wert, jahr) {
    if (!wert) return "";
    const individuell = wert.individuelle_freigabe_ab;
    if (datumsJahr(individuell) === Number(jahr)) {
      const freiAbOriginal = originalesFreiAb(wert);
      return freiAbOriginal ? datumKurz(freiAbOriginal) : String(jahr);
    }
    if ((wert.letzte_erlegung || wert.initial_regel || wert.ausnahme) &&
        datumsJahr(wert.endgueltige_freigabe_ab) === Number(jahr)) return String(jahr);
    if (datumsJahr(wert.letzte_erlegung) === Number(jahr)) return datumKurz(wert.letzte_erlegung);
    return "";
  }
  function hirschKlasse(name) {
    return basis?.klassen.find((klasse) => norm(klasse.bezeichnung) === norm(name));
  }
  function freigabeFinden(jahr, jaegerId, wildklasseId) {
    return (jahresdaten.get(Number(jahr)) || []).find((wert) =>
      String(wert.jaeger.id) === String(jaegerId) &&
      String(wert.wildklasse.id) === String(wildklasseId));
  }
  function ausgewaehlteJaeger() {
    return (basis?.jaeger || []).filter((jaeger) =>
      !el("fgJaeger").value || String(jaeger.id) === el("fgJaeger").value);
  }
  function jaegerAlphabetisch(a, b) {
    return String(a.nachname || "").localeCompare(String(b.nachname || ""), "de") ||
      String(a.vorname || "").localeCompare(String(b.vorname || ""), "de") ||
      Number(a.personen_nr || a.nr || 0) - Number(b.personen_nr || b.nr || 0);
  }
  function freigabeSortierdaten(plan) {
    const regulaer = Number(plan?.regulaeresFreigabeJahr) || null;
    const endgueltig = Number(plan?.tatsaechlichesFreigabeJahr) || null;
    const individuelleRegel = plan?.zielWert?.ausnahme || null;
    const freiAb = originalesFreiAb(plan?.zielWert);
    const hatRegulaeresAbweichendesJahr=Boolean(plan?.individuelleAbweichung||
      (individuelleRegel&&regulaer&&endgueltig&&regulaer!==endgueltig));
    return {
      regulaer,
      endgueltig,
      individuelleRegel,
      freiAb,
      gruppe: freiAb ? 2 : hatRegulaeresAbweichendesJahr ? 1 : 0,
    };
  }
  function sortiereHirschGruppe(zeilen) {
    return [...zeilen].sort((a,b)=>
      String(a.nachname||"").localeCompare(String(b.nachname||""),"de")||
      String(a.vorname||"").localeCompare(String(b.vorname||""),"de")||
      Number(a.personenNr||0)-Number(b.personenNr||0));
  }
  function baueFinaleHirschZeilen(zeilen) {
    const jahresgruppen=new Map();
    zeilen.forEach((zeile)=>{
      const jahr=Number(zeile.endgueltigesFreigabejahr);
      if(!jahresgruppen.has(jahr))jahresgruppen.set(jahr,[[],[],[]]);
      const gruppe=Math.min(2,Math.max(0,Number(zeile.gruppe)||0));
      jahresgruppen.get(jahr)[gruppe].push(zeile);
    });
    return [...jahresgruppen.keys()].sort((a,b)=>a-b).flatMap((jahr)=>{
      const gruppen=jahresgruppen.get(jahr);
      return [0,1,2].flatMap((gruppe)=>sortiereHirschGruppe(gruppen[gruppe]));
    });
  }
  function erstelleHirschZeile(jaeger, klasse, jahre, zentralesJahr) {
    const plan = matrixPlan(jaeger.id, klasse.id, jahre, zentralesJahr);
    const sortierung = freigabeSortierdaten(plan);
    return {
      jaegerId:jaeger.id,
      personenNr:jaeger.personen_nr??jaeger.nr??0,
      nachname:jaeger.nachname||"",
      vorname:jaeger.vorname||"",
      regulaeresFreigabejahr:sortierung.regulaer,
      endgueltigesFreigabejahr:sortierung.endgueltig,
      freiAb:sortierung.freiAb,
      individuelleRegel:sortierung.individuelleRegel,
      sortJahr:sortierung.endgueltig,
      sortGruppe:sortierung.gruppe,
      gruppe:sortierung.gruppe,
      jaeger,plan,sortierung,
    };
  }
  function hirscheRendern() {
    const jahre = matrixJahre();
    const zentralesJahr = Number(el("fgJahr").value);
    el("fgHirschJahr").textContent = `Hirschfreigaben ${zentralesJahr}`;
    const container = el("fgHirschMatrizen"); container.innerHTML = "";
    ["Hirsch A", "Hirsch B"].forEach((name) => {
      const klasse = hirschKlasse(name);
      if (!klasse) return;
      if (el("fgWildklasse").value && String(el("fgWildklasse").value) !== String(klasse.id)) return;
      const section = document.createElement("section"); section.className = "hirsch-matrix-section";
      const titel = document.createElement("h3"); titel.textContent = name;
      const scroll = document.createElement("div"); scroll.className = "hirsch-matrix-scroll";
      const table = document.createElement("table"); table.className = "hirsch-matrix";
      const thead = document.createElement("thead"); const kopf = document.createElement("tr");
      ["Nr.", "Nachname", "Vorname", ...jahre].forEach((wert, index) => {
        const th = document.createElement("th");
        if (index < 3) th.textContent = wert;
        else {
          const jahr = Number(wert);
          const rolle = jahr === zentralesJahr - 1 ? "Vorjahr"
            : jahr === zentralesJahr ? "Aktuell" : "Folgejahr";
          const label = document.createElement("small"); label.textContent = rolle;
          const jahreszahl = document.createElement("strong"); jahreszahl.textContent = jahr;
          th.classList.add("hirsch-jahreskopf"); th.append(label, jahreszahl);
        }
        if (index < 3) th.className = `hirsch-sticky hirsch-sticky-${index + 1}`;
        kopf.append(th);
      });
      thead.append(kopf); const tbody = document.createElement("tbody");
      const jaegerPlaene = ausgewaehlteJaeger().map((jaeger) => {
        const zeile = erstelleHirschZeile(jaeger, klasse, jahre, zentralesJahr);
        const { plan, sortierung } = zeile;
        console.debug("[HIRSCHE SORT DEBUG]", {
          Jaeger: `${jaeger.vorname || ""} ${jaeger.nachname || ""}`.trim(),
          regulaeresFreigabejahr: sortierung.regulaer,
          endgueltigesFreigabejahr: sortierung.endgueltig,
          "individuelle Regel": sortierung.individuelleRegel?.regel_typ || null,
          frei_ab: sortierung.freiAb,
          freigabegruppe: sortierung.gruppe,
          darstellungsart: plan.darstellungsart,
        });
        console.debug("[HIRSCH DEBUG 4 - MATRIX ROW]", {
          jaeger:`${jaeger.vorname||""} ${jaeger.nachname||""}`.trim(),
          regulaeresFreigabejahr:sortierung.regulaer,endgueltigesFreigabejahr:sortierung.endgueltig,
          individuelleRegel:sortierung.individuelleRegel?.regel_typ||null,
          individuellesFreiAbOriginal:sortierung.freiAb,
          effektivesFreigabedatum:plan.zielWert?.individuelle_freigabe_ab||null,
          kahlwildOffen:Number(plan.zielWert?.kahlwild?.offen||0),
        });
        console.debug("[HIRSCHE FINAL DEBUG]", {
          Jaeger:`${jaeger.vorname||""} ${jaeger.nachname||""}`.trim(),
          regulaer:sortierung.regulaer,endgueltig:sortierung.endgueltig,frei_ab:sortierung.freiAb,
          Regel:sortierung.individuelleRegel?.regel_typ||null,Freigabegruppe:sortierung.gruppe,
          Status:plan.zielWert?.status||null,Darstellungsart:plan.darstellungsart,
        });
        return zeile;
      });
      let finalRows;
      if (nachJahrenSortieren) {
        const debugZeilen = (zeilen, mitRang=false) => zeilen.map((zeile,index) => ({
          ...(mitRang?{Rang:index+1}:{}),Name:`${zeile.nachname} ${zeile.vorname}`.trim(),
          regulaeresJahr:zeile.regulaeresFreigabejahr,endgueltigesJahr:zeile.endgueltigesFreigabejahr,
          freiAb:zeile.freiAb,Regel:zeile.individuelleRegel?.regel_typ||null,
          sortJahr:zeile.sortJahr,sortGruppe:zeile.sortGruppe,
        }));
        console.debug("[HIRSCH SORT INPUT]");
        console.table(debugZeilen(jaegerPlaene));
        finalRows=baueFinaleHirschZeilen(jaegerPlaene);
        console.debug("[HIRSCH SORT RESULT]");
        console.table(finalRows.slice(0,20).map((r,index)=>({
          position:index+1,name:`${r.nachname} ${r.vorname}`.trim(),jahr:r.endgueltigesFreigabejahr,
          gruppe:r.gruppe,regulaer:r.regulaeresFreigabejahr,freiAb:r.freiAb,
          regel:r.individuelleRegel?.regel_typ||null,
        })));
        console.debug("[HIRSCHE VISIBLE SORT]");
        console.table(finalRows.map((r)=>({
          Name:`${r.nachname} ${r.vorname}`.trim(),sortYear:r.sortJahr,sortGroup:r.sortGruppe,
          freiAb:r.freiAb,regulaer:r.regulaeresFreigabejahr,
        })));
        finalRows.forEach(({ jaeger, sortierung, sortJahr, sortGruppe }) =>
          console.debug("[HIRSCH SORT FINAL]", {
            Jaeger:`${jaeger.vorname||""} ${jaeger.nachname||""}`.trim(),
            "regulaeres Jahr":sortierung.regulaer,
            "endgueltiges Jahr":sortierung.endgueltig,
            sortJahr,
            frei_ab:sortierung.freiAb,
            Regel:sortierung.individuelleRegel?.regel_typ||null,
            sortGruppe,
          }));
        console.debug("[HIRSCHE SORT RESULT]", finalRows.map(({ jaeger, sortierung }, index) =>
          `${index + 1}. ${jaeger.nachname || ""} ${jaeger.vorname || ""} | Jahr ${sortierung.endgueltig ?? "â€“"} | Gruppe ${sortierung.gruppe} | regulÃ¤r ${sortierung.regulaer ?? "â€“"} | endgÃ¼ltig ${sortierung.endgueltig ?? "â€“"} | frei_ab ${sortierung.freiAb ?? "null"}`));
      } else {
        finalRows=[...jaegerPlaene].sort((a,b)=>jaegerAlphabetisch(a.jaeger,b.jaeger));
      }
      finalRows.forEach(({ jaeger, plan }) => {
        const imFilterjahr = plan.werte.get(zentralesJahr);
        if (el("fgStatus").value && imFilterjahr) {
          const status = plan.zielJahr <= zentralesJahr && ["frei", "sonder"].includes(plan.zielZustand)
            ? "FREI" : "NICHT FREI";
          if (status !== el("fgStatus").value) return;
        }
        const tr = document.createElement("tr");
        [jaeger.personen_nr ?? jaeger.nr ?? "–", jaeger.nachname || "", jaeger.vorname || ""].forEach((wert, index) => {
          const td = document.createElement("td"); td.textContent = wert; td.className = `hirsch-sticky hirsch-sticky-${index + 1}`; tr.append(td);
        });
        jahre.forEach((jahr) => {
          const wert = plan.werte.get(jahr);
          const td = document.createElement("td"); td.className = "hirsch-jahreszelle nicht-frei";
          if (wert) {
            const istVorjahr = jahr === zentralesJahr - 1;
            const istZieljahr = jahr === plan.zielJahr;
            const zustand = istZieljahr ? plan.zielZustand : istVorjahr ? "historisch" : "nicht-frei";
            const grund = istZieljahr && plan.bereitsVorherFrei
              ? (plan.zielZustand === "kahlwild"
                ? `Kahlwildpflicht nicht erfüllt (frei seit ${plan.tatsaechlichesFreigabeJahr})`
                : `Frei seit ${plan.tatsaechlichesFreigabeJahr}`)
              : istVorjahr
              ? (vorjahrAnzeige(wert, jahr) ? matrixGrund(wert, matrixZustand(wert, jahr)) : "Keine relevante Freigabe im Vorjahr")
              : istZieljahr ? matrixGrund(plan.zielWert || wert, zustand) : "Nicht das nächste Freigabejahr";
            const zeigtRegulaeresJahr = istZieljahr && plan.individuelleAbweichung &&
              Number.isInteger(Number(plan.regulaeresFreigabeJahr)) && Number(plan.regulaeresFreigabeJahr) > 0;
            const zielWert = plan.zielWert || wert;
            const zielRegel = zielWert.ausnahme;
            const freiAbOriginal = istZieljahr ? originalesFreiAb(zielWert) : null;
            const regelBezeichnung = zielRegel
              ? (AbschussregelnService.REGELTYPEN.find(([typ]) => typ === zielRegel.regel_typ)?.[1] || zielRegel.regel_typ)
              : null;
            const tooltipGrund = zeigtRegulaeresJahr
              ? [grund,
                  `Tatsächliche Freigabe: ${plan.tatsaechlichesFreigabeJahr}`,
                  `Reguläre Freigabe: ${plan.regulaeresFreigabeJahr}`,
                  regelBezeichnung ? `Regel: ${regelBezeichnung}` : null,
                  `Frei ab: ${datumVoll(freiAbOriginal || zielWert.individuelle_freigabe_ab)}`,
                  zielRegel?.bemerkung ? `Bemerkung: ${zielRegel.bemerkung}` : null]
                .filter(Boolean).join("\n")
              : grund;
            td.className = `hirsch-jahreszelle ${zustand}`;
            const zellentext = istZieljahr && plan.bereitsVorherFrei ? `seit ${plan.tatsaechlichesFreigabeJahr}`
              : istVorjahr ? vorjahrAnzeige(wert, jahr)
              : freiAbOriginal ? `ab ${datumKurz(freiAbOriginal)}`
              : zustand === "nicht-frei" ? "" : String(jahr);
            td.textContent = zellentext;
            if (zeigtRegulaeresJahr) {
              const regulaer = document.createElement("small");
              regulaer.className = "hirsch-regulaeres-jahr";
              regulaer.textContent = `reg. ${plan.regulaeresFreigabeJahr}`;
              td.append(regulaer);
            }
            if (istZieljahr) console.debug("[HIRSCH DEBUG 5 - CELL]", {
              Jaeger:`${jaeger.vorname||""} ${jaeger.nachname||""}`.trim(),Matrixjahr:jahr,
              regulaer:plan.regulaeresFreigabeJahr,endgueltig:plan.tatsaechlichesFreigabeJahr,
              Regel:zielRegel?.regel_typ||null,frei_ab_original:freiAbOriginal,
              kahlwildOffen:Number(zielWert.kahlwild?.offen||0),Darstellungsart:plan.darstellungsart,
              Text:zellentext,Farbe:zustand,
            });
            if (istZieljahr) console.debug("[HIRSCHE CELL DEBUG]", {
              Jaeger:`${jaeger.vorname||""} ${jaeger.nachname||""}`.trim(),Jahr:jahr,
              frei_ab:freiAbOriginal,heute:heutigesDatumIso(),Darstellung:plan.darstellungsart,
              Farbe:zustand==="sonder"?"ORANGE":zustand==="kahlwild"?"ROT":zustand==="frei"?"GRUEN":"GRAU",
              Text:`${zellentext}${zeigtRegulaeresJahr?` / reg. ${plan.regulaeresFreigabeJahr}`:""}`,
            });
            td.title = tooltipGrund; td.tabIndex = 0; td.setAttribute("role", "button");
            td.setAttribute("aria-label", `${jaeger.vorname} ${jaeger.nachname}, ${name}, ${jahr}: ${tooltipGrund}`);
            td.addEventListener("click", () => hirschDetailOeffnen(istZieljahr ? (plan.zielWert || wert) : wert, jahr, name, zustand, tooltipGrund));
            td.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); td.click(); } });
          }
          tr.append(td);
        });
        tbody.append(tr);
      });
      table.append(thead, tbody); scroll.append(table); section.append(titel, scroll); container.append(section);
    });
    if (!container.children.length) container.innerHTML = '<p class="freigabe-empty">Keine Hirschfreigaben für diese Filter.</p>';
  }
  function hirschDetailOeffnen(wert, jahr, name, zustand, grundText = null) {
    el("fgHirschDetailTitel").textContent = `${wert.jaeger.vorname} ${wert.jaeger.nachname} – ${name} – ${jahr}`;
    const ausnahme = wert.ausnahme;
    const details = [
      ["Status", zustand === "historisch" ? "Historische Information" : zustand === "sonder" ? "Sonderfreigabe" : zustand === "kahlwild" ? "Kahlwildpflicht offen" : zustand === "frei" ? "Frei" : "Nicht frei"],
      ["Freigabejahr", ausnahme?.freigabejahr || wert.freigabejahr || "–"],
      ["Tatsächliche Freigabe", wert.endgueltiges_freigabejahr || wert.freigabejahr || "–"],
      ["Reguläre Freigabe", wert.regulaeres_freigabejahr || datumsJahr(wert.normale_freigabe_ab) || "–"],
      ["Frei ab", datumVoll(ausnahme?.frei_ab)],
      ["Zeitliche Freigabe", wert.zeitliche_freigabe_ab || wert.endgueltige_freigabe_ab || "–"],
      ["Normale Freigabe", wert.normale_freigabe_ab || "–"],
      ["Kahlwildpflicht", `${Number(wert.kahlwild?.erforderlich || 0)} erforderlich`],
      ["Kahlwildpflicht Jahr", wert.kahlwild?.jahr || jahr],
      ["Neue Pflicht im Jahr", Number(wert.kahlwild?.pflicht || 0)],
      ["Übertrag aus Vorjahren", Number(wert.kahlwild?.uebertrag || 0)],
      ["Kahlwildabschüsse im Jahr", Number(wert.kahlwild?.kahlwild_abschuesse || 0)],
      ["Kahlwild erfüllt", Number(wert.kahlwild?.erlegt || 0)],
      ["Kahlwild offen", Number(wert.kahlwild?.offen || 0)],
      ["Regel", ausnahme ? (AbschussregelnService.REGELTYPEN.find(([typ]) => typ === ausnahme.regel_typ)?.[1] || ausnahme.regel_typ) : wert.initial_regel ? "Initial" : "–"],
      ["Allgemeine Regel", wert.allgemeine_regel?.bezeichnung || "–"],
      ["Bemerkung", ausnahme?.bemerkung || wert.initial_regel?.bemerkung || "–"],
      ["Grund", grundText || matrixGrund(wert, zustand)],
      ["Hinweis", wert.regel_hinweis || "–"],
    ];
    const dl = el("fgHirschDetailInhalt"); dl.innerHTML = "";
    details.forEach(([label, inhalt]) => { const dt = document.createElement("dt"); const dd = document.createElement("dd"); dt.textContent = label; dd.textContent = inhalt; dl.append(dt, dd); });
    const modal = el("fgHirschDetail"); modal.style.display = "block"; modal.setAttribute("aria-hidden", "false"); el("fgHirschDetailOk").focus();
  }
  function hirschDetailSchliessen() { const modal = el("fgHirschDetail"); modal.style.display = "none"; modal.setAttribute("aria-hidden", "true"); }

  function sammelansichtRendern(gefiltert) {
    el("fgEinzelansicht").hidden = true; el("fgSammelansicht").hidden = false;
    const body = el("fgBody"); body.innerHTML = "";
    gefiltert.forEach((wert) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td data-label="Jäger">${esc(`${wert.jaeger.vorname} ${wert.jaeger.nachname}`)}</td>` +
        `<td data-label="Wildklasse">${esc(wert.wildklasse.bezeichnung)}</td>${statusZellen(wert)}`;
      body.append(tr);
    });
    if (!gefiltert.length) body.innerHTML = '<tr><td colspan="6">Keine Freigaben für diese Filter.</td></tr>';
  }

  const norm = (wert) => String(wert || "").trim().toLocaleLowerCase("de");
  function anzeigeKlasse(wert) {
    const gruppe = norm(wert.wildklasse.wildgruppe_bezeichnung);
    const klasse = norm(wert.wildklasse.bezeichnung);
    if (gruppe === "rotwild" && ["kalb männlich", "kalb weiblich"].includes(klasse)) return "Kalb";
    return wert.wildklasse.bezeichnung;
  }
  function ansichtszeilen(gruppe, werte) {
    const gruppiert = new Map();
    werte.forEach((wert) => {
      const name = anzeigeKlasse(wert);
      if (!gruppiert.has(name)) gruppiert.set(name, []);
      gruppiert.get(name).push(wert);
    });
    return [...gruppiert.entries()].map(([name, eintraege]) => {
      if (eintraege.length === 1) return { ...eintraege[0], anzeige_name: name };
      const erlegungen = eintraege.map((wert) => wert.letzte_erlegung).filter(Boolean).sort();
      const freiDaten = eintraege.map((wert) => wert.frei_ab).filter(Boolean).sort();
      const freigabejahre = eintraege.map((wert) => Number(wert.freigabejahr)).filter(Number.isInteger).sort((a, b) => a - b);
      const normaleDaten = eintraege.map((wert) => wert.normale_freigabe_ab).filter(Boolean).sort();
      const individuelleDaten = eintraege.map((wert) => wert.individuelle_freigabe_ab).filter(Boolean).sort();
      const letzteErlegung = erlegungen[erlegungen.length - 1] || null;
      const freiAb = freiDaten[freiDaten.length - 1] || null;
      const nichtFrei = eintraege.find((wert) => wert.status === "NICHT FREI");
      const gruende = [...new Set(eintraege.map((wert) => wert.grund).filter(Boolean))];
      return {
        ...eintraege[0], anzeige_name: name, letzte_erlegung: letzteErlegung, frei_ab: freiAb,
        freigabejahr: freigabejahre[freigabejahre.length - 1] || null,
        normale_freigabe_ab: normaleDaten[normaleDaten.length - 1] || null,
        individuelle_freigabe_ab: individuelleDaten[0] || null,
        endgueltige_freigabe_ab: freiAb,
        status: nichtFrei ? "NICHT FREI" : "FREI", grund: gruende.join(" / "),
      };
    }).sort((a, b) => WildklassenService.vergleicheNachWildgruppeUndWildklasse(a.wildklasse, b.wildklasse));
  }
  function einzelansichtRendern(gefiltert) {
    el("fgSammelansicht").hidden = true; el("fgEinzelansicht").hidden = false;
    const jaeger = gefiltert[0]?.jaeger || basis.jaeger.find((wert) => String(wert.id) === el("fgJaeger").value);
    el("fgEinzelTitel").textContent = jaeger ? `Freigaben – ${jaeger.vorname} ${jaeger.nachname}` : "Freigaben";
    const container = el("fgWildgruppen"); container.innerHTML = "";
    const gruppen = new Map();
    gefiltert.forEach((wert) => {
      const gruppe = wert.wildklasse.wildgruppe_bezeichnung || "Ohne Wildgruppe";
      if (!gruppen.has(gruppe)) gruppen.set(gruppe, []);
      gruppen.get(gruppe).push(wert);
    });
    [...gruppen.entries()].sort((a, b) =>
      WildklassenService.vergleicheNachWildgruppeUndWildklasse(a[1][0]?.wildklasse, b[1][0]?.wildklasse))
      .forEach(([gruppe, werte]) => {
      const section = document.createElement("section"); section.className = "freigabe-wildgruppe";
      const titel = document.createElement("h3"); titel.textContent = gruppe; section.append(titel);
      const wrap = document.createElement("div"); wrap.className = "table-wrap";
      const table = document.createElement("table"); table.className = "ap-table freigabe-einzeltabelle";
      table.innerHTML = "<thead><tr><th>Wildklasse</th><th>Letzte Erlegung</th><th>Frei ab</th><th>Status</th><th>Grund</th></tr></thead><tbody></tbody>";
      const body = table.querySelector("tbody");
      ansichtszeilen(gruppe, werte).forEach((wert) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td data-label="Wildklasse">${esc(wert.anzeige_name)}</td>${statusZellen(wert)}`;
        body.append(tr);
      });
      wrap.append(table); section.append(wrap); container.append(section);
    });
    if (!gefiltert.length) container.innerHTML = '<p class="freigabe-empty">Keine Freigaben für diese Filter.</p>';
  }
  function statusZellen(wert) {
    const anzeigewert = wert.freigabejahr ?? "–";
    if (wert.ausnahme?.freigabejahr && !wert.ausnahme?.frei_ab) {
      console.debug("[FREIGABEN DISPLAY DEBUG]", {
        freigabejahr: wert.freigabejahr,
        frei_ab: wert.ausnahme.frei_ab ?? null,
        effective_free_date: wert.endgueltige_freigabe_ab || wert.frei_ab || null,
        anzeigewert,
      });
    }
    return `<td data-label="Letzte Erlegung">${esc(jahrAnzeigen(wert.letzte_erlegung))}</td>` +
      `<td data-label="Frei ab">${esc(anzeigewert)}</td>` +
      `<td data-label="Status"><strong class="freigabe-status ${wert.status === "FREI" ? "frei" : "nicht-frei"}">${esc(wert.status)}</strong></td>` +
      `<td data-label="Grund" class="freigabe-grund">${esc(wert.grund)}</td>`;
  }

  return { init };
})();
