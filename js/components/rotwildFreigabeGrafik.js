window.RotwildFreigabeGrafik = (() => {
  const SCHRITT = 3;
  const REGEL_STARTJAHR = 2025;
  const KAHLWILD_GUTHABEN_BIS_2024 = 19;
  const MINDEST_KAHLWILD_ANZEIGE = 108;

  const FOLGE = ["Hirsch A", "Hirsch B", "Hirsch B"];

  function istHirschASchwelle(kahlwildstand) {
    return Number(kahlwildstand) >= 21 && Number(kahlwildstand) % 9 === 3;
  }

  function berechnen({ aktuellesKahlwild = 0, kahlwildAbschussJahre = [], erlegteHirschAJahre = [], erlegteHirschBJahre = [], jahr }) {
    const guthaben = KAHLWILD_GUTHABEN_BIS_2024;
    const aktuell = Math.max(0, Number(aktuellesKahlwild) || 0);
    const gesamt = guthaben + aktuell;
    const erreichteStufen = Math.floor(gesamt / SCHRITT);
    const kahlwildJahre = [...kahlwildAbschussJahre].map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    const kahlwildProJahr = [...kahlwildJahre.reduce((jahre, abschussJahr) => {
      jahre.set(abschussJahr, (jahre.get(abschussJahr) || 0) + 1);
      return jahre;
    }, new Map()).entries()].map(([abschussJahr, anzahl]) => ({ jahr: abschussJahr, anzahl }));
    const anzahlStufen = Math.max(MINDEST_KAHLWILD_ANZEIGE / SCHRITT, Math.ceil((gesamt + 18) / SCHRITT));
    const stufen = Array.from({ length: anzahlStufen }, (_, index) => {
      const nummer = index + 1;
      const wildklasse = FOLGE[index % FOLGE.length];
      const erreicht = nummer <= erreichteStufen;
      const bisKahlwild = nummer * SCHRITT;
      const ab2025Benoetigt = bisKahlwild - guthaben;
      const freigabejahr = erreicht
        ? (ab2025Benoetigt <= 0 ? REGEL_STARTJAHR : kahlwildJahre[ab2025Benoetigt - 1] || Number(jahr))
        : null;
      return {
        nummer,
        vonKahlwild: index * SCHRITT + 1,
        bisKahlwild,
        wildklasse,
        status: erreicht ? "erreicht" : "zukuenftig",
        freigabejahr,
        erlegungsjahr: null,
        kahlwild: Array.from({ length: SCHRITT }, (_, offset) => index * SCHRITT + offset + 1),
      };
    });
    const erlegungen = {
      "Hirsch A": [...erlegteHirschAJahre].map(Number).filter(Number.isInteger).sort((a, b) => a - b),
      "Hirsch B": [...erlegteHirschBJahre].map(Number).filter(Number.isInteger).sort((a, b) => a - b),
    };
    FOLGE.slice(0, 2).forEach((wildklasse) => {
      const jahre = erlegungen[wildklasse];
      stufen.filter((stufe) => stufe.status === "erreicht" && stufe.wildklasse === wildklasse).forEach((stufe) => {
        const index = jahre.findIndex((erlegungsjahr) => erlegungsjahr >= stufe.freigabejahr);
        if (index >= 0) stufe.erlegungsjahr = jahre.splice(index, 1)[0];
      });
    });
    const freiA = stufen.filter((stufe) => stufe.status === "erreicht" && stufe.wildklasse === "Hirsch A" && !stufe.erlegungsjahr).length;
    const freiB = stufen.filter((stufe) => stufe.status === "erreicht" && stufe.wildklasse === "Hirsch B" && !stufe.erlegungsjahr).length;
    const naechste = stufen[erreichteStufen] || null;
    const naechsteA = stufen.find((stufe) => stufe.status === "zukuenftig" && stufe.wildklasse === "Hirsch A") || null;
    const naechsteB = stufen.find((stufe) => stufe.status === "zukuenftig" && stufe.wildklasse === "Hirsch B") || null;
    return { jahr: Number(jahr), guthaben, aktuell, gesamt, kahlwildProJahr, erreichteStufen, freiA, freiB, erlegtA: erlegteHirschAJahre.length, erlegtB: erlegteHirschBJahre.length, restBisNaechsteFreigabe: naechste ? naechste.bisKahlwild - gesamt : 0, naechste, naechsteA, naechsteB, stufen };
  }

  function wertKarte(label, wert, klasse = "", zusatz = "") {
    const element = document.createElement("div");
    element.className = `rotwild-statistik-karte ${klasse}`.trim();
    const beschriftung = document.createElement("span");
    const zahl = document.createElement("strong");
    beschriftung.textContent = label;
    zahl.textContent = wert;
    element.append(beschriftung, zahl);
    if (zusatz) {
      const detail = document.createElement("small");
      detail.textContent = zusatz;
      element.appendChild(detail);
    }
    return element;
  }

  function statistikReihe(titelText, klasse) {
    const bereich = document.createElement("section");
    bereich.className = `rotwild-statistik-bereich ${klasse}`;
    const titel = document.createElement("h4");
    titel.textContent = titelText;
    const karten = document.createElement("div");
    karten.className = "rotwild-statistik-reihe";
    bereich.append(titel, karten);
    return { bereich, karten };
  }

  function freigabeKarte(wildklasse, stufe, aktuellerStand, klasse) {
    const karte = wertKarte(
      "Nächste Freigabe",
      wildklasse,
      `naechste-freigabe ${klasse}`,
      stufe ? `bei ${stufe.bisKahlwild} Stk. Kahlwild` : "–",
    );
    if (stufe) {
      const rest = document.createElement("div");
      rest.className = "rotwild-statistik-rest";
      const label = document.createElement("span");
      const wert = document.createElement("strong");
      label.textContent = "Noch benötigt";
      wert.textContent = `${stufe.bisKahlwild - aktuellerStand} Stk.`;
      rest.append(label, wert);
      karte.appendChild(rest);
    }
    return karte;
  }

  function render(container, daten) {
    container.replaceChildren();
    container.className = "rotwild-freigabe";
    const titel = document.createElement("h3");
    titel.textContent = "Abschussfreigabe Rotwild";
    container.appendChild(titel);

    if (Number(daten.jahr) < REGEL_STARTJAHR) {
      return;
    }

    const ergebnis = berechnen(daten);
    const legende = document.createElement("div");
    legende.className = "rotwild-freigabe-legende";
    legende.innerHTML = '<span><i class="hirsch-a"></i>Hirsch A frei</span><span><i class="hirsch-b"></i>Hirsch B frei</span><span><i class="hirsch-a-erlegt"></i>Hirsch A erlegt</span><span><i class="hirsch-b-erlegt"></i>Hirsch B erlegt</span><span><i class="zukuenftig"></i>Noch nicht frei</span><span><i class="kahlwild-erreicht"></i>Kahlwildstand erreicht</span><span><i class="kahlwild-offen"></i>Noch nicht erreicht</span>';
    container.appendChild(legende);

    const scroll = document.createElement("div");
    scroll.className = "rotwild-freigabe-scroll";
    const strecke = document.createElement("div");
    strecke.className = "rotwild-freigabe-strecke";
    ergebnis.stufen.forEach((stufe) => {
      const block = document.createElement("div");
      block.className = `rotwild-freigabe-stufe ${stufe.status} ${stufe.wildklasse === "Hirsch A" ? "hirsch-a" : "hirsch-b"}`;
      if (stufe.erlegungsjahr) block.classList.add("ist-erlegt");
      const kahlwild = document.createElement("div");
      kahlwild.className = "rotwild-freigabe-kahlwild";
      stufe.kahlwild.forEach((nummer) => {
        const kreis = document.createElement("span");
        kreis.textContent = nummer;
        if (nummer <= ergebnis.gesamt) kreis.classList.add("erreicht");
        if (nummer === ergebnis.gesamt) {
          kreis.classList.add("ist-aktuell");
          const marker = document.createElement("em");
          marker.textContent = "Aktueller Stand";
          kreis.appendChild(marker);
        }
        kahlwild.appendChild(kreis);
      });
      const hirsch = document.createElement("div");
      hirsch.className = "rotwild-freigabe-hirsch";
      const klasse = document.createElement("strong");
      klasse.textContent = stufe.wildklasse === "Hirsch A" ? "A" : "B";
      const status = document.createElement("small");
      status.textContent = stufe.erlegungsjahr || stufe.freigabejahr || "";
      hirsch.title = stufe.status !== "erreicht" ? `${stufe.wildklasse}: noch nicht frei` : `${stufe.wildklasse}\nfreigegeben: ${stufe.freigabejahr}\n${stufe.erlegungsjahr ? `erlegt: ${stufe.erlegungsjahr}` : "noch nicht erlegt"}`;
      hirsch.append(klasse, status);
      block.append(kahlwild, hirsch);
      strecke.appendChild(block);
    });
    scroll.appendChild(strecke);
    container.appendChild(scroll);

    const status = document.createElement("div");
    status.className = "rotwild-freigabe-status";
    const kahlwild = statistikReihe("Kahlwild", "kahlwild");
    kahlwild.karten.appendChild(wertKarte("Kahlwildguthaben bis 2024", `${ergebnis.guthaben} Stk.`, "kahlwild"));
    ergebnis.kahlwildProJahr.forEach((jahreswert) => {
      kahlwild.karten.appendChild(wertKarte(`Kahlwildabschüsse ${jahreswert.jahr}`, `${jahreswert.anzahl} Stk.`, "kahlwild"));
    });
    kahlwild.karten.appendChild(wertKarte("Kahlwildstand aktuell", `${ergebnis.gesamt} Stk.`, "kahlwild-stand"));

    const hirsche = document.createElement("section");
    hirsche.className = "rotwild-statistik-bereich hirsche";
    const freiKarte = document.createElement("div");
    freiKarte.className = "rotwild-statistik-karte hirsche-frei";
    const freiTitel = document.createElement("span");
    freiTitel.textContent = "HIRSCHE FREI";
    const freieWerte = document.createElement("div");
    freieWerte.className = "rotwild-statistik-frei-werte";
    freieWerte.innerHTML = `<div><span>Hirsch A</span><strong>${ergebnis.freiA} Stk.</strong></div><div><span>Hirsch B</span><strong>${ergebnis.freiB} Stk.</strong></div>`;
    freiKarte.append(freiTitel, freieWerte);

    const naechsteReihe = document.createElement("div");
    naechsteReihe.className = "rotwild-statistik-naechste";
    naechsteReihe.append(
      freigabeKarte("Hirsch B", ergebnis.naechsteB, ergebnis.gesamt, "hirsch-b"),
      freigabeKarte("Hirsch A", ergebnis.naechsteA, ergebnis.gesamt, "hirsch-a"),
    );
    hirsche.append(freiKarte, naechsteReihe);
    status.append(kahlwild.bereich, hirsche);
    container.appendChild(status);
  }

  // Gemeinsame zeitliche Ableitung für Grafik und Kalenderverlauf.
  // Das feste 2025-Startguthaben und die A-B-B-Folge liegen damit an einer Stelle.
  function hirschAFreigabeverlauf(jahr, freigabeEreignisse = []) {
    if (Number(jahr) < REGEL_STARTJAHR) return { status: new Map(), freieA: 0 };
    const start = `${REGEL_STARTJAHR}-05-01`, kalenderStart = `${jahr}-05-01`, jahresEnde = `${jahr}-12-31`;
    const alle = [...freigabeEreignisse]
      .filter((ereignis) => String(ereignis.datum || "") >= start && String(ereignis.datum || "") <= jahresEnde)
      .sort((a, b) => String(a.datum).localeCompare(String(b.datum)) || Number(a.nr || 0) - Number(b.nr || 0));
    const nachDatum = new Map();
    alle.forEach((ereignis) => { const liste = nachDatum.get(ereignis.datum) || []; liste.push(ereignis); nachDatum.set(ereignis.datum, liste); });
    let kahlwild = KAHLWILD_GUTHABEN_BIS_2024, freieA = 2, neueAFreigaben = 0, neueAFreigabenImJahr = 0;
    const verarbeiten = (liste) => {
      let letzteAktion = null, freigaben = 0, erlegungen = 0;
      (liste || []).forEach((ereignis) => {
        if (ereignis.typ === "KAHLWILD") {
          kahlwild += 1;
          if (istHirschASchwelle(kahlwild)) { freieA += 1; neueAFreigaben += 1; freigaben += 1; letzteAktion = "frei"; }
        } else if (ereignis.typ === "HIRSCH_A") {
          freieA = Math.max(0, freieA - 1);
          erlegungen += 1; letzteAktion = "erlegt";
        }
      });
      return letzteAktion ? { art: letzteAktion, anzahl: letzteAktion === "frei" ? freigaben : erlegungen, freigaben, erlegungen } : null;
    };
    const vorjahresEnde = `${jahr}-01-01`;
    alle.filter((ereignis) => String(ereignis.datum) < vorjahresEnde).forEach((ereignis) => verarbeiten([ereignis]));
    const endeVorjahrKahlwild = kahlwild, endeVorjahrFreieA = freieA;
    alle.filter((ereignis) => String(ereignis.datum) >= vorjahresEnde && String(ereignis.datum) < kalenderStart).forEach((ereignis) => verarbeiten([ereignis]));
    const startKahlwild = kahlwild, startFreieA = freieA;
    const status = new Map();
    for (let monat = 5; monat <= 12; monat += 1) {
      const tage = new Date(Number(jahr), monat, 0).getDate();
      for (let tag = 1; tag <= tage; tag += 1) {
        const datum = `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
        const aktion = verarbeiten(nachDatum.get(datum));
        if (aktion) {
          neueAFreigabenImJahr += aktion.freigaben;
          status.set(datum, aktion);
        }
        else if (freieA === 0) status.set(datum, { art: "offen" });
      }
    }
    return { status, freieA, startAFreigaben: 2, neueAFreigaben, neueAFreigabenImJahr, aFreigabenGesamt: 2 + neueAFreigaben, startKahlwild, startFreieA, endeVorjahrKahlwild, endeVorjahrFreieA };
  }

  return { REGEL_STARTJAHR, KAHLWILD_GUTHABEN_BIS_2024, MINDEST_KAHLWILD_ANZEIGE, berechnen, hirschAFreigabeverlauf, render };
})();
