window.JaegerBericht = (() => {
  const el = (id) => document.getElementById(id);
  const relation = (value) => Array.isArray(value) ? value[0] : value;
  const esc = (value) => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
  const datum = (value) => value ? new Intl.DateTimeFormat("de-AT").format(new Date(`${value}T12:00:00`)) : "–";
  const norm = (value) => String(value || "").trim().toLocaleLowerCase("de");
  let daten = null;
  let jaegerDropdown = null;

  function zeitraumText(){return daten.vonJahr===daten.bisJahr?String(daten.vonJahr):`${daten.vonJahr} – ${daten.bisJahr}`;}

  function kopf(titel, titelImInhaltsbereich = false) {
    if (!titel) return "";
    return `<div class="jb-following-head">${esc(daten.jaeger.vorname)} ${esc(daten.jaeger.nachname)}</div>${titelImInhaltsbereich ? "" : `<h2>${esc(titel)}</h2>`}`;
  }
  function fuss() { return `<footer class="jaegerbericht-foot"><span>Jagdverein St. Peter/Mitterberg</span><span class="jb-page-number"></span><span>Daniel Pontasch</span></footer>`; }
  function seite(titel, html, klasse = "", titelImInhaltsbereich = false) {
    const section = document.createElement("section"); section.className = `jaegerbericht-sheet ${klasse}${daten?.istVerein ? " is-verein" : ""}`;
    section.innerHTML = `${kopf(titel, titelImInhaltsbereich)}<div class="jaegerbericht-content">${html}</div>${fuss()}`;
    return section;
  }
  function fortsetzungsTitel(seiteElement) {
    const titel = seiteElement.querySelector(".jb-report-page-title, :scope > h2")?.textContent?.trim() || "BERICHT";
    return `${titel.replace(/\s*–\s*FORTSETZUNG$/i, "")} – FORTSETZUNG`;
  }
  function folgeSeite(seiteElement) {
    const klasse = [...seiteElement.classList].filter((name) => name !== "jaegerbericht-sheet" && name !== "is-verein").join(" ");
    return seite(fortsetzungsTitel(seiteElement), "", klasse);
  }
  function verfuegbareInhaltshoehe(seiteElement) {
    const inhalt = seiteElement.querySelector(".jaegerbericht-content");
    const fusszeile = seiteElement.querySelector(".a4-report-footer, .jaegerbericht-foot");
    return Math.max(0, fusszeile.offsetTop - inhalt.offsetTop - 10);
  }
  function tabelleAufFolgeseiteVerschieben(seiteElement, folgeseite) {
    const inhalt = seiteElement.querySelector(".jaegerbericht-content");
    const tabelleElement = [...inhalt.querySelectorAll("table")].at(-1);
    const abschnittElement = tabelleElement?.closest(".jb-section");
    if (!tabelleElement || !abschnittElement) return false;
    const folgeInhalt = folgeseite.querySelector(".jaegerbericht-content");
    const ueberschrift = abschnittElement.querySelector(":scope > h3");
    let abschnittKopie = [...folgeInhalt.querySelectorAll(":scope > .jb-section")]
      .find((element) => element.querySelector(":scope > h3")?.textContent === ueberschrift?.textContent);
    if (!abschnittKopie) {
      abschnittKopie = abschnittElement.cloneNode(false);
      if (ueberschrift) abschnittKopie.append(ueberschrift.cloneNode(true));
      const tabellenKopie = tabelleElement.cloneNode(false);
      [...tabelleElement.querySelectorAll(":scope > colgroup, :scope > thead")].forEach((teil) => tabellenKopie.append(teil.cloneNode(true)));
      tabellenKopie.append(document.createElement("tbody")); abschnittKopie.append(tabellenKopie); folgeInhalt.prepend(abschnittKopie);
    }
    const tabellenKopie = abschnittKopie.querySelector("table");
    const zielBody = tabellenKopie.tBodies[0];
    const bodies = [...tabelleElement.tBodies];
    if (bodies.length > 1) {
      const body = bodies.at(-1); zielBody.before(body);
    } else if (bodies[0]?.rows.length > 1) {
      zielBody.prepend(bodies[0].rows[bodies[0].rows.length - 1]);
    } else return false;
    return true;
  }
  function vereinHirscheAufFolgeseiteVerschieben(abschnittElement, folgeseite) {
    const spalten = [...abschnittElement.querySelectorAll(":scope > .jb-report-two-columns > .jb-section")];
    if (!spalten.length) return false;
    const folgeInhalt = folgeseite.querySelector(".jaegerbericht-content");
    let kopie = folgeInhalt.querySelector(":scope > .jb-verein-hirsche");
    const titel = abschnittElement.querySelector(":scope > h3");
    if (!kopie) {
      kopie = abschnittElement.cloneNode(false);
      if (titel) kopie.append(titel.cloneNode(true));
      const spaltenKopie = document.createElement("div"); spaltenKopie.className = "jb-report-two-columns";
      kopie.append(spaltenKopie); folgeInhalt.append(kopie);
    }
    const spaltenKopie = kopie.querySelector(":scope > .jb-report-two-columns");
    let verschoben = false;
    spalten.forEach((spalte) => {
      const tabelleElement = spalte.querySelector("table");
      const body = tabelleElement?.tBodies[0];
      if (!body || body.rows.length < 2) return;
      const spaltenTitel = spalte.querySelector(":scope > h3");
      let spaltenAbschnitt = [...spaltenKopie.children].find((element) => element.querySelector(":scope > h3")?.textContent === spaltenTitel?.textContent);
      if (!spaltenAbschnitt) {
        spaltenAbschnitt = spalte.cloneNode(false);
        if (spaltenTitel) spaltenAbschnitt.append(spaltenTitel.cloneNode(true));
        const tabellenKopie = tabelleElement.cloneNode(false);
        [...tabelleElement.querySelectorAll(":scope > colgroup, :scope > thead")].forEach((teil) => tabellenKopie.append(teil.cloneNode(true)));
        tabellenKopie.append(document.createElement("tbody")); spaltenAbschnitt.append(tabellenKopie); spaltenKopie.append(spaltenAbschnitt);
      }
      spaltenAbschnitt.querySelector("table").tBodies[0].prepend(body.rows[body.rows.length - 1]); verschoben = true;
    });
    if (!verschoben) return false;
    return true;
  }
  function zweiTabellenAufFolgeseiteVerschieben(blockElement, folgeseite) {
    const spalten = [...blockElement.querySelectorAll(":scope > .jb-section")];
    if (!spalten.length) return false;
    const folgeInhalt = folgeseite.querySelector(".jaegerbericht-content");
    let kopie = folgeInhalt.querySelector(":scope > .jb-rehbock-details");
    if (!kopie) { kopie = blockElement.cloneNode(false); folgeInhalt.append(kopie); }
    let verschoben = false;
    spalten.forEach((spalte) => {
      const quelle = spalte.querySelector("table"), body = quelle?.tBodies[0];
      if (!body || body.rows.length < 2) return;
      const titel = spalte.querySelector(":scope > h3");
      let ziel = [...kopie.children].find((element) => element.querySelector(":scope > h3")?.textContent === titel?.textContent);
      if (!ziel) {
        ziel = spalte.cloneNode(false); if (titel) ziel.append(titel.cloneNode(true));
        const tabelleKopie = quelle.cloneNode(false);
        [...quelle.querySelectorAll(":scope > colgroup, :scope > thead")].forEach((teil) => tabelleKopie.append(teil.cloneNode(true)));
        tabelleKopie.append(document.createElement("tbody")); ziel.append(tabelleKopie); kopie.append(ziel);
      }
      ziel.querySelector("table").tBodies[0].prepend(body.rows[body.rows.length - 1]); verschoben = true;
    });
    return verschoben;
  }
  function seitenhoehenSichern(container, rahmenOptionen) {
    for (let index = 0; index < container.children.length; index += 1) {
      const aktuelleSeite = container.children[index]; let sicherung = 0, folgeseite = null;
      while (aktuelleSeite.querySelector(".jaegerbericht-content").scrollHeight > verfuegbareInhaltshoehe(aktuelleSeite) && sicherung < 100) {
        sicherung += 1;
        if (!folgeseite) { folgeseite = folgeSeite(aktuelleSeite); aktuelleSeite.after(folgeseite); A4PageLayout.rahmen(folgeseite, rahmenOptionen); }
        const inhalt = aktuelleSeite.querySelector(".jaegerbericht-content");
        const letzterBlock = inhalt.lastElementChild;
        if (letzterBlock?.classList.contains("jb-verein-hirsche") && vereinHirscheAufFolgeseiteVerschieben(letzterBlock, folgeseite)) {
          // Der Hirschbereich beginnt auf der aktuellen Seite und nur die überzähligen Zeilen folgen direkt.
        } else if (letzterBlock?.classList.contains("jb-rehbock-details") && zweiTabellenAufFolgeseiteVerschieben(letzterBlock, folgeseite)) {
          // Rehbock A und B bleiben kompakt; nur die überzähligen Zeilen gehen auf die Folgeseite.
        } else if (letzterBlock?.classList.contains("jb-section") && letzterBlock.querySelector("table") && tabelleAufFolgeseiteVerschieben(aktuelleSeite, folgeseite)) {
          // Tabellen bleiben auf der begonnenen Seite; nur überzählige Eintragsblöcke folgen direkt.
        } else if (inhalt.children.length > 1) {
          folgeseite.querySelector(".jaegerbericht-content").prepend(inhalt.lastElementChild);
        } else if (!tabelleAufFolgeseiteVerschieben(aktuelleSeite, folgeseite)) break;
      }
    }
  }
  function tabelle(spalten, rows, leertext = "Keine Einträge im Berichtszeitraum.", klasse = "") {
    if (!rows.length) return `<p class="jb-empty">${esc(leertext)}</p>`;
    return `<table class="jb-table ${esc(klasse)}"><thead><tr>${spalten.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((x) => `<td>${x ?? "–"}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  function wildklasse(row) { return relation(row.wildklassen || row.wildklasse)?.bezeichnung || "–"; }
  function wildgruppe(row) { return relation(row.wildgruppen)?.bezeichnung || "–"; }
  function ort(row) { return daten.ortName(row); }
  function abschnitt(titel, inhalt) { return `<section class="jb-section"><h3>${esc(titel)}</h3>${inhalt}</section>`; }
  function fortsetzungsSeiten(seitenTitel, abschnittTitel, spalten, rows, start, chunk = 24, tabelleKlasse = "") {
    const seiten = [];
    for (let index = start; index < rows.length; index += chunk) {
      seiten.push(seite(`${seitenTitel} – FORTSETZUNG`, abschnitt(abschnittTitel,
        tabelle(spalten, rows.slice(index, index + chunk), "Keine Einträge im Berichtszeitraum.", tabelleKlasse))));
    }
    return seiten;
  }

  function wert(value) { return Number(value || 0); }
  function fallwildHinweis(row) { return row.fallwild ? " <span class=\"jb-badge\">Fallwild</span>" : ""; }
  function listeMitAnzahl(werte) {
    return werte.length ? `<ul class="jb-report-list">${werte.map((wert) => `<li><span>${esc(wert.bezeichnung)}</span><b>${wert.anzahl} Stk.</b></li>`).join("")}</ul>` : `<p class="jb-empty">Keine Abschüsse im Berichtszeitraum.</p>`;
  }
  function statistikKarte(titel, wertText, details = "") {
    return `<section class="jb-stat-card"><h3>${esc(titel)}</h3><strong>${esc(wertText)}</strong>${details ? `<p>${details}</p>` : ""}</section>`;
  }
  function jahreswert(value) { return Number(value) > 0 ? Number(value) : "–"; }
  function geschlechtsZeilen(row) {
    const geschlechter = row.klassen.filter((klasse) => /männlich|maennlich|weiblich/i.test(klasse.bezeichnung));
    return geschlechter.length ? listeMitAnzahl(geschlechter) : "";
  }
  function jaehrlicheRotwildwerte(werte) {
    return `<div class="jb-report-year-grid">${werte.map((wert) => { const hatKahlwild = Number(wert.tiere) + Number(wert.kalb) > 0; return `<section class="jb-report-year"><h4>${wert.jahr}</h4><div><strong>Hirsche</strong>${wert.hirsche.length ? wert.hirsche.map((hirsch) => `<span>Hirsch ${hirsch.klasse}: <b>${hirsch.anzahl}</b></span>`).join("") : "<span>–</span>"}</div><div><strong>Kahlwild</strong>${hatKahlwild ? `<span>Tier: <b>${jahreswert(wert.tiere)}</b></span><span>Kalb: <b>${jahreswert(wert.kalb)}</b></span>` : "<span>–</span>"}</div></section>`; }).join("")}</div>`;
  }
  function rotwildSeite() {
    const rotwild = daten.auswertung.rotwild;
    const hirschA = daten.freigaben.find((row) => norm(row.wildklasse?.bezeichnung) === "hirsch a");
    const naechsterHirschA = Number(hirschA?.freigabejahr || hirschA?.regulaeres_freigabejahr);
    const kahlwild = daten.kahlwildStatus;
    const hirschSpalten = daten.istVerein ? ["Datum", "Jäger", "Alter"] : ["Klasse", "Alter", "Datum"];
    const hirschZeile = (row, bBereich = false) => daten.istVerein
      ? [`${bBereich && row.klasse === "Hirsch B1" ? '<b class="jb-hirsch-b1">B1</b> ' : ""}${datum(row.datum)}`, esc(row.jaeger), row.alter == null ? "–" : `${esc(row.alter)} Jahre`]
      : [esc(row.klasse) + fallwildHinweis(row), row.alter == null ? "–" : `${esc(row.alter)} Jahre`, datum(row.datum)];
    const hirschDetails = tabelle(hirschSpalten, rotwild.hirschDetails.slice(0, 14).map((row) => hirschZeile(row)), "Keine Hirsche im Berichtszeitraum.", "jb-date-table");
    const kahlwildDetails = rotwild.kahlwildDetails.length ? `<div class="jb-kahlwild-list">${rotwild.kahlwildDetails.map((row) => `<section><div class="jb-kahlwild-total"><h4>${esc(row.bezeichnung)}</h4><b>${row.anzahl} Stk.</b></div>${geschlechtsZeilen(row)}</section>`).join("")}</div>` : `<p class="jb-empty">Kein Kahlwild im Berichtszeitraum.</p>`;
    return seite("", `
      <h2 class="jb-report-page-title">ROTWILD</h2>
      <div class="jb-stat-grid">${statistikKarte("Abschüsse", `${rotwild.gesamt} Stk.`)}${statistikKarte("Hirsche", `${rotwild.hirsche} Stk.`, rotwild.hirschKlassen.map((wert) => `Hirsch ${wert.klasse}: ${wert.anzahl}`).join(" · "))}${statistikKarte("Kahlwild", `${rotwild.kahlwild} Stk.`, `Tiere: ${rotwild.tiere} · Kalb: ${rotwild.kalb}`)}</div>
      ${daten.istVerein ? `${abschnitt("Kahlwild", kahlwildDetails)}${abschnitt("Rotwild nach Jahr", jaehrlicheRotwildwerte(rotwild.jahre))}${vereinHirsche(rotwild)}${abschnitt("Kahlwild pro Jäger", tabelle(["Jäger", "Kahlwild", "Hirsche"], daten.nachJaeger.rotwild.map((row) => [esc(row.jaeger), esc(`${row.kahlwild} Stk.`), esc(`${row.hirsche} Stk.`)])))}` : `<div class="jb-report-two-columns">${abschnitt("Hirsche", hirschDetails)}${abschnitt("Kahlwild", kahlwildDetails)}</div>${abschnitt("Rotwild nach Jahr", jaehrlicheRotwildwerte(rotwild.jahre))}`}
      ${daten.istVerein ? "" : `<div class="jb-status-grid">${Number.isFinite(naechsterHirschA) ? `<section class="jb-highlight"><h3>NÄCHSTER HIRSCH A FREI</h3><b>${naechsterHirschA}</b></section>` : ""}${wert(kahlwild?.offen) > 0 ? `<section class="jb-highlight"><h3>KAHLWILDPFLICHT</h3><dl><dt>Pflicht</dt><dd>${wert(kahlwild.pflicht) + wert(kahlwild.uebertrag)} Stk.</dd><dt>Erlegt/angerechnet</dt><dd>${wert(kahlwild.angerechnet)} Stk.</dd><dt>Noch offen</dt><dd class="offen">${wert(kahlwild.offen)} Stk.</dd></dl></section>` : ""}</div>`}
    `, "jb-wildseite jb-rotwild-seite");
  }
  function vereinHirsche(rotwild, start = 0, titel = "HIRSCHE") {
    const hirschA = rotwild.hirschDetails.filter((row) => row.klasse === "Hirsch A");
    const hirschB = rotwild.hirschDetails.filter((row) => row.klasse === "Hirsch B" || row.klasse === "Hirsch B1");
    const zeilen = (werte, bBereich) => tabelle(["Datum", "Jäger", "Alter"], werte.slice(start, start + 14).map((row) => [
      `${bBereich && row.klasse === "Hirsch B1" ? '<b class="jb-hirsch-b1">B1</b> ' : ""}${datum(row.datum)}`,
      esc(row.jaeger), row.alter == null ? "–" : `${esc(row.alter)} Jahre`,
    ]), "Keine Hirsche im Berichtszeitraum.", "jb-date-table");
    return `<section class="jb-section jb-verein-hirsche"><h3>${titel}</h3><div class="jb-report-two-columns">${abschnitt("Hirsch A", zeilen(hirschA, false))}${abschnitt("Hirsch B", zeilen(hirschB, true))}</div></section>`;
  }
  function rehwildJahre(werte) {
    return `<div class="jb-report-year-grid jb-report-year-grid-three">${werte.map((wert) => `<section class="jb-report-year"><h4>${wert.jahr}</h4><div class="jb-rehwild-year-boecke"><strong>Rehböcke</strong><span>A: <b>${jahreswert(wert.rehbockA)}</b></span><span>B: <b>${jahreswert(wert.rehbockB)}</b></span></div><div class="jb-rehwild-year-line"><strong>Rehgeiß</strong><b>${jahreswert(wert.rehgeiss)}</b></div><div class="jb-rehwild-year-line"><strong>Rehkitz</strong><b>${jahreswert(wert.rehkitz)}</b></div></section>`).join("")}</div>`;
  }
  function rehwildSeite() {
    const rehwild = daten.auswertung.rehwild;
    const bockA = tabelle(daten.istVerein ? ["Datum", "Jäger", "Alter"] : ["Bock A", "Alter", "Datum"], rehwild.rehbockADetails.map((row) => daten.istVerein ? [datum(row.datum), esc(row.jaeger), row.alter == null ? "–" : `${esc(row.alter)} Jahre`] : [esc(row.klasse) + fallwildHinweis(row), row.alter == null ? "–" : `${esc(row.alter)} Jahre`, datum(row.datum)]), "Keine Rehböcke im Berichtszeitraum.", "jb-date-table");
    const bockB = tabelle(daten.istVerein ? ["Datum", "Jäger", "Alter"] : ["Bock B", "Datum"], rehwild.rehbockBDetails.map((row) => daten.istVerein ? [datum(row.datum), esc(row.jaeger), row.alter == null ? "–" : `${esc(row.alter)} Jahre`] : [esc(row.klasse) + fallwildHinweis(row), datum(row.datum)]), "Keine Rehböcke im Berichtszeitraum.", "jb-date-table");
    return seite("REHWILD", `
      <div class="jb-report-profile"><strong>${esc(daten.jaeger.vorname)} ${esc(daten.jaeger.nachname)}</strong><span>Berichtszeitraum: ${esc(zeitraumText())}</span></div>
      <h2 class="jb-report-page-title">REHWILD</h2>
      <div class="jb-stat-grid">${statistikKarte("Abschüsse", `${rehwild.gesamt} Stk.`)}${statistikKarte("Rehböcke", `${rehwild.rehbockA + rehwild.rehbockB} Stk.`, `A: ${rehwild.rehbockA} · B: ${rehwild.rehbockB}`)}${statistikKarte("Rehgeiß", `${rehwild.rehgeiss} Stk.`)}${statistikKarte("Rehkitz", `${rehwild.rehkitz} Stk.`)}</div>
      ${abschnitt("Rehwild nach Jahr", rehwildJahre(rehwild.jahre))}
      <div class="jb-report-two-columns jb-rehbock-details">${abschnitt("Rehbock A", bockA)}${abschnitt("Rehbock B", bockB)}</div>
    `, "jb-wildseite jb-rehwild-seite", true);
  }
  function rehwildNachJaegerSeite() {
    if (!daten.istVerein) return [];
    return [seite("REHWILD – NACH JÄGER", abschnitt("Rehwild nach Jäger", tabelle(["Jäger", "Anzahl"], daten.nachJaeger.rehwild.map((row) => [esc(row.jaeger), esc(`${row.anzahl} Stk.`)]))), "jb-wildseite jb-rehwild-seite")];
  }
  function haarFederwildSeite() {
    const haarFeder = daten.auswertung.haarFederwild;
    const jahre = tabelle(["Jahr", "Wildgruppe", "Wildklasse", "Anzahl"], haarFeder.jahre.map((row) => [esc(row.jahr), esc(row.wildgruppe), esc(row.bezeichnung), esc(`${row.anzahl} Stk.`)]), "Keine Haar- oder Federwildabschüsse im Berichtszeitraum.");
    return seite("HAAR- UND FEDERWILD", `
      <div class="jb-report-two-columns">${abschnitt("Raubwild", listeMitAnzahl(haarFeder.raubwild))}${abschnitt("Federwild", listeMitAnzahl(haarFeder.federwild))}</div>
      ${abschnitt("Abschüsse nach Jahr", jahre)}
    `, "jb-wildseite jb-haarfeder-seite");
  }
  function fallwildBemerkung(row) {
    return [...new Set([row.bemerkung, row.zusatzinfo].map((wert) => String(wert || "").trim()).filter(Boolean))].join(" · ");
  }
  function fallwildTabelle(eintraege) {
    if (!eintraege.length) return `<p class="jb-empty">Keine Fallwild-Einträge im Berichtszeitraum.</p>`;
    const verein = daten.istVerein;
    const spalten = verein ? ["Datum", "Wildgruppe", "Wildklasse", "Jäger", "Ort"] : ["Datum", "Wildgruppe", "Wildklasse", "Ort"];
    return `<table class="jb-table jb-fallwild-table"><thead><tr>${spalten.map((spalte) => `<th>${spalte}</th>`).join("")}</tr></thead>${eintraege.map((row) => {
      const jaeger = relation(row.jaeger); const name = jaeger?.vorname ? `${jaeger.vorname} ${jaeger.nachname || ""}`.trim() : "–";
      const haupt = verein ? [datum(row.datum), esc(wildgruppe(row)), esc(wildklasse(row)), esc(name), esc(ort(row))] : [datum(row.datum), esc(wildgruppe(row)), esc(wildklasse(row)), esc(ort(row))];
      const bemerkung = fallwildBemerkung(row);
      return `<tbody class="jb-fallwild-entry"><tr>${haupt.map((wert) => `<td>${wert}</td>`).join("")}</tr>${bemerkung ? `<tr class="jb-fallwild-bemerkung"><td></td><td colspan="${spalten.length - 1}">${esc(bemerkung)}</td></tr>` : ""}</tbody>`;
    }).join("")}</table>`;
  }
  function fallwildJahresgruppen() {
    const gruppen = new Map();
    (daten.fallwild || []).forEach((row) => {
      const jahr = String(row.datum || "").slice(0, 4);
      const gruppe = relation(row.wildgruppen) || {};
      const wildgruppe = gruppe.bezeichnung || "Ohne Wildgruppe";
      const key = `${jahr}|${gruppe.id || wildgruppe}`;
      const eintrag = gruppen.get(key) || { jahr, wildgruppe, reihenfolge: Number(gruppe.reihenfolge), anzahl: 0 };
      eintrag.anzahl += 1; gruppen.set(key, eintrag);
    });
    return [...gruppen.values()].sort((a, b) => Number(a.jahr) - Number(b.jahr) ||
      (Number.isFinite(a.reihenfolge) ? a.reihenfolge : Number.MAX_SAFE_INTEGER) - (Number.isFinite(b.reihenfolge) ? b.reihenfolge : Number.MAX_SAFE_INTEGER) ||
      a.wildgruppe.localeCompare(b.wildgruppe, "de"));
  }
  function fallwildGruppen() {
    const gruppen = new Map();
    (daten.fallwild || []).forEach((row) => {
      const name = wildgruppe(row);
      const bezeichnung = /haar|raub|feder|vogel/i.test(name) ? "Haar- und Federwild" : name;
      gruppen.set(bezeichnung, (gruppen.get(bezeichnung) || 0) + 1);
    });
    const reihenfolge = (name) => ({ Rotwild: 1, Rehwild: 2, "Haar- und Federwild": 3 }[name] || 99);
    return [...gruppen.entries()].map(([bezeichnung, anzahl]) => ({ bezeichnung, anzahl }))
      .sort((a, b) => reihenfolge(a.bezeichnung) - reihenfolge(b.bezeichnung) || a.bezeichnung.localeCompare(b.bezeichnung, "de"));
  }
  function fallwildSeite() {
    const eintraege = daten.fallwild || [];
    const gruppen = fallwildGruppen();
    return seite("FALLWILD", `
      <p class="jb-page-period">Berichtszeitraum: ${esc(zeitraumText())}</p>
      <div class="jb-stat-grid jb-fallwild-stat-grid"><section class="jb-stat-card"><h3>Fallwild</h3><strong>${eintraege.length} Stk.</strong></section>${gruppen.map((gruppe) => statistikKarte(gruppe.bezeichnung, `${gruppe.anzahl} Stk.`)).join("")}</div>
      ${abschnitt("Fallwild-Einträge", fallwildTabelle(eintraege))}
    `, "jb-wildseite jb-fallwild-seite");
  }
  function fallwildFortsetzungen() {
    const jahresgruppen = fallwildJahresgruppen();
    if (!jahresgruppen.length) return [];
    return [seite("FALLWILD – NACH JAHR", abschnitt("Fallwild nach Jahr", tabelle(
      ["Jahr", "Wildgruppe", "Anzahl"],
      jahresgruppen.map((row) => [esc(row.jahr), esc(row.wildgruppe), esc(`${row.anzahl} Stk.`)]),
      "Keine Fallwild-Einträge im Berichtszeitraum.",
      "jb-fallwild-year-table"
    )), "jb-wildseite jb-fallwild-seite")];
  }
  function rotwildFortsetzungen() {
    const rotwild = daten.auswertung.rotwild, rehwild = daten.auswertung.rehwild;
    if (daten.istVerein) {
      const a = rotwild.hirschDetails.filter((row) => row.klasse === "Hirsch A").length;
      const b = rotwild.hirschDetails.filter((row) => row.klasse === "Hirsch B" || row.klasse === "Hirsch B1").length;
      const seiten = [];
      for (let index = 14; index < Math.max(a, b); index += 14) seiten.push(seite("ROTWILD – FORTSETZUNG", vereinHirsche(rotwild, index, "HIRSCHE"), "jb-wildseite jb-rotwild-seite"));
      return seiten;
    }
    const hirschZeilen = rotwild.hirschDetails.map((row) => [esc(row.klasse) + fallwildHinweis(row), row.alter == null ? "–" : `${esc(row.alter)} Jahre`, datum(row.datum)]);
    return fortsetzungsSeiten("ROTWILD", "Hirsche", ["Klasse", "Alter", "Datum"], hirschZeilen, 14, 14, "jb-date-table");
  }
  function rehwildFortsetzungen() { return []; }

  function freigabenSeite() {
    if (daten.istVerein) {
      const regeln = daten.freigaben.filter((row) => row.ausnahme).map((row) => [esc(`${row.jaeger?.vorname || ""} ${row.jaeger?.nachname || ""}`.trim()), esc(row.wildklasse?.bezeichnung || "–"), esc(row.ausnahme?.regel || row.ausnahme?.regeltyp || "Individuelle Regel"), esc(row.ausnahme?.freigabejahr || "–"), esc(row.regulaeres_freigabejahr || "–"), `<span class="${row.status === "FREI" ? "ok" : "offen"}">${esc(row.status || "–")}</span>`]);
      return seite("ABSCHUSSREGELN", abschnitt("Individuelle Abschussregeln", tabelle(["Jäger", "Wildklasse", "Regel", "Freigabejahr", "Regulär", "Status"], regeln, "Keine individuellen Abschussregeln im Berichtszeitraum.")));
    }
    const regeln = tabelle(["Wildklasse","Regulär","Vorgezogen / individuell","Status","Nächste Freigabe"], daten.freigaben
      .filter((row)=>norm(row.wildklasse.bezeichnung).startsWith("hirsch"))
      .map((row)=>{
        const erfuellt=row.erfuellte_vorziehungen?.[0];
        const individuell=row.ausnahme ? `${row.ausnahme.freigabejahr || "–"}${row.ausnahme.bemerkung ? ` – ${row.ausnahme.bemerkung}` : ""}`
          : erfuellt ? `erfüllt (${String(erfuellt.abschuss?.datum || "").slice(0,4) || "–"})` : "–";
        return [esc(row.wildklasse.bezeichnung),esc(row.regulaeres_freigabejahr || "–"),esc(individuell),`<span class="${row.status === "FREI" ? "ok" : "offen"}">${esc(row.status)}</span>`,esc(row.freigabejahr || "–")];
      }));
    const kwRows=kahlwildDetailRows();const kw=kwRows.length?tabelle(["Jahr","Pflicht","Erlegt","Offen","Status"],kwRows.slice(0,18)):"";
    return seite("ABSCHUSSREGELN & FREIGABEN", `${abschnitt("Aktuelle Abschussregeln",regeln)}${kw?abschnitt("Kahlwildpflicht Detail",kw):""}`);
  }
  function kahlwildDetailRows(){return daten.kahlwildJahre.filter((row)=>Number(row.offen||0)>0).map((row)=>[
    row.jahr,Number(row.pflicht||0)+Number(row.uebertrag||0),Number(row.angerechnet||0),Number(row.offen||0),row.freigegeben?'<span class="ok">✓ Erfüllt</span>':'<span class="offen">Offen</span>']);}
  function freigabenFortsetzungen(){return fortsetzungsSeiten("ABSCHUSSREGELN & FREIGABEN","Kahlwildpflicht Detail",["Jahr","Pflicht","Erlegt","Offen","Status"],kahlwildDetailRows(),18);}

  function nachsuchenTabelle(eintraege) {
    if (!eintraege.length) return `<p class="jb-empty">Keine Nachsuchen.</p>`;
    const verein = daten.istVerein;
    const spalten = verein ? ["Datum", "Jäger", "Ort", "Wild / Ergebnis"] : ["Datum", "Ort", "Wild / Ergebnis"];
    return `<table class="jb-table jb-nachsuchen-table"><thead><tr>${spalten.map((spalte) => `<th>${spalte}</th>`).join("")}</tr></thead>${eintraege.map((row) => {
      const jaeger = `${relation(row.jaeger)?.vorname || ""} ${relation(row.jaeger)?.nachname || ""}`.trim() || "–";
      const haupt = verein ? [datum(row.datum), esc(jaeger), esc(ort(row)), esc(`${wildklasse(row)} · ${row.wild_gefunden ? "gefunden" : "nicht gefunden"}`)] : [datum(row.datum), esc(ort(row)), esc(`${wildklasse(row)} · ${row.wild_gefunden ? "gefunden" : "nicht gefunden"}`)];
      const bemerkung = String(row.info || "").trim();
      return `<tbody class="jb-nachsuchen-entry"><tr>${haupt.map((wert) => `<td>${wert}</td>`).join("")}</tr>${bemerkung ? `<tr class="jb-nachsuchen-bemerkung"><td></td><td colspan="${spalten.length - 1}">${esc(bemerkung)}</td></tr>` : ""}</tbody>`;
    }).join("")}</table>`;
  }
  function aktivitaetsRows(){return{
    nachsuchen:daten.nachsuchen.map((row)=>daten.istVerein?[datum(row.datum),esc(`${relation(row.jaeger)?.vorname || ""} ${relation(row.jaeger)?.nachname || ""}`.trim()||"–"),esc(ort(row)),esc(wildklasse(row)),row.wild_gefunden?"gefunden":"nicht gefunden",esc(row.info||"–")]:[datum(row.datum),esc(ort(row)),esc(wildklasse(row)),row.wild_gefunden?"gefunden":"nicht gefunden",esc(row.info||"–")]),
    probe:daten.probeschuesse.map((row)=>daten.istVerein?[datum(row.datum),esc(`${relation(row.jaeger)?.vorname || ""} ${relation(row.jaeger)?.nachname || ""}`.trim()||"–"),esc(ort(row)),"Probeschuss",esc(row.info||"–")]:[datum(row.datum),esc(ort(row)),"Probeschuss",esc(row.info||"–")]),
    fehl:daten.fehlschuesse.map((row)=>daten.istVerein?[datum(row.datum),esc(`${relation(row.jaeger)?.vorname || ""} ${relation(row.jaeger)?.nachname || ""}`.trim()||"–"),esc(ort(row)),esc([wildgruppe(row),wildklasse(row)].filter((x)=>x!=="–").join(" – ")||"–"),esc(row.info||"–")]:[datum(row.datum),esc(ort(row)),esc([wildgruppe(row),wildklasse(row)].filter((x)=>x!=="–").join(" – ")||"–"),esc(row.info||"–")])};}
  function aktivitaetenSeiten() {
    const rows = aktivitaetsRows(), bereiche = [];
    const nachsuchen = daten.nachsuchen;
    if (nachsuchen.length) bereiche.push(abschnitt("Nachsuchen", nachsuchenTabelle(nachsuchen)));
    const bereichHinzufuegen = (titel, spalten, zeilen) => {
      if (zeilen.length) bereiche.push(abschnitt(titel, tabelle(spalten, zeilen, "Keine Einträge im Berichtszeitraum.", "jb-date-table")));
    };
    bereichHinzufuegen("Probeschüsse", daten.istVerein ? ["Datum", "Jäger", "Ort", "Art", "Bemerkung"] : ["Datum", "Ort", "Art", "Bemerkung"], rows.probe);
    bereichHinzufuegen("Fehlschüsse", daten.istVerein ? ["Datum", "Jäger", "Ort", "Wild", "Bemerkung"] : ["Datum", "Ort", "Wild", "Bemerkung"], rows.fehl);
    return bereiche.length ? [seite("NACHSUCHEN & SCHÜSSE", bereiche.join(""))] : [];
  }

  function journalSeite() {
    const stp = journalTabelle(journalEintraege());
    return seite("WEITERE AKTIVITÄTEN",abschnitt("St. Peter/Mitterberg",stp));
  }
  function journalEintraege(){return daten.stPeter.map((row)=>({datum:datum(row.datum),kategorie:relation(row.kategorie)?.bezeichnung||"–",titel:row.titel||"–",beschreibung:row.beschreibung||"",personen:row.weitere_personen||"–"}));}
  function journalTabelle(eintraege) {
    if (!eintraege.length) return `<p class="jb-empty">Keine Einträge aus St. Peter/Mitterberg.</p>`;
    return `<table class="jb-table jb-journal-table"><colgroup><col><col><col><col></colgroup><thead><tr><th>Datum</th><th>Kategorie</th><th>Titel</th><th>Personen</th></tr></thead>${eintraege.map((eintrag) => `<tbody class="jb-journal-entry"><tr class="jb-journal-main"><td>${esc(eintrag.datum)}</td><td>${esc(eintrag.kategorie)}</td><td>${esc(eintrag.titel)}</td><td>${esc(eintrag.personen)}</td></tr>${eintrag.beschreibung.trim() ? `<tr class="jb-journal-description"><td></td><td colspan="3">${esc(eintrag.beschreibung)}</td></tr>` : ""}</tbody>`).join("")}</table>`;
  }
  function journalFortsetzungen(){ return []; }

  function rendern() {
    const container = el("jbSeiten"); container.innerHTML = "";
    const seiten=[
      rehwildSeite(), ...rehwildFortsetzungen(), ...rehwildNachJaegerSeite(),
      rotwildSeite(), ...rotwildFortsetzungen(),
      haarFederwildSeite(),
      fallwildSeite(), ...fallwildFortsetzungen(),
      freigabenSeite(), ...freigabenFortsetzungen(),
    ];
    if(daten.nachsuchen.length||daten.probeschuesse.length||daten.fehlschuesse.length)seiten.push(...aktivitaetenSeiten());
    if(daten.stPeter.length)seiten.push(journalSeite(),...journalFortsetzungen());
    container.append(...seiten);
    const titel=daten.istVerein?"St. Peter/Mitterberg":`${daten.jaeger.vorname} ${daten.jaeger.nachname}`.trim();
    const rahmenOptionen={titel,jahr:zeitraumText()};
    A4PageLayout.rahmenAktualisieren(container,rahmenOptionen);
    seitenhoehenSichern(container,rahmenOptionen);
    [...container.children].slice(1).forEach((seiteElement) => seiteElement.classList.add("jaegerbericht-folgeseite"));
    A4PageLayout.rahmenAktualisieren(container,rahmenOptionen);
  }
  async function anzeigen() {
    const jaegerId=jaegerDropdown.getValue(); if(!jaegerId){AppFeedback.error("Bitte einen Jäger auswählen.");return;}
    const von=Number(el("jbVonJahr").value),bis=Number(el("jbBisJahr").value);if(von>bis){AppFeedback.error("Das Startjahr darf nicht größer als das Endjahr sein.");return;}
    const button=el("jbAnzeigen"); button.disabled=true; el("jbStatus").hidden=false;el("jbStatus").textContent="Jägerdatenblatt wird geladen …";
    try { daten=await JaegerBerichtService.laden(jaegerId,von,bis);rendern();el("jbStatus").textContent="";el("jbStatus").hidden=true;el("jbPdf").disabled=false;el("jbDrucken").disabled=false; }
    catch(error){console.error("Jägerdatenblatt:",error);el("jbStatus").hidden=false;el("jbStatus").textContent=error.message;AppFeedback.error(error.message);} finally{button.disabled=false;}
  }
  function drucken() { const titel=daten.istVerein?`Vereinsbericht St. Peter/Mitterberg ${zeitraumText()}`:`Jägerdatenblatt ${zeitraumText()}`; ReportPrintService.drucken(titel); }
  async function init() {
    const auswahlGeaendert=()=>{el("jbPdf").disabled=true;el("jbDrucken").disabled=true;daten=null;if(el("jbSeiten").children.length){el("jbStatus").hidden=false;el("jbStatus").textContent="Auswahl geändert – bitte Bericht erneut anzeigen.";}};
    A4PreviewZoom.create({scroll:document.querySelector(".jaegerbericht-scroll"),pages:el("jbSeiten"),sheetSelector:".jaegerbericht-sheet"});
    jaegerDropdown = new SearchDropdown(el("jbJaeger"), {
      placeholder: "Jäger oder Vereinsbericht suchen", minChars: 0, maxResults: 10, prioritizeMatches: true,
      onChange: auswahlGeaendert,
    });
    const [jaeger,jahre]=await Promise.all([JaegerBerichtService.jaegerLaden(),JaegerBerichtService.jahreLaden()]);
    jaegerDropdown.setOptions([{value:JaegerBerichtService.VEREIN_VALUE,label:"JV St. Peter/Mitterberg",group:"Vereinsbericht"},...PersonenAutocompleteService.optionen(jaeger)]);
    const optionen=jahre.map((jahr)=>`<option value="${jahr}">${jahr}</option>`).join("");el("jbVonJahr").innerHTML=optionen;el("jbBisJahr").innerHTML=optionen;
    const aktuell=new Date().getFullYear();el("jbVonJahr").value=String(aktuell);el("jbBisJahr").value=String(aktuell);
    const zeitraumAktualisieren=()=>{const von=Number(el("jbVonJahr").value),bis=Number(el("jbBisJahr").value);el("jbZeitraum").textContent=`Berichtszeitraum: ${von===bis?von:`${von} – ${bis}`}`;auswahlGeaendert();};
    el("jbVonJahr").addEventListener("change",zeitraumAktualisieren);el("jbBisJahr").addEventListener("change",zeitraumAktualisieren);zeitraumAktualisieren();
    el("jbAnzeigen").addEventListener("click",anzeigen);el("jbPdf").addEventListener("click",drucken);el("jbDrucken").addEventListener("click",drucken);
  }
  return {init};
})();
