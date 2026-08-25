window.Rechnungen = (() => {
  const el = (id) => document.getElementById(id);
  let rechnungen = [];
  let kleinAbschuesse = [];
  let abschuesse = [];
  let personDropdown = null;
  let aktuelleId = null;
  let vorauswahlId = null;
  let zahlungRechnungId = null;
  let zahlungDatensatzTyp = null;

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
    el("reJahrFilter").addEventListener("change", rendern);
    el("reTypFilter").addEventListener("change", rendern);
    el("reZahlungsFilter").addEventListener("change", rendern);
    el("reZahlungSpeichern").addEventListener("click", () => zahlungSpeichern(false));
    el("reZahlungEntfernen").addEventListener("click", zahlungEntfernen);
    el("reZahlungAbbrechen").addEventListener("click", zahlungSchliessen);
    el("reZahlungSchliessen").addEventListener("click", zahlungSchliessen);
    el("reZahlungModal").addEventListener("click", (event) => {
      if (event.target === el("reZahlungModal")) zahlungSchliessen();
    });
    vorauswahlId = Router.pendingRechnungAbschussId || null;
    Router.pendingRechnungAbschussId = null;
    await laden();
    if (vorauswahlId) await oeffneEditor(null, vorauswahlId);
  }

  async function laden() {
    try {
      const [liste, kleinListe, personen] = await Promise.all([
        RechnungService.getRechnungen(), RechnungService.getKleinAbschuesse(),
        RechnungService.getPersonen(),
      ]);
      rechnungen = liste;
      kleinAbschuesse = kleinListe;
      jahresfilterAktualisieren();
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
    const eintraege = gefilterteEintraege();
    if (!eintraege.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty-state">Keine passenden Rechnungen oder Zahlungsvorgänge vorhanden.</td></tr>';
      return;
    }
    eintraege.forEach((eintrag) => {
      if (eintrag.typ === "klein") renderKleinZeile(body, eintrag.datensatz);
      else renderRechnungsZeile(body, eintrag.datensatz);
    });
  }

  function renderRechnungsZeile(body, rechnung) {
      const row = document.createElement("tr");
      row.dataset.id = rechnung.id;
      row.dataset.typ = "rechnung";
      const person = `${rechnung.person?.vorname || ""} ${rechnung.person?.nachname || ""}`.trim();
      const abschussNummernText = (rechnung.positionen || [])
        .map((position) => `${position.abschuss_nr}/${position.abschuss_jahr}`)
        .join(", ");
      const wildText = [...new Set((rechnung.positionen || []).map((position) =>
        [position.wildgruppe, position.wildklasse].filter(Boolean).join(" – ")))].join(", ");
      const betragStatus = InvoiceStatus.klasseFuerRechnung(rechnung);
      const zahlung = gemeinsamerZahlungseingang(rechnung);
      const darfZahlungBearbeiten = BerechtigungService.darf("rechnungen", "Bearbeiten");
      const zahlungAnzeige = zahlung.uneinheitlich ? "Unterschiedlich" :
        (zahlung.datum ? formatDatum(zahlung.datum) : "Zahlung erfassen");
      const zahlungButtonStatus = !zahlung.datum && !zahlung.uneinheitlich
        ? " invoice-payment-unpaid" : "";
      const zahlungHtml = darfZahlungBearbeiten
        ? `<button class="invoice-payment-button${zahlungButtonStatus}" type="button" data-aktion="zahlung" data-id="${rechnung.id}" title="Zahlungseingang erfassen oder ändern">${escapeHtml(zahlungAnzeige)}</button>`
        : escapeHtml(zahlung.uneinheitlich ? "Unterschiedlich" :
          (zahlung.datum ? formatDatum(zahlung.datum) : "–"));
      row.innerHTML = `
        <td data-label="Rechnungsnummer">${escapeHtml(rechnung.rechnungsnummer)}</td>
        <td data-label="Datum">${formatDatum(rechnung.rechnungsdatum)}</td>
        <td data-label="Empfänger">${escapeHtml(person)}</td>
        <td data-label="Abschuss Nr.">${escapeHtml(abschussNummernText)}</td>
        <td data-label="Wild">${escapeHtml(wildText)}</td>
        <td data-label="Zahlungseingang">${zahlungHtml}</td>
        <td data-label="Gesamtbetrag" class="number-cell ${betragStatus}">${formatGeld(rechnung.gesamtbetrag)}</td>
        <td data-label="Aktion" class="action-cell">
          <button class="action-btn edit-btn" type="button" data-aktion="bearbeiten" data-id="${rechnung.id}" title="Bearbeiten" aria-label="Bearbeiten"></button>
          <button class="action-btn invoice-pdf-btn" type="button" data-aktion="pdf" data-id="${rechnung.id}" title="PDF speichern" aria-label="PDF speichern">PDF</button>
          <button class="action-btn delete-btn" type="button" data-aktion="loeschen" data-id="${rechnung.id}" title="Löschen" aria-label="Löschen"></button>
        </td>`;
      body.appendChild(row);
  }

  function renderKleinZeile(body, abschuss) {
    const row = document.createElement("tr");
    row.dataset.id = abschuss.id;
    row.dataset.typ = "klein";
    const darfBearbeiten = BerechtigungService.darf("rechnungen", "Bearbeiten");
    const zahlungAnzeige = abschuss.zahlungseingang
      ? formatDatum(abschuss.zahlungseingang) : "Zahlung erfassen";
    const zahlungHtml = darfBearbeiten
      ? `<button class="invoice-payment-button${abschuss.zahlungseingang ? "" : " invoice-payment-unpaid"}" type="button" data-aktion="zahlung-klein" data-id="${abschuss.id}" title="Zahlungseingang erfassen oder ändern">${escapeHtml(zahlungAnzeige)}</button>`
      : escapeHtml(abschuss.zahlungseingang ? zahlungAnzeige : "–");
    const status = InvoiceStatus.klasseFuerAbschuss({ ...abschuss, rechnung_vorhanden: false });
    const wild = [abschuss.wildgruppen?.bezeichnung, abschuss.wildklassen?.bezeichnung]
      .filter(Boolean).join(" – ");
    row.innerHTML = `
      <td data-label="Rechnungsnummer"><strong class="invoice-klein-label">Keine Rechnung – Klein</strong></td>
      <td data-label="Datum">${formatDatum(abschuss.datum)}</td>
      <td data-label="Empfänger / Abnehmer">${escapeHtml(abschuss.wildhaendler?.bezeichnung || "Klein")}</td>
      <td data-label="Abschuss Nr.">${escapeHtml(`${abschuss.nr}/${abschuss.jahr}`)}</td>
      <td data-label="Wild">${escapeHtml(wild)}</td>
      <td data-label="Zahlungseingang">${zahlungHtml}</td>
      <td data-label="Gesamtbetrag" class="number-cell ${status}">${formatGeld(abschuss.gesamtpreis)}</td>
      <td data-label="Aktion" class="action-cell"><span class="invoice-no-actions">–</span></td>`;
    body.appendChild(row);
  }

  function gefilterteEintraege() {
    const jahrFilter = el("reJahrFilter")?.value || String(new Date().getFullYear());
    const typFilter = el("reTypFilter")?.value || "alle";
    const zahlungsFilter = el("reZahlungsFilter")?.value || "alle";
    const eintraege = [
      ...rechnungen.map((datensatz) => ({ typ: "rechnung", datensatz,
        datum: datensatz.rechnungsdatum,
        jahr: String(datensatz.rechnungsjahr || String(datensatz.rechnungsdatum || "").slice(0, 4)),
        bezahlt: InvoiceStatus.istRechnungBezahlt(datensatz) })),
      ...kleinAbschuesse.map((datensatz) => ({ typ: "klein", datensatz,
        datum: datensatz.datum,
        jahr: String(datensatz.jahr || String(datensatz.datum || "").slice(0, 4)),
        bezahlt: Boolean(datensatz.zahlungseingang) })),
    ];
    return eintraege.filter((eintrag) =>
      (jahrFilter === "alle" || eintrag.jahr === jahrFilter) &&
      (typFilter === "alle" || eintrag.typ === typFilter) &&
      (zahlungsFilter === "alle" ||
        (zahlungsFilter === "bezahlt" ? eintrag.bezahlt : !eintrag.bezahlt)))
      .sort((a, b) => String(b.datum || "").localeCompare(String(a.datum || "")));
  }

  function jahresfilterAktualisieren() {
    const select = el("reJahrFilter");
    const aktuellesJahr = String(new Date().getFullYear());
    const vorherigerWert = select.value;
    const jahre = [...new Set([
      ...rechnungen.map((rechnung) => String(rechnung.rechnungsjahr ||
        String(rechnung.rechnungsdatum || "").slice(0, 4))),
      ...kleinAbschuesse.map((abschuss) => String(abschuss.jahr ||
        String(abschuss.datum || "").slice(0, 4))),
      aktuellesJahr,
    ].filter((jahr) => /^\d{4}$/.test(jahr)))].sort((a, b) => Number(b) - Number(a));
    select.innerHTML = '<option value="alle">Alle Jahre</option>' + jahre
      .map((jahr) => `<option value="${jahr}">${jahr}</option>`).join("");
    const sollwert = vorherigerWert && [...select.options]
      .some((option) => option.value === vorherigerWert) ? vorherigerWert : aktuellesJahr;
    select.value = sollwert;
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
    if (aktion === "zahlung") return zahlungOeffnen(id);
    if (aktion === "zahlung-klein") return zahlungKleinOeffnen(id);
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

  function gemeinsamerZahlungseingang(rechnung) {
    const positionen = rechnung?.positionen || [];
    const daten = positionen.map((position) => position.abschuss?.zahlungseingang || null);
    if (!daten.length || daten.every((datum) => !datum)) return { datum: null, uneinheitlich: false };
    const erstesDatum = daten[0];
    const einheitlich = Boolean(erstesDatum) && daten.every((datum) => datum === erstesDatum);
    return { datum: einheitlich ? erstesDatum : null, uneinheitlich: !einheitlich };
  }

  function heuteLokal() {
    const heute = new Date();
    const zweistellig = (wert) => String(wert).padStart(2, "0");
    return `${heute.getFullYear()}-${zweistellig(heute.getMonth() + 1)}-${zweistellig(heute.getDate())}`;
  }

  function zahlungOeffnen(id) {
    if (!BerechtigungService.darf("rechnungen", "Bearbeiten")) return;
    const rechnung = rechnungen.find((eintrag) => String(eintrag.id) === String(id));
    if (!rechnung) return;
    const zahlung = gemeinsamerZahlungseingang(rechnung);
    zahlungRechnungId = rechnung.id;
    zahlungDatensatzTyp = "rechnung";
    el("reZahlungDatum").value = zahlung.datum || heuteLokal();
    el("reZahlungEntfernen").hidden = !zahlung.datum && !zahlung.uneinheitlich;
    el("reZahlungFehler").hidden = true;
    const modal = el("reZahlungModal");
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      modal.classList.add("is-open");
      el("reZahlungDatum").focus();
    });
  }

  function zahlungKleinOeffnen(id) {
    if (!BerechtigungService.darf("rechnungen", "Bearbeiten")) return;
    const abschuss = kleinAbschuesse.find((eintrag) => String(eintrag.id) === String(id));
    if (!abschuss) return;
    zahlungRechnungId = abschuss.id;
    zahlungDatensatzTyp = "klein";
    el("reZahlungDatum").value = abschuss.zahlungseingang || heuteLokal();
    el("reZahlungEntfernen").hidden = !abschuss.zahlungseingang;
    el("reZahlungFehler").hidden = true;
    const modal = el("reZahlungModal");
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      modal.classList.add("is-open");
      el("reZahlungDatum").focus();
    });
  }

  async function zahlungSpeichern(entfernen) {
    if (!zahlungRechnungId || !BerechtigungService.darf("rechnungen", "Bearbeiten")) return;
    const datum = entfernen ? null : el("reZahlungDatum").value;
    if (!entfernen && !datum) {
      zahlungFehler("Bitte ein Zahlungseingangsdatum auswählen.");
      return;
    }
    const speichernButton = el("reZahlungSpeichern");
    const entfernenButton = el("reZahlungEntfernen");
    speichernButton.disabled = true;
    entfernenButton.disabled = true;
    try {
      const rechnungId = zahlungRechnungId;
      if (zahlungDatensatzTyp === "klein") {
        await RechnungService.kleinZahlungseingangSetzen(rechnungId, datum);
      } else {
        await RechnungService.zahlungseingangSetzen(rechnungId, datum);
      }
      await laden();
      zahlungSchliessen();
      AppFeedback.success(entfernen ? "Zahlungseingang wurde entfernt." : "Zahlungseingang wurde gespeichert.");
      AppFeedback.focusRow(`#reTabelleBody tr[data-id="${rechnungId}"]`);
    } catch (error) {
      console.error("Zahlungseingang speichern:", error);
      zahlungFehler(error.message || "Der Zahlungseingang konnte nicht gespeichert werden.");
    } finally {
      speichernButton.disabled = false;
      entfernenButton.disabled = false;
    }
  }

  async function zahlungEntfernen() {
    if (!window.confirm("Zahlungseingangsdatum wirklich entfernen?")) return;
    await zahlungSpeichern(true);
  }

  function zahlungSchliessen() {
    const modal = el("reZahlungModal");
    modal.classList.remove("is-open");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    zahlungRechnungId = null;
    zahlungDatensatzTyp = null;
  }

  function zahlungFehler(text) {
    el("reZahlungFehler").textContent = text;
    el("reZahlungFehler").hidden = false;
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
