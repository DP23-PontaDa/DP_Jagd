window.HirschAFreigabeVerlauf = (() => {
  const MONATE = [[4,"MAI"],[5,"JUN"],[6,"JUL"],[7,"AUG"],[8,"SEP"],[9,"OKT"],[10,"NOV"],[11,"DEZ"]];
  const el = (id) => document.getElementById(id);
  let jahr = null;
  let initialisiert = false;

  function datum(jahrWert, monat, tag) { return `${jahrWert}-${String(monat).padStart(2,"0")}-${String(tag).padStart(2,"0")}`; }

  function kalenderRendern(status, freieA) {
    const ziel = el("havSeiten"); if (!ziel) return;
    ziel.innerHTML = "";
    const sheet = document.createElement("section"); sheet.className = "jagdjahr-sheet hirsch-a-verlauf-sheet";
    sheet.innerHTML = `<header><h2>HIRSCH A FREIGABEVERLAUF</h2><strong>${jahr}</strong><p>Mai bis Dezember</p><div class="hav-startinfo">${jahr === 2025 ? "Start 01.05.2025 · Kahlwildguthaben: 19 Stk. · Hirsch A frei: 2 Stk." : `Hirsch A frei am Jahresende: ${freieA} Stk.`}</div><div class="hav-legende"><span class="ist-frei">A wird frei</span><span class="ist-erlegt">A erlegt</span><span class="ist-offen">kein A frei</span></div></header>`;
    const table = document.createElement("table"); table.className = "jagdjahr-calendar acht-monate hav-calendar";
    const thead = document.createElement("thead"), kopf = document.createElement("tr");
    MONATE.forEach(([monat, name]) => { const th = document.createElement("th"); th.textContent = name; kopf.appendChild(th); }); thead.appendChild(kopf); table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (let tag = 1; tag <= 31; tag += 1) {
      const zeile = document.createElement("tr");
      MONATE.forEach(([monat]) => {
        const zelle = document.createElement("td");
        if (tag > new Date(jahr, monat + 1, 0).getDate()) { zelle.className = "is-invalid"; zeile.appendChild(zelle); return; }
        const eintrag = status.get(datum(jahr, monat + 1, tag));
        if (eintrag) zelle.classList.add(`hav-status-${eintrag.art}`);
        zelle.innerHTML = `<span class="jagdjahr-tag">${tag}</span>${eintrag && eintrag.art !== "offen" ? '<span class="hav-status-zeichen">A</span>' : ""}`;
        zeile.appendChild(zelle);
      });
      tbody.appendChild(zeile);
    }
    table.appendChild(tbody); sheet.appendChild(table); ziel.appendChild(sheet);
  }

  async function laden() {
    const fehler = el("havFehler"); if (fehler) fehler.hidden = true;
    try {
      const ereignisse = await JagdJahrService.hirschAFreigabeEreignisse(jahr);
      const ergebnis = RotwildFreigabeGrafik.hirschAFreigabeverlauf(jahr, ereignisse);
      kalenderRendern(ergebnis.status, ergebnis.freieA);
      el("havPdf")._status = ergebnis.status;
    } catch (error) {
      console.error("Hirsch-A-Freigabeverlauf laden:", error);
      if (fehler) { fehler.textContent = error.message || "Der Freigabeverlauf konnte nicht geladen werden."; fehler.hidden = false; }
    }
  }

  async function pdf(oeffnen) {
    const button = oeffnen ? el("havDrucken") : el("havPdf"), text = button.textContent;
    button.disabled = true; button.textContent = "Erstellt …";
    try {
      const monate = MONATE.map(([monat, name]) => ({ monat, name, jahr: Number(jahr) }));
      const blob = await JagdJahrPdfService.erstellen(jahr, [{ typ: "kalender", untertitel: "Mai bis Dezember", monate, eintraege: new Map(), freigabeStatus: el("havPdf")._status }], { titel: "HIRSCH A FREIGABEVERLAUF" });
      if (oeffnen) JagdJahrPdfService.oeffnen(blob); else JagdJahrPdfService.speichern(blob, `Hirsch-A-Freigabeverlauf-${jahr}.pdf`);
    } catch (error) { AppFeedback.error(error.message || "PDF konnte nicht erstellt werden."); }
    finally { button.disabled = false; button.textContent = text; }
  }

  async function init() {
    if (!el("havJahr")) return;
    if (!initialisiert) {
      initialisiert = true;
      el("havJahr").addEventListener("change", (event) => { jahr = Number(event.target.value); laden(); });
      el("havPdf").addEventListener("click", () => pdf(false));
      el("havDrucken").addEventListener("click", () => pdf(true));
    }
    const jahre = [...new Set([2025, ...(await JagdJahrService.verfuegbareJahre()).filter((wert) => Number(wert) >= 2025)])].sort((a, b) => b - a);
    jahr = jahre.includes(new Date().getFullYear()) ? new Date().getFullYear() : (jahre[0] || 2025);
    el("havJahr").innerHTML = jahre.map((wert) => `<option value="${wert}">${wert}</option>`).join("");
    el("havJahr").value = jahr;
    await laden();
  }

  return { init };
})();
