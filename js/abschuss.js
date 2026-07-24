window.Abschuss = (() => {
  let abschuesse = [];
  let aktuell = null;
  let nummerJahr = null;
  let jaegerDropdown;
  let wildgruppeDropdown;
  let wildklasseDropdown;
  let wildhaendlerDropdown;
  const el = (id) => document.getElementById(id);

  async function init() {
    el("asNeu").disabled = true;

    jaegerDropdown = new SearchDropdown(el("asJaeger"), {
      placeholder: "Jäger suchen",
    });
    wildgruppeDropdown = new SearchDropdown(el("asWildgruppe"), {
      placeholder: "Wildgruppe suchen",
      onChange: wildgruppeGeaendert,
    });
    wildklasseDropdown = new SearchDropdown(el("asWildklasse"), {
      placeholder: "Zuerst Wildgruppe wählen",
      disabled: true,
    });
    wildhaendlerDropdown = new SearchDropdown(el("asWildhaendler"), {
      placeholder: "Wildhändler suchen",
      onChange: wildhaendlerGeaendert,
    });

    el("asNeu").addEventListener("click", neu);
    el("asSpeichern").addEventListener("click", speichern);
    el("asAbbrechen").addEventListener("click", abbrechen);
    el("asSchliessen").addEventListener("click", schliessen);
    el("asDetailEdit").addEventListener("click", () =>
      DetailMode.setMode(el("asModal"), "edit"),
    );
    el("asDetailDelete").addEventListener("click", () => {
      if (aktuell) loeschen(aktuell);
    });
    el("asSchliessen").addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") schliessen();
    });
    el("asModal").addEventListener("click", (event) => {
      if (event.target === el("asModal")) schliessen();
    });
    el("asTabelleBody").addEventListener("click", tabellenAktion);
    el("asGewicht").addEventListener("input", berechneGesamtpreis);
    el("asPreis").addEventListener("input", berechneGesamtpreis);
    el("asFallwild").addEventListener("change", fallwildGeaendert);
    el("asDatum").addEventListener("change", datumGeaendert);

    try {
      await Promise.all([ladeStammdaten(), laden()]);
    } finally {
      el("asNeu").disabled = false;
    }
  }

  async function ladeStammdaten() {
    const ergebnisse = await Promise.allSettled([
      ladeJaeger(),
      ladeWildgruppen(),
      ladeWildhaendler(),
    ]);

    const fehler = ergebnisse.filter((ergebnis) => ergebnis.status === "rejected");
    if (fehler.length) {
      fehler.forEach((ergebnis) =>
        console.error("Stammdaten konnten nicht geladen werden:", ergebnis.reason),
      );
      alert("Ein Teil der benötigten Stammdaten konnte nicht geladen werden.");
    }
  }

  async function ladeJaeger() {
      const jaeger = await AbschussService.getJaeger();
      jaegerDropdown.setOptions(
        jaeger.map((person) => ({
          value: person.id,
          label: [person.vorname, person.nachname].filter(Boolean).join(" "),
          data: person,
        })),
      );
  }

  async function ladeWildgruppen() {
    const gruppen = await AbschussplanService.getWildgruppen();
    wildgruppeDropdown.setOptions(gruppen);
  }

  async function ladeWildhaendler() {
    const wildhaendler = await AbschussService.getAktiveWildhaendler();
    wildhaendlerDropdown.setOptions(wildhaendler);
  }

  async function laden() {
    try {
      abschuesse = await AbschussService.getAbschuesse();
      rendern();
    } catch (error) {
      console.error("Abschüsse konnten nicht geladen werden:", error);
      abschuesse = [];
      rendern();
      alert("Die Abschüsse konnten nicht geladen werden. Bitte versuchen Sie es erneut.");
    }
  }

  function rendern() {
    const body = el("asTabelleBody");
    body.innerHTML = "";
    abschuesse.forEach((abschuss) => {
      const row = document.createElement("tr");
      row.dataset.id = abschuss.id;
      const werte = [
        abschuss.nr,
        formatDatum(abschuss.datum),
        [abschuss.jaeger?.vorname, abschuss.jaeger?.nachname]
          .filter(Boolean)
          .join(" "),
        abschuss.wildgruppen?.bezeichnung,
        abschuss.wildklassen?.bezeichnung,
        abschuss.gewicht == null ? "—" : formatZahl(abschuss.gewicht) + " kg",
        abschuss.preis_pro_kg == null ? "—" : formatGeld(abschuss.preis_pro_kg),
        formatGeld(abschuss.gesamtpreis),
        abschuss.wildhaendler?.bezeichnung,
        abschuss.fallwild ? "Ja" : "Nein",
      ];
      werte.forEach((wert) => {
        const cell = document.createElement("td");
        cell.textContent = wert ?? "";
        row.appendChild(cell);
      });
      const actions = document.createElement("td");
      actions.className = "action-cell";
      actions.innerHTML =
        `<button class="action-btn edit-btn" type="button" data-aktion="bearbeiten" data-id="${abschuss.id}" title="Bearbeiten" aria-label="Bearbeiten"></button>` +
        `<button class="action-btn delete-btn" type="button" data-aktion="loeschen" data-id="${abschuss.id}" title="Löschen" aria-label="Löschen"></button>`;
      row.appendChild(actions);
      body.appendChild(row);
    });
  }

  function formatDatum(value) {
    if (!value) return "";
    const [jahr, monat, tag] = value.split("-");
    return `${tag}.${monat}.${jahr}`;
  }

  function formatZahl(value) {
    return Number(value || 0).toLocaleString("de-AT", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  function formatGeld(value) {
    return Number(value || 0).toLocaleString("de-AT", {
      style: "currency", currency: "EUR",
    });
  }

  async function wildgruppeGeaendert(option) {
    wildklasseDropdown.clear(false);
    wildklasseDropdown.setOptions([]);
    wildklasseDropdown.setDisabled(true);
    if (!option) return;
    try {
      const klassen = await AbschussplanService.getWildklassen(
        option.value,
        true,
      );
      wildklasseDropdown.setOptions(klassen);
      wildklasseDropdown.setDisabled(false);
    } catch (error) {
      console.error("Wildklassen konnten nicht geladen werden:", error);
      meldung("Die Wildklassen konnten nicht geladen werden.");
    }
  }

  function wildhaendlerGeaendert(option, preisUebernehmen = true) {
    const kleinWildhaendler =
      option && option.label.trim().toLocaleLowerCase("de") === "klein wildhändler";
    el("asProtokollGruppe").hidden = !kleinWildhaendler;
    const protokollLabel = el("asProtokollGruppe").querySelector("label");
    protokollLabel.classList.toggle(
      "required",
      Boolean(kleinWildhaendler),
    );
    if (!kleinWildhaendler) el("asProtokoll").value = "";

    if (preisUebernehmen) {
      const preis = option ? Number(option.data?.preis_pro_kg || 0) : null;
      el("asPreis").value =
        preis === null || !Number.isFinite(preis) ? "" : preis.toFixed(2);
      berechneGesamtpreis();
    }
  }

  function berechneGesamtpreis() {
    if (el("asFallwild").checked) {
      el("asGesamtpreis").value = "0.00";
      return;
    }

    const gewicht = Number(el("asGewicht").value);
    const preis = Number(el("asPreis").value);
    el("asGesamtpreis").value =
      Number.isFinite(gewicht) && Number.isFinite(preis)
        ? (gewicht * preis).toFixed(2)
        : "0.00";
  }

  function fallwildGeaendert() {
    const istFallwild = el("asFallwild").checked;
    el("asGewicht").closest(".form-group")
      .querySelector("label").classList.toggle("required", !istFallwild);
    el("asWildhaendlerLabel").classList.toggle("required", !istFallwild);

    if (istFallwild) {
      el("asGesamtpreis").value = "0.00";
    } else {
      berechneGesamtpreis();
    }

    wildhaendlerGeaendert(wildhaendlerDropdown.getSelected(), false);
  }

  function tabellenAktion(event) {
    const button = event.target.closest("[data-aktion]");
    if (!button) {
      const row = event.target.closest("tr[data-id]");
      if (row) bearbeiten(row.dataset.id, "read");
      return;
    }
    const abschuss = abschuesse.find((item) => String(item.id) === button.dataset.id);
    if (!abschuss) return;
    if (button.dataset.aktion === "bearbeiten") bearbeiten(abschuss.id);
    else loeschen(abschuss);
  }

  async function neu() {
    aktuell = null;
    nummerJahr = null;
    el("asModalTitel").textContent = "Neuer Abschuss";
    formularLeeren();
    el("asDatum").value = new Date().toISOString().slice(0, 10);
    await datumGeaendert();
    DetailMode.setMode(el("asModal"), "edit");
    oeffnen();
  }

  async function datumGeaendert() {
    if (aktuell) return;

    const datum = el("asDatum").value;
    const jahr = datum ? Number(datum.slice(0, 4)) : null;
    if (!jahr || jahr === nummerJahr) return;

    nummerJahr = jahr;
    try {
      el("asNr").value =
        await AbschussService.getNaechsteAbschussnummer(jahr);
    } catch (error) {
      console.error("Abschussnummer konnte nicht ermittelt werden:", error);
      nummerJahr = null;
      meldung(
        "Die nächste Abschussnummer konnte nicht ermittelt werden. Bitte geben Sie die Nummer manuell ein.",
        el("asNr"),
      );
    }
  }

  async function bearbeiten(id, mode = "edit") {
    el("asFehler").hidden = true;
    try {
      const abschuss = await AbschussService.getAbschuss(id);
      aktuell = abschuss;
      nummerJahr = abschuss.datum
        ? Number(String(abschuss.datum).slice(0, 4))
        : null;
      el("asModalTitel").textContent =
        mode === "read" ? "Abschuss" : "Abschuss bearbeiten";
      formularLeeren();
      el("asNr").value = abschuss.nr || "";
      el("asDatum").value = abschuss.datum || "";
      jaegerDropdown.setValue(abschuss.jaeger_id, false);
      el("asGewicht").value = abschuss.gewicht ?? "";
      el("asPreis").value = abschuss.preis_pro_kg ?? "";
      el("asGesamtpreis").value = abschuss.gesamtpreis ?? "0.00";
      el("asZahlungseingang").value = abschuss.zahlungseingang || "";
      el("asZusatzinfo").value = abschuss.zusatzinfo || "";
      el("asBemerkung").value = abschuss.bemerkung || "";
      el("asFallwild").checked = abschuss.fallwild === true;
      wildgruppeDropdown.setValue(abschuss.wildgruppe_id, false);
      const klassen = await AbschussplanService.getWildklassen(
        abschuss.wildgruppe_id,
        true,
      );
      wildklasseDropdown.setOptions(klassen);
      wildklasseDropdown.setDisabled(false);
      wildklasseDropdown.setValue(abschuss.wildklasse_id, false);
      wildhaendlerDropdown.setValue(abschuss.wildhaendler_id, false);
      wildhaendlerGeaendert(wildhaendlerDropdown.getSelected(), false);
      el("asProtokoll").value = abschuss.untersuchungsprotokoll_nr || "";
      fallwildGeaendert();
      DetailMode.setMode(el("asModal"), mode, {
        capture: mode === "edit",
      });
      oeffnen();
    } catch (error) {
      console.error("Abschuss konnte nicht geladen werden:", error);
      alert("Der Abschuss konnte nicht geladen werden.");
    }
  }

  function formularLeeren() {
    ["asNr", "asDatum", "asGewicht", "asPreis", "asGesamtpreis",
      "asZahlungseingang", "asZusatzinfo", "asBemerkung", "asProtokoll"]
      .forEach((id) => { el(id).value = ""; });
    el("asFallwild").checked = false;
    jaegerDropdown.clear(false);
    wildgruppeDropdown.clear(false);
    wildklasseDropdown.clear(false);
    wildklasseDropdown.setOptions([]);
    wildklasseDropdown.setDisabled(true);
    wildhaendlerDropdown.clear(false);
    el("asProtokollGruppe").hidden = true;
    el("asFehler").hidden = true;
    fallwildGeaendert();
  }

  function oeffnen() {
    el("asModal").style.display = "block";
    el("asModal").setAttribute("aria-hidden", "false");
    el("asNr").focus();
  }

  function schliessen() {
    el("asModal").style.display = "none";
    el("asModal").setAttribute("aria-hidden", "true");
    aktuell = null;
    nummerJahr = null;
  }

  function abbrechen() {
    if (aktuell) {
      DetailMode.cancel(el("asModal"));
      fallwildGeaendert();
      return;
    }
    schliessen();
  }

  function meldung(text, fokus) {
    el("asFehler").textContent = text;
    el("asFehler").hidden = false;
    if (fokus) fokus.focus();
    return false;
  }

  function validieren(daten) {
    if (!daten.nr) return meldung("Bitte eine Nummer eingeben.", el("asNr"));
    if (!Number.isInteger(Number(daten.nr)) || Number(daten.nr) <= 0)
      return meldung("Bitte eine positive ganze Abschussnummer eingeben.", el("asNr"));
    if (!daten.datum) return meldung("Bitte ein Datum auswählen.", el("asDatum"));
    if (!daten.jaeger_id)
      return meldung("Bitte einen Jäger auswählen.", jaegerDropdown.input);
    if (!daten.wildgruppe_id) return meldung("Bitte eine Wildgruppe auswählen.", wildgruppeDropdown.input);
    if (!daten.wildklasse_id) return meldung("Bitte eine passende Wildklasse auswählen.", wildklasseDropdown.input);
    if (!daten.fallwild &&
        (!Number.isFinite(daten.gewicht) || daten.gewicht <= 0))
      return meldung("Bitte ein gültiges Gewicht größer als 0 eingeben.", el("asGewicht"));
    if (daten.fallwild && daten.gewicht !== null &&
        (!Number.isFinite(daten.gewicht) || daten.gewicht <= 0))
      return meldung("Bitte ein gültiges Gewicht größer als 0 eingeben.", el("asGewicht"));
    if (!daten.fallwild && !daten.wildhaendler_id)
      return meldung("Bitte einen Wildhändler auswählen.", wildhaendlerDropdown.input);
    if (!el("asProtokollGruppe").hidden &&
        !daten.untersuchungsprotokoll_nr)
      return meldung("Bitte die Untersuchungsprotokoll Nr eingeben.", el("asProtokoll"));
    return true;
  }

  async function speichern() {
    berechneGesamtpreis();
    const preisText = el("asPreis").value;
    const daten = {
      nr: Number(el("asNr").value),
      datum: el("asDatum").value,
      jaeger_id: jaegerDropdown.getValue(),
      wildgruppe_id: wildgruppeDropdown.getValue(),
      wildklasse_id: wildklasseDropdown.getValue(),
      gewicht: el("asGewicht").value === ""
        ? null
        : Number(el("asGewicht").value),
      preis_pro_kg: preisText === "" ? null : Number(preisText),
      gesamtpreis: Number(el("asGesamtpreis").value || 0),
      wildhaendler_id: wildhaendlerDropdown.getValue(),
      zahlungseingang: el("asZahlungseingang").value || null,
      zusatzinfo: el("asZusatzinfo").value.trim() || null,
      bemerkung: el("asBemerkung").value.trim() || null,
      fallwild: el("asFallwild").checked,
      untersuchungsprotokoll_nr: el("asProtokoll").value.trim() || null,
    };
    el("asFehler").hidden = true;
    if (!validieren(daten)) return;
    if (daten.preis_pro_kg !== null &&
        (!Number.isFinite(daten.preis_pro_kg) || daten.preis_pro_kg < 0)) {
      return meldung("Bitte einen gültigen Preis eingeben.", el("asPreis"));
    }

    const jahr = Number(daten.datum.slice(0, 4));

    el("asSpeichern").disabled = true;
    try {
      const vergeben = await AbschussService.istAbschussnummerVergeben(
        jahr,
        daten.nr,
        aktuell && aktuell.id,
      );
      if (vergeben) {
        meldung(
          `Die Abschussnummer ${daten.nr} ist im Jahr ${jahr} bereits vergeben.`,
          el("asNr"),
        );
        return;
      }

      if (aktuell) await AbschussService.updateAbschuss(aktuell.id, daten);
      else await AbschussService.createAbschuss(daten);
      schliessen();
      await laden();
    } catch (error) {
      console.error("Abschuss konnte nicht gespeichert werden:", error);
      meldung(error.code === "23505"
        ? `Die Abschussnummer ${daten.nr} ist im Jahr ${jahr} bereits vergeben.`
        : "Der Abschuss konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    } finally {
      el("asSpeichern").disabled = false;
    }
  }

  async function loeschen(abschuss) {
    if (!confirm(`Abschuss Nr. "${abschuss.nr}" löschen?`)) return;
    try {
      await AbschussService.deleteAbschuss(abschuss.id);
      await laden();
    } catch (error) {
      console.error("Abschuss konnte nicht gelöscht werden:", error);
      alert("Der Abschuss konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.");
    }
  }

  return { init };
})();
