window.HirschAFreigabeVerlauf = (() => {
  const MONATE = [[4,"MAI"],[5,"JUN"],[6,"JUL"],[7,"AUG"],[8,"SEP"],[9,"OKT"],[10,"NOV"],[11,"DEZ"]];
  const el = (id) => document.getElementById(id);
  let jahr = null;
  let initialisiert = false;
  let ladeFolge = 0;
  let initialisierungsFolge = 0;

  function datum(jahrWert, monat, tag) { return `${jahrWert}-${String(monat).padStart(2,"0")}-${String(tag).padStart(2,"0")}`; }

  function diagnoseRendern(diagnose) {
    const ziel = el("havDiagnose");
    if (!ziel) return;
    ziel.hidden = false;
    ziel.innerHTML = `<strong>Datenprüfung</strong><dl>` +
      `<dt>Geladene Kahlwildabschüsse</dt><dd>${diagnose.kahlwild}</dd>` +
      `<dt>Geladene Hirsch-A-Abschüsse</dt><dd>${diagnose.hirschA}</dd>` +
      `<dt>A-Freigaben gesamt</dt><dd>${diagnose.aFreigabenGesamt}</dd>` +
      `<dt>Davon Startguthaben</dt><dd>${diagnose.startAFreigaben}</dd>` +
      `<dt>Neue A-Freigaben im Zeitraum</dt><dd>${diagnose.neueAFreigaben}</dd>` +
      `<dt>A-Erlegungen</dt><dd>${diagnose.aErlegungen}</dd>` +
      `<dt>Start-Kahlwild</dt><dd>${diagnose.startKahlwild}</dd>` +
      `<dt>Start freie Hirsch A</dt><dd>${diagnose.startFreieA}</dd>` +
      `<dt>Ende Vorjahr Kahlwild</dt><dd>${diagnose.endeVorjahrKahlwild}</dd>` +
      `<dt>Ende Vorjahr freie Hirsch A</dt><dd>${diagnose.endeVorjahrFreieA}</dd>` +
      `<dt>Statuszellen</dt><dd>${diagnose.statuszellen}</dd>` +
      `<dt>Kahlwildstand am Jahresende</dt><dd>${diagnose.kahlwildStand}</dd>` +
      `<dt>Hirsch A frei am Jahresende</dt><dd>${diagnose.freieAAmJahresende}</dd>` +
      `<dt>Rotwild-Wildklassen (KW / A / B)</dt><dd>${diagnose.klassen}</dd>` +
      `<dt>Treffer aus Abschüssen</dt><dd>${diagnose.treffer}</dd>` +
      `<dt>Abschuss-Abfrage</dt><dd>${diagnose.abfrageAusgefuehrt ? "ausgeführt" : "wegen fehlender Zuordnung nicht ausgeführt"}</dd>` +
      `</dl>`;
  }

  function anzeigeStatus(status, startKahlwild, startFreieA) {
    const ergebnis = new Map(status);
    const ersterMai = `${jahr}-05-01`;
    ergebnis.set(ersterMai, { art: "guthaben", text: `+${startKahlwild}` });
    for (let tag = 2; tag < 2 + Number(startFreieA || 0) && tag <= 31; tag += 1) {
      const key = `${jahr}-05-${String(tag).padStart(2, "0")}`;
      if (!ergebnis.has(key) || ergebnis.get(key).art === "offen") ergebnis.set(key, { art: "frei", startbestand: true });
    }
    return ergebnis;
  }

  function kalenderRendern(status, freieA, diagnose = null) {
    const ziel = el("havSeiten"); if (!ziel) return;
    ziel.innerHTML = "";
    const sheet = document.createElement("section"); sheet.className = "jagdjahr-sheet hirsch-a-verlauf-sheet";
    const startInfo = jahr === 2025 ? "Start 01.05.2025 · Kahlwildguthaben: 19 Stk. · Hirsch A frei: 2 Stk." : "Fortschreibung ab 01.05.2025";
    sheet.innerHTML = `<header><h2>HIRSCH A FREIGABEVERLAUF</h2><strong>${jahr}</strong><p>Mai bis Dezember</p><div class="hav-startinfo">${startInfo} · Hirsch A frei am Jahresende: ${Number(freieA) || 0} Stk.</div><div class="hav-legende"><span class="ist-frei">A wird frei</span><span class="ist-erlegt">A erlegt</span><span class="ist-offen">kein A frei</span></div>${diagnose ? `<small class="hav-diagnose">Datenprüfung: Kahlwild ${diagnose.kahlwild} · Hirsch A ${diagnose.hirschA} · Statuszellen ${diagnose.statuszellen}</small>` : ""}</header>`;
    const werte = diagnose || {};
    const stueck = (wert) => `${Number(wert) || 0} Stk.`;
    sheet.innerHTML = `<header>
      <div class="hav-statistik" aria-label="Jahresstatistik Hirsch A Freigabeverlauf">
        <dl>
          <div><dt>Hirsch A frei Jahresanfang:</dt><dd>${stueck(werte.startFreieA)}</dd></div>
          <div><dt>Hirsch A frei Jahresende:</dt><dd>${stueck(freieA)}</dd></div>
          <div><dt>Neue A Freigaben:</dt><dd>${stueck(werte.neueAFreigaben)}</dd></div>
          <div><dt>Hirsch A Erlegungen:</dt><dd>${stueck(werte.aErlegungen)}</dd></div>
        </dl>
        <dl>
          <div><dt>Kahlwildguthaben Jahresanfang:</dt><dd>${stueck(werte.startKahlwild)}</dd></div>
          <div><dt>Kahlwildstand Jahresende:</dt><dd>${stueck(werte.kahlwildStand)}</dd></div>
          <div><dt>Kahlwildabschuss:</dt><dd>${stueck(werte.kahlwild)}</dd></div>
        </dl>
      </div>
    </header>`;
    const table = document.createElement("table"); table.className = "jagdjahr-calendar acht-monate hav-calendar";
    const thead = document.createElement("thead"), kopf = document.createElement("tr");
    MONATE.forEach(([monat, name]) => { const th = document.createElement("th"); th.textContent = name; kopf.appendChild(th); }); thead.appendChild(kopf); table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (let tag = 1; tag <= 31; tag += 1) {
      const zeile = document.createElement("tr");
      MONATE.forEach(([monat]) => {
        const zelle = document.createElement("td");
        if (tag > new Date(jahr, monat + 1, 0).getDate()) { zelle.className = "is-invalid"; zeile.appendChild(zelle); return; }
        const key = datum(jahr, monat + 1, tag);
        const eintrag = status.get(key);
        if (eintrag) zelle.classList.add(`hav-status-${eintrag.art}`);
        const aAnzahl = Number(eintrag?.anzahl || 1);
        const aText = Array.from({ length: aAnzahl }, () => "A").join(" ");
        zelle.innerHTML = `<span class="jagdjahr-tag">${tag}</span>${eintrag?.text ? `<span class="hav-startguthaben">${eintrag.text}</span>` : ""}${eintrag && ["frei", "erlegt"].includes(eintrag.art) ? `<span class="hav-status-zeichen">${aText}</span>` : ""}`;
        zeile.appendChild(zelle);
      });
      tbody.appendChild(zeile);
    }
    table.appendChild(tbody); sheet.appendChild(table); ziel.appendChild(sheet);
    A4PageLayout.rahmenAktualisieren(ziel,{titel:"Hirsch A Freigabeverlauf",jahr});
  }

  async function laden() {
    const ladeId = ++ladeFolge;
    const ladeJahr = jahr;
    const fehler = el("havFehler"); if (fehler) fehler.hidden = true;
    const diagnoseZiel = el("havDiagnose"); if (diagnoseZiel) diagnoseZiel.hidden = true;
    try {
      const daten = await JagdJahrService.hirschAFreigabeDaten(ladeJahr);
      if (ladeId !== ladeFolge || ladeJahr !== jahr) return;
      const ereignisse = daten?.freigabeEreignisse || [];
      const ereignisseImJahr = ereignisse.filter((ereignis) => String(ereignis.datum || "").startsWith(`${ladeJahr}-`));
      const ergebnis = RotwildFreigabeGrafik.hirschAFreigabeverlauf(jahr, ereignisse);
      const diagnose = {
        jahr,
        kahlwild: ereignisseImJahr.filter((ereignis) => ereignis.typ === "KAHLWILD").length,
        hirschA: ereignisseImJahr.filter((ereignis) => ereignis.typ === "HIRSCH_A").length,
        hirschB: ereignisseImJahr.filter((ereignis) => ereignis.typ === "HIRSCH_B").length,
        statuszellen: ergebnis.status.size,
        aFreigabenGesamt: ergebnis.aFreigabenGesamt,
        startAFreigaben: ergebnis.startAFreigaben,
        neueAFreigaben: ergebnis.neueAFreigabenImJahr,
        // Einzelne Abschüsse zählen, nicht nur eine Statuszelle pro Datum.
        aErlegungen: ereignisseImJahr.filter((ereignis) => ereignis.typ === "HIRSCH_A").length,
        startKahlwild: ergebnis.startKahlwild,
        startFreieA: ergebnis.startFreieA,
        endeVorjahrKahlwild: ergebnis.endeVorjahrKahlwild,
        endeVorjahrFreieA: ergebnis.endeVorjahrFreieA,
        kahlwildStand: 19 + Number(daten?.aktuellesKahlwild || 0),
        freieAAmJahresende: ergebnis.freieA,
        klassen: `${daten?.quelle?.kahlwildWildklassen || 0} / ${daten?.quelle?.hirschAWildklassen || 0} / ${daten?.quelle?.hirschBWildklassen || 0}`,
        treffer: Number(daten?.quelle?.geladeneAbschuesse || 0),
        abfrageAusgefuehrt: Number(daten?.quelle?.kahlwildWildklassen || 0) > 0,
      };
      console.debug("[Hirsch A Freigabeverlauf Debug]", diagnose, ereignisse);
      const sichtbareStatus = anzeigeStatus(ergebnis.status, ergebnis.startKahlwild, ergebnis.startFreieA);
      kalenderRendern(sichtbareStatus, ergebnis.freieA, diagnose);
      el("havPdf")._status = sichtbareStatus;
      if (!ergebnis.status.size && fehler) {
        fehler.textContent = ereignisse.length
          ? `Es wurden ${ereignisse.length} Rotwild-Ereignisse geladen, daraus wurde aber keine sichtbare Hirsch-A-Statuszelle berechnet. Die Datenprüfung oben zeigt die Aufteilung.`
          : "Keine freigabewirksamen Rotwild-Ereignisse geladen. Die Datenprüfung oben zeigt die Aufteilung.";
        fehler.hidden = false;
      }
    } catch (error) {
      if (ladeId !== ladeFolge || ladeJahr !== jahr) return;
      console.error("Hirsch-A-Freigabeverlauf laden:", error);
      if (fehler) { fehler.textContent = error.message || "Der Freigabeverlauf konnte nicht geladen werden."; fehler.hidden = false; }
    }
  }

  function drucken() { ReportPrintService.drucken(`Hirsch-A-Freigabeverlauf-${jahr}`); }

  async function init() {
    if (!el("havJahr")) return;
    const initialisierungsId = ++initialisierungsFolge;
    if (!initialisiert) {
      initialisiert = true;
      el("havJahr").addEventListener("change", (event) => { jahr = Number(event.target.value); laden(); });
      el("havPdf").addEventListener("click", drucken);
      el("havDrucken").addEventListener("click", drucken);
    }
    const jahre = [...new Set([2025, ...(await JagdJahrService.verfuegbareJahre()).filter((wert) => Number(wert) >= 2025)])].sort((a, b) => b - a);
    if (initialisierungsId !== initialisierungsFolge) return;
    jahr = jahre.includes(new Date().getFullYear()) ? new Date().getFullYear() : (jahre[0] || 2025);
    el("havJahr").innerHTML = jahre.map((wert) => `<option value="${wert}">${wert}</option>`).join("");
    el("havJahr").value = jahr;
    await laden();
  }

  return { init };
})();
