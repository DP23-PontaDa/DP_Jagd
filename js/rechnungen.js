window.Rechnungen = (() => {
  const el = (id) => document.getElementById(id);
  let rechnungen = [];
  let abschuesse = [];
  let personDropdown = null;
  let aktuelleId = null;
  let vorauswahlId = null;

  async function init() {
    personDropdown = new SearchDropdown(el("rePerson"), { placeholder: "Person suchen" });
    el("reNeu").addEventListener("click", () => oeffneEditor());
    el("reSpeichern").addEventListener("click", () => speichern());
    el("reSpeichernDrucken").addEventListener("click", speichernUndDrucken);
    el("reAbbrechen").addEventListener("click", schliessen);
    el("reSchliessen").addEventListener("click", schliessen);
    el("reModal").addEventListener("click", (event) => {
      if (event.target === el("reModal")) schliessen();
    });
    el("reAbschussAuswahl").addEventListener("change", auswahlGeaendert);
    el("reTabelleBody").addEventListener("click", tabellenAktion);
    vorauswahlId = Router.pendingRechnungAbschussId || null;
    Router.pendingRechnungAbschussId = null;
    await laden();
    if (vorauswahlId) await oeffneEditor(null, vorauswahlId);
  }

  async function laden() {
    try {
      const [liste, personen] = await Promise.all([
        RechnungService.getRechnungen(), RechnungService.getPersonen(),
      ]);
      rechnungen = liste;
      personDropdown.setOptions(personen.map((person) => ({
        value: person.id,
        label: `${person.vorname || ""} ${person.nachname || ""}`.trim(),
        data: person,
      })));
      rendern();
      el("reSeitenFehler").hidden = true;
    } catch (error) {
      console.error("Rechnungen laden:", error);
      seitenFehler(error.message || "Rechnungen konnten nicht geladen werden.");
    }
  }

  function rendern() {
    const body = el("reTabelleBody");
    body.innerHTML = "";
    if (!rechnungen.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">Noch keine Rechnungen vorhanden.</td></tr>';
      return;
    }
    rechnungen.forEach((rechnung) => {
      const row = document.createElement("tr");
      row.dataset.id = rechnung.id;
      const person = `${rechnung.person?.vorname || ""} ${rechnung.person?.nachname || ""}`.trim();
      const abschussNummernText = (rechnung.positionen || [])
        .map((position) => `${position.abschuss_nr}/${position.abschuss_jahr}`)
        .join(", ");
      row.innerHTML = `
        <td>${escapeHtml(rechnung.rechnungsnummer)}</td>
        <td>${formatDatum(rechnung.rechnungsdatum)}</td>
        <td>${escapeHtml(person)}</td>
        <td>${escapeHtml(abschussNummernText)}</td>
        <td class="number-cell">${formatGeld(rechnung.gesamtbetrag)}</td>
        <td class="action-cell">
          <button class="action-btn edit-btn" type="button" data-aktion="bearbeiten" data-id="${rechnung.id}" title="Bearbeiten" aria-label="Bearbeiten"></button>
          <button class="action-btn invoice-pdf-btn" type="button" data-aktion="pdf" data-id="${rechnung.id}" title="PDF speichern" aria-label="PDF speichern">PDF</button>
          <button class="action-btn delete-btn" type="button" data-aktion="loeschen" data-id="${rechnung.id}" title="Löschen" aria-label="Löschen"></button>
        </td>`;
      body.appendChild(row);
    });
  }

  async function oeffneEditor(id = null, startAbschussId = null) {
    aktuelleId = id;
    el("reFehler").hidden = true;
    el("reModalTitel").textContent = id ? "Rechnung bearbeiten" : "Neue Rechnung";
    el("reDatum").value = new Date().toISOString().slice(0, 10);
    personDropdown.clear(false);
    try {
      const [verfuegbar, rechnung] = await Promise.all([
        RechnungService.getVerrechenbareAbschuesse(id),
        id ? RechnungService.getRechnung(id) : Promise.resolve(null),
      ]);
      abschuesse = verfuegbar;
      if (rechnung) {
        el("reDatum").value = rechnung.rechnungsdatum;
        personDropdown.setValue(rechnung.person_id, false);
      }
      const ausgewaehlt = new Set(rechnung
        ? (rechnung.positionen || []).map((p) => String(p.abschuss_id))
        : startAbschussId ? [String(startAbschussId)] : []);
      renderAbschussAuswahl(ausgewaehlt);
      updateGesamtbetrag();
      el("reModal").style.display = "block";
      el("reModal").setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => el("reModal").classList.add("is-open"));
    } catch (error) {
      console.error("Rechnungseditor:", error);
      modalFehler(error.message || "Der Rechnungseditor konnte nicht geöffnet werden.");
    }
  }

  function renderAbschussAuswahl(ausgewaehlt) {
    const container = el("reAbschussAuswahl");
    container.innerHTML = "";
    if (!abschuesse.length) {
      container.innerHTML = '<p class="empty-state">Keine verrechenbaren Abschüsse vorhanden.</p>';
      return;
    }
    abschuesse.forEach((abschuss) => {
      const label = document.createElement("label");
      label.className = "invoice-choice";
      label.innerHTML = `<input type="checkbox" value="${abschuss.id}" ${ausgewaehlt.has(String(abschuss.id)) ? "checked" : ""}>
        <span><strong>Nr. ${abschuss.nr}/${abschuss.jahr}</strong><small>${formatDatum(abschuss.datum)} · ${escapeHtml(abschuss.wildgruppen?.bezeichnung || "")} · ${escapeHtml(abschuss.wildklassen?.bezeichnung || "")}</small></span>
        <b>${formatGeld(abschuss.gesamtpreis)}</b>`;
      container.appendChild(label);
    });
  }

  function auswahlGeaendert(event) {
    const ausgewaehlt = getAuswahl();
    if (ausgewaehlt.length > 2) {
      event.target.checked = false;
      modalFehler("Eine Rechnung darf höchstens zwei Abschüsse enthalten.");
    } else {
      el("reFehler").hidden = true;
    }
    updateGesamtbetrag();
  }

  function updateGesamtbetrag() {
    const ids = getAuswahl();
    const total = abschuesse.filter((a) => ids.includes(String(a.id)))
      .reduce((sum, a) => sum + Number(a.gesamtpreis || 0), 0);
    el("reGesamtbetrag").textContent = formatGeld(total);
  }

  function getAuswahl() {
    return [...el("reAbschussAuswahl").querySelectorAll('input[type="checkbox"]:checked')]
      .map((box) => box.value);
  }

  function oeffneDruckFenster() {
    const druckFenster = window.open("", "_blank");
    if (!druckFenster) {
      modalFehler("Die Druckansicht wurde blockiert. Bitte Popups für DP_Jagd erlauben.");
      return null;
    }
    return druckFenster;
  }

  function speichernUndDrucken() {
    const druckFenster = oeffneDruckFenster();
    if (druckFenster) speichern({ druckFenster });
  }

  async function speichern({ druckFenster = null } = {}) {
    const druckAbbrechen = () => {
      if (druckFenster && !druckFenster.closed) druckFenster.close();
    };
    const abschussIds = getAuswahl();
    if (!el("reDatum").value || !personDropdown.getValue()) {
      modalFehler("Bitte Rechnungsdatum und Rechnungsempfänger auswählen.");
      druckAbbrechen();
      return;
    }
    if (abschussIds.length < 1) {
      modalFehler("Bitte mindestens einen Abschuss auswählen.");
      druckAbbrechen();
      return;
    }
    if (abschussIds.length > 2) {
      modalFehler("Eine Rechnung darf höchstens zwei Abschüsse enthalten.");
      druckAbbrechen();
      return;
    }
    const gewaehlte = abschuesse.filter((a) => abschussIds.includes(String(a.id)));
    if (gewaehlte.some((a) => !RechnungService.istAbschussVerrechenbar(a))) {
      modalFehler("Für diesen Abschuss ist laut Wildgruppe oder Wildhändler keine Rechnung möglich.");
      druckAbbrechen();
      return;
    }
    let gespeichert = false;
    try {
      el("reSpeichern").disabled = true;
      el("reSpeichernDrucken").disabled = true;
      const id = await RechnungService.saveRechnung({
        id: aktuelleId, personId: personDropdown.getValue(),
        rechnungsdatum: el("reDatum").value, abschussIds,
      });
      gespeichert = true;
      if (druckFenster) await RechnungService.generatePdf(id, druckFenster);
      schliessen();
      await laden();
      AppFeedback.success(druckFenster
        ? "Rechnung wurde gespeichert und für den Druck vorbereitet."
        : "Rechnung wurde gespeichert.");
      AppFeedback.focusRow(`#reTabelleBody tr[data-id="${id}"]`);
    } catch (error) {
      druckAbbrechen();
      modalFehler(gespeichert
        ? `Die Rechnung wurde gespeichert, die Druckansicht konnte jedoch nicht erstellt werden: ${error.message || "Unbekannter Fehler"}`
        : error.message || "Die Rechnung konnte nicht gespeichert werden.");
    } finally {
      el("reSpeichern").disabled = false;
      el("reSpeichernDrucken").disabled = false;
    }
  }

  async function tabellenAktion(event) {
    const button = event.target.closest("[data-aktion]");
    if (!button) return;
    const { id, aktion } = button.dataset;
    if (aktion === "bearbeiten") return oeffneEditor(id);
    if (aktion === "pdf") {
      const druckFenster = oeffneDruckFenster();
      try {
        if (!druckFenster) {
          throw new Error("Die Druckansicht wurde blockiert. Bitte Popups für DP_Jagd erlauben.");
        }
        druckFenster.document.write("<!doctype html><title>Rechnung wird vorbereitet</title><p style='font-family:sans-serif;padding:24px'>Rechnung wird vorbereitet …</p>");
        button.disabled = true;
        await RechnungService.generatePdf(id, druckFenster);
      } catch (error) {
        if (druckFenster && !druckFenster.closed) druckFenster.close();
        console.error("Rechnungs-PDF:", error);
        AppFeedback.error(error.message || "Die PDF konnte nicht erstellt werden.");
      } finally { button.disabled = false; }
      return;
    }
    if (aktion === "loeschen") {
      const ok = await AppFeedback.confirmDelete("Rechnung löschen?", "Die Rechnung und ihre Positionen werden gelöscht. Der Abschuss bleibt erhalten.");
      if (!ok) return;
      try {
        await RechnungService.deleteRechnung(id);
        await laden();
        AppFeedback.success("Rechnung wurde gelöscht.");
      } catch (error) { AppFeedback.error(error.message || "Löschen fehlgeschlagen."); }
    }
  }

  function schliessen() {
    const modal = el("reModal");
    modal.classList.remove("is-open");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    aktuelleId = null;
  }

  function modalFehler(text) { el("reFehler").textContent = text; el("reFehler").hidden = false; }
  function seitenFehler(text) { el("reSeitenFehler").textContent = text; el("reSeitenFehler").hidden = false; }
  function formatGeld(value) { return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(Number(value || 0)); }
  function formatDatum(value) { return value ? new Intl.DateTimeFormat("de-AT").format(new Date(`${value}T00:00:00`)) : ""; }
  function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value ?? ""; return div.innerHTML; }
  return { init };
})();
