window.Abschuss = (() => {
  let abschuesse = [];
  let aktuell = null;
  let nummerJahr = null;
  let jaegerDropdown;
  let wildgruppeDropdown;
  let wildklasseDropdown;
  let wildhaendlerDropdown;
  let jaeger = [];
  let wildgruppen = [];
  let wildhaendler = [];
  let planWildklassen = [];
  let nichtPlanWildklassen = [];
  let planWildklasseIds = new Set();
  let erfassungsmodus = "plan";
  let filterInitialisiert = false;
  let aktuelleFilter = null;
  const el = (id) => document.getElementById(id);
  const aktuellesJahr = String(new Date().getFullYear());

  async function init(modus = "plan") {
    erfassungsmodus = modus === "ausserhalb-plan" ? "ausserhalb-plan" : "plan";
    filterInitialisiert = false;
    const seitenTitel = document.querySelector(".abschuss-page h1");
    if (seitenTitel) {
      seitenTitel.textContent = erfassungsmodus === "plan"
        ? "Abschuss"
        : "Haar- und Federwild";
    }
    const reduzierteAnsicht = erfassungsmodus === "ausserhalb-plan";
    ["asGewichtGruppe", "asPreisGruppe", "asGesamtpreisGruppe",
      "asWildhaendlerGruppe", "asZahlungseingangGruppe"]
      .forEach((id) => { el(id).hidden = reduzierteAnsicht; });
    tabelleKonfigurieren();
    el("asNeu").disabled = true;
    let initialisierungErfolgreich = false;

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
    el("asSuche").addEventListener("input", rendern);
    ["asFilterJahr", "asFilterWildgruppe", "asFilterJaeger",
      "asFilterWildhaendler", "asFilterFallwild"]
      .forEach((id) => el(id).addEventListener("change", rendern));
    document.querySelector(".abschuss-quick-filters")
      .addEventListener("click", schnellfilter);

    filterZuruecksetzen(false);

    try {
      await ladePlanfreigaben();
      await Promise.all([ladeStammdaten(), laden()]);
      filterOptionenAufbauen();
      rendern();
      initialisierungErfolgreich = true;
    } catch (error) {
      console.error("Planfreigaben konnten nicht geladen werden:", error);
      alert(
        "Die Wildklassen der aktiven Planperiode konnten nicht geladen werden.",
      );
    } finally {
      el("asNeu").disabled = !initialisierungErfolgreich;
    }
  }

  async function ladePlanfreigaben() {
    planWildklassen = await WildklassenService.getAktivePlanWildklassen();
    planWildklasseIds = new Set(
      planWildklassen.map((wildklasse) => String(wildklasse.id)),
    );
    const aktiveWildklassen = await WildklassenService.getAktiveWildklassen();
    nichtPlanWildklassen = aktiveWildklassen.filter(
      (wildklasse) => !planWildklasseIds.has(String(wildklasse.id)),
    );
  }

  function abschuesseFuerModul() {
    return abschuesse.filter((abschuss) => {
      const istPlanrelevant = planWildklasseIds.has(
        String(abschuss.wildklasse_id),
      );
      return erfassungsmodus === "plan" ? istPlanrelevant : !istPlanrelevant;
    });
  }

  async function wildklassenFuerModul(wildgruppeId) {
    if (erfassungsmodus === "plan") {
      return planWildklassen.filter(
        (wildklasse) =>
          String(wildklasse.wildgruppe_id) === String(wildgruppeId),
      );
    }
    return nichtPlanWildklassen.filter(
      (wildklasse) =>
        String(wildklasse.wildgruppe_id) === String(wildgruppeId),
    );
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
      jaeger = await AbschussService.getJaeger();
      jaegerDropdown.setOptions(
        jaeger.map((person) => ({
          value: person.id,
          label: [person.vorname, person.nachname].filter(Boolean).join(" "),
          data: person,
        })),
      );
  }

  async function ladeWildgruppen() {
    wildgruppen = await WildklassenService.getWildgruppen();
    const erlaubteWildgruppen = new Set(
      (erfassungsmodus === "plan" ? planWildklassen : nichtPlanWildklassen)
        .map((wildklasse) => String(wildklasse.wildgruppe_id)),
    );
    wildgruppen = wildgruppen.filter((wildgruppe) =>
      erlaubteWildgruppen.has(String(wildgruppe.id)));
    wildgruppeDropdown.setOptions(wildgruppen);
  }

  async function ladeWildhaendler() {
    wildhaendler = await AbschussService.getAktiveWildhaendler();
    wildhaendlerDropdown.setOptions(wildhaendler);
  }

  async function laden() {
    try {
      abschuesse = await AbschussService.getAbschuesse();
      filterOptionenAufbauen();
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
    aktuelleFilter = {
      search: el("asSuche").value,
      jahr: el("asFilterJahr").value,
      wildgruppeId: el("asFilterWildgruppe").value,
      jaegerId: el("asFilterJaeger").value,
      wildhaendlerId: el("asFilterWildhaendler").value,
      fallwild: el("asFilterFallwild").value,
    };
    const modulAbschuesse = abschuesseFuerModul();
    const gefiltert = ClientFilter.filter(modulAbschuesse, {
      search: aktuelleFilter.search,
      searchFields: [
        (item) => item.nr,
        (item) => [item.datum, formatDatum(item.datum)],
        (item) => item.jaeger?.vorname,
        (item) => item.jaeger?.nachname,
        (item) => item.wildgruppen?.bezeichnung,
        (item) => item.wildklassen?.bezeichnung,
        (item) => item.wildhaendler?.bezeichnung,
        (item) => item.zusatzinfo,
        (item) => item.bemerkung,
        (item) => item.untersuchungsprotokoll_nr,
      ],
      predicates: [
        (item) => !aktuelleFilter.jahr ||
          String(item.datum || "").slice(0, 4) === aktuelleFilter.jahr,
        (item) => !aktuelleFilter.wildgruppeId ||
          String(item.wildgruppe_id) === aktuelleFilter.wildgruppeId,
        (item) => !aktuelleFilter.jaegerId ||
          String(item.jaeger_id) === aktuelleFilter.jaegerId,
        (item) => !aktuelleFilter.wildhaendlerId ||
          String(item.wildhaendler_id) === aktuelleFilter.wildhaendlerId,
        (item) => !aktuelleFilter.fallwild ||
          String(item.fallwild === true) === aktuelleFilter.fallwild,
      ],
    });

    gefiltert.forEach((abschuss) => {
      const row = document.createElement("tr");
      row.dataset.id = abschuss.id;
      const gewichtFehlt =
        abschuss.gewicht === null || abschuss.gewicht === undefined ||
        abschuss.gewicht === "";
      const wildhaendlerFehlt = !abschuss.wildhaendler_id;
      row.classList.toggle(
        "abschuss-missing-data",
        erfassungsmodus === "plan" && !abschuss.fallwild &&
          gewichtFehlt && wildhaendlerFehlt,
      );
      tabellenSpalten().forEach((spalte) => {
        const cell = document.createElement("td");
        cell.textContent = spalte.wert(abschuss) ?? "";
        cell.dataset.label = spalte.label;
        row.appendChild(cell);
      });
      const actions = document.createElement("td");
      actions.className = "action-cell";
      actions.dataset.label = "Aktionen";
      actions.innerHTML =
        `<button class="action-btn edit-btn" type="button" data-aktion="bearbeiten" data-id="${abschuss.id}" title="Bearbeiten" aria-label="Bearbeiten"></button>` +
        `<button class="action-btn delete-btn" type="button" data-aktion="loeschen" data-id="${abschuss.id}" title="Löschen" aria-label="Löschen"></button>`;
      row.appendChild(actions);
      body.appendChild(row);
    });
    el("asFilterStatus").textContent =
      `${gefiltert.length} von ${modulAbschuesse.length} Abschüssen angezeigt`;
  }

  function tabellenSpalten() {
    const basis = [
      {
        label: erfassungsmodus === "ausserhalb-plan" ? "Nr" : "Nr.",
        wert: (abschuss) => abschuss.nr,
      },
      { label: "Datum", wert: (abschuss) => formatDatum(abschuss.datum) },
      {
        label: "Jäger",
        wert: (abschuss) =>
          [abschuss.jaeger?.vorname, abschuss.jaeger?.nachname]
            .filter(Boolean).join(" "),
      },
      {
        label: "Wildgruppe",
        wert: (abschuss) => abschuss.wildgruppen?.bezeichnung,
      },
      {
        label: "Wildklasse",
        wert: (abschuss) => abschuss.wildklassen?.bezeichnung,
      },
    ];
    if (erfassungsmodus === "ausserhalb-plan") {
      return basis.concat([
        { label: "Zusatzinfo", wert: (abschuss) => abschuss.zusatzinfo },
        { label: "Bemerkung", wert: (abschuss) => abschuss.bemerkung },
        { label: "Fallwild", wert: (abschuss) => abschuss.fallwild ? "Ja" : "Nein" },
      ]);
    }
    return basis.concat([
      {
        label: "Gewicht",
        wert: (abschuss) =>
          abschuss.gewicht == null ? "—" : `${formatZahl(abschuss.gewicht)} kg`,
      },
      {
        label: "Preis/kg",
        wert: (abschuss) =>
          abschuss.preis_pro_kg == null ? "—" : formatGeld(abschuss.preis_pro_kg),
      },
      { label: "Gesamtpreis", wert: (abschuss) => formatGeld(abschuss.gesamtpreis) },
      {
        label: "Wildhändler",
        wert: (abschuss) => abschuss.wildhaendler?.bezeichnung,
      },
      { label: "Fallwild", wert: (abschuss) => abschuss.fallwild ? "Ja" : "Nein" },
    ]);
  }

  function tabelleKonfigurieren() {
    const kopf = el("asTabelleKopf");
    kopf.innerHTML = "";
    tabellenSpalten().forEach((spalte, index) => {
      const th = document.createElement("th");
      th.textContent = spalte.label;
      if (index === 0) th.className = "col-number";
      if (spalte.label === "Datum") th.className = "col-date";
      if (spalte.label === "Fallwild") th.className = "col-boolean";
      kopf.appendChild(th);
    });
    const aktionen = document.createElement("th");
    aktionen.className = "col-actions";
    aktionen.textContent =
      erfassungsmodus === "ausserhalb-plan" ? "Aktionen" : "Aktion";
    kopf.appendChild(aktionen);
  }

  function selectFuellen(select, label, options) {
    const value = select.value;
    select.innerHTML = "";
    const alle = document.createElement("option");
    alle.value = "";
    alle.textContent = `${label}: Alle`;
    select.appendChild(alle);
    options.forEach((option) => {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    });
    select.value = Array.from(select.options).some((option) => option.value === value)
      ? value
      : "";
  }

  function filterOptionenAufbauen() {
    const modulAbschuesse = abschuesseFuerModul();
    const jahre = ClientFilter.uniqueOptions(
      modulAbschuesse,
      (item) => String(item.datum || "").slice(0, 4),
      (item) => String(item.datum || "").slice(0, 4),
      (a, b) => Number(b.value) - Number(a.value),
    );
    if (!jahre.some((option) => option.value === aktuellesJahr)) {
      jahre.push({ value: aktuellesJahr, label: aktuellesJahr });
      jahre.sort((a, b) => Number(b.value) - Number(a.value));
    }
    selectFuellen(el("asFilterJahr"), "Jahr", jahre);
    selectFuellen(el("asFilterWildgruppe"), "Wildgruppe",
      ClientFilter.uniqueOptions(wildgruppen, (item) => item.id,
        (item) => item.label || item.bezeichnung));
    selectFuellen(el("asFilterJaeger"), "Jäger",
      ClientFilter.uniqueOptions(jaeger, (item) => item.id,
        (item) => [item.vorname, item.nachname].filter(Boolean).join(" "),
        (a, b) => {
          const personA = jaeger.find((item) => String(item.id) === a.value) || {};
          const personB = jaeger.find((item) => String(item.id) === b.value) || {};
          return String(personA.nachname || "").localeCompare(
            String(personB.nachname || ""), "de", { sensitivity: "base" },
          ) || a.label.localeCompare(b.label, "de", { sensitivity: "base" });
        }));
    selectFuellen(el("asFilterWildhaendler"), "Wildhändler",
      ClientFilter.uniqueOptions(wildhaendler, (item) => item.id,
        (item) => item.label || item.bezeichnung));
    if (!filterInitialisiert) {
      el("asFilterJahr").value = aktuellesJahr;
      filterInitialisiert = true;
    }
  }

  function filterZuruecksetzen(render = true) {
    el("asSuche").value = "";
    el("asFilterJahr").value = aktuellesJahr;
    el("asFilterWildgruppe").value = "";
    el("asFilterJaeger").value = "";
    el("asFilterWildhaendler").value = "";
    el("asFilterFallwild").value = "false";
    if (render) rendern();
  }

  function schnellfilter(event) {
    const button = event.target.closest("[data-as-quick]");
    if (!button) return;
    if (button.dataset.asQuick === "current-year")
      el("asFilterJahr").value = aktuellesJahr;
    if (button.dataset.asQuick === "no-fallwild")
      el("asFilterFallwild").value = "false";
    if (button.dataset.asQuick === "all-years")
      el("asFilterJahr").value = "";
    if (button.dataset.asQuick === "reset") {
      filterZuruecksetzen();
      return;
    }
    rendern();
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
      const klassen =
        await wildklassenFuerModul(option.value);
      wildklasseDropdown.setOptions(klassen);
      wildklasseDropdown.setDisabled(!klassen.length);
    } catch (error) {
      console.error("Wildklassen konnten nicht geladen werden:", error);
      meldung("Die Wildklassen konnten nicht geladen werden.");
    }
  }

  function wildhaendlerGeaendert(option, preisUebernehmen = true) {
    const kleinWildhaendler =
      option && option.label.trim().toLocaleLowerCase("de") === "klein wildhändler";
    el("asProtokollGruppe").hidden =
      erfassungsmodus === "ausserhalb-plan" || !kleinWildhaendler;
    const protokollLabel = el("asProtokollGruppe").querySelector("label");
    protokollLabel.classList.toggle(
      "required",
      erfassungsmodus === "plan" && Boolean(kleinWildhaendler),
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
        await AbschussService.getNaechsteAbschussnummer(
          jahr,
          erfassungsmodus === "ausserhalb-plan"
            ? { von: 901, bis: 999 }
            : null,
        );
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
      const klassen =
        await wildklassenFuerModul(abschuss.wildgruppe_id);
      wildklasseDropdown.setOptions(klassen);
      wildklasseDropdown.setDisabled(!klassen.length);
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
    const modal = el("asModal");
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    const inhalt = modal.querySelector(".modal-content");
    if (inhalt) inhalt.scrollTop = 0;
    const mobil = window.matchMedia("(max-width: 768px)").matches;
    if (mobil) {
      document.body.classList.add("abschuss-modal-open");
    } else {
      el("asNr").focus();
    }
  }

  function schliessen() {
    const modal = el("asModal");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("abschuss-modal-open");
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
    if (erfassungsmodus === "ausserhalb-plan" &&
        (Number(daten.nr) < 901 || Number(daten.nr) > 999))
      return meldung(
        "Die Nummer für Haar- und Federwild muss zwischen 901 und 999 liegen.",
        el("asNr"),
      );
    if (!daten.datum) return meldung("Bitte ein Datum auswählen.", el("asDatum"));
    if (!daten.jaeger_id)
      return meldung("Bitte einen Jäger auswählen.", jaegerDropdown.input);
    if (!daten.wildgruppe_id) return meldung("Bitte eine Wildgruppe auswählen.", wildgruppeDropdown.input);
    if (!daten.wildklasse_id) return meldung("Bitte eine passende Wildklasse auswählen.", wildklasseDropdown.input);
    if (daten.gewicht !== null &&
        (!Number.isFinite(daten.gewicht) || daten.gewicht <= 0))
      return meldung("Bitte ein gültiges Gewicht größer als 0 eingeben.", el("asGewicht"));
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
      wildhaendler_id: wildhaendlerDropdown.getValue() || null,
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

      const bisherigeId = aktuell && aktuell.id;
      if (bisherigeId) await AbschussService.updateAbschuss(aktuell.id, daten);
      else await AbschussService.createAbschuss(daten);
      await laden();
      const gespeichert = abschuesse.find((item) =>
        bisherigeId
          ? String(item.id) === String(bisherigeId)
          : Number(item.nr) === daten.nr &&
            String(item.datum || "").slice(0, 4) === String(jahr),
      );
      schliessen();
      AppFeedback.success("Abschuss gespeichert.");
      if (gespeichert)
        AppFeedback.focusRow(
          `#asTabelleBody tr[data-id="${gespeichert.id}"]`,
        );
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
    if (!await AppFeedback.confirmDelete(
      "Abschuss löschen?",
      `Abschuss Nr. „${abschuss.nr}“ wird dauerhaft gelöscht.`,
    )) return;
    try {
      await AbschussService.deleteAbschuss(abschuss.id);
      await laden();
      schliessen();
      AppFeedback.success("Datensatz gelöscht.");
    } catch (error) {
      console.error("Abschuss konnte nicht gelöscht werden:", error);
      alert("Der Abschuss konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.");
    }
  }

  function getAktuelleFilter() {
    return aktuelleFilter ? { ...aktuelleFilter } : null;
  }

  return { init, getAktuelleFilter };
})();
