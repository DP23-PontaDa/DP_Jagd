const Nachsuchen = (() => {
  const configs = {
    nachsuchen: {
      titel: "Nachsuchen", singular: "Nachsuche",
      hundefuehrer: true, wild: true, gefunden: true, wildLabel: "Wildklasse",
    },
    fehlschuesse: {
      titel: "Fehlschüsse", singular: "Fehlschuss",
      hundefuehrer: false, wild: true, gefunden: false, wildLabel: "Wildart",
    },
    probeschuesse: {
      titel: "Probeschüsse", singular: "Probeschuss",
      hundefuehrer: false, wild: false, gefunden: false, wildLabel: "Wildklasse",
    },
  };
  let typ = "nachsuchen";
  let config = configs.nachsuchen;
  let rows = [];
  let aktuell = null;
  let nummerJahr = null;
  let jaegerDropdown;
  let hundefuehrerDropdown;
  let wildgruppeDropdown;
  let wildklasseDropdown;
  let ortDropdown;
  const el = (id) => document.getElementById(id);

  function personenOptionen(rows) {
    return rows.map((row) => ({
      value: row.id,
      label: [row.vorname, row.nachname].filter(Boolean).join(" "),
      data: row,
    }));
  }

  async function init(modus = "nachsuchen") {
    typ = configs[modus] ? modus : "nachsuchen";
    config = configs[typ];
    el("nsSeitentitel").textContent = config.titel;
    el("nsNeu").textContent = `+ Neuer ${config.singular}`;
    el("nsHundefuehrerGruppe").hidden = !config.hundefuehrer;
    el("nsWildgruppeGruppe").hidden = !config.wild;
    el("nsWildklasseGruppe").hidden = !config.wild;
    el("nsWildGefundenGruppe").hidden = !config.gefunden;
    el("nsOrtAuswahlGruppe").hidden = typ !== "nachsuchen";
    el("nsOrtFreitextGruppe").hidden = typ === "nachsuchen";
    el("nsWildklasseLabel").textContent = config.wildLabel;
    tabelleKonfigurieren();

    jaegerDropdown = new SearchDropdown(el("nsJaeger"), { placeholder: "Jäger suchen" });
    hundefuehrerDropdown = new SearchDropdown(el("nsHundefuehrer"), { placeholder: "Hundeführer suchen" });
    wildgruppeDropdown = new SearchDropdown(el("nsWildgruppe"), {
      placeholder: "Wildgruppe suchen", onChange: wildgruppeGeaendert,
    });
    wildklasseDropdown = new SearchDropdown(el("nsWildklasse"), {
      placeholder: `Zuerst Wildgruppe wählen`, disabled: true,
    });
    ortDropdown = new OrteAuswahl(el("nsOrtAuswahl"), el("nsOrtInfo"), {
      placeholder: "Ort suchen",
    });

    el("nsNeu").addEventListener("click", neu);
    el("nsSpeichern").addEventListener("click", speichern);
    el("nsAbbrechen").addEventListener("click", schliessen);
    el("nsSchliessen").addEventListener("click", schliessen);
    el("nsDatum").addEventListener("change", datumGeaendert);
    el("nsSuche").addEventListener("input", rendern);
    el("nsTabelleBody").addEventListener("click", tabellenAktion);
    el("nsModal").addEventListener("click", (event) => {
      if (event.target === el("nsModal")) schliessen();
    });

    try {
      const aufgaben = [NachsuchenService.getJaeger()];
      if (config.hundefuehrer) aufgaben.push(NachsuchenService.getHundefuehrer());
      if (config.wild) {
        aufgaben.push(WildgruppenService.getWildgruppen());
      }
      const resultate = await Promise.all(aufgaben);
      jaegerDropdown.setOptions(personenOptionen(resultate[0]));
      let index = 1;
      if (config.hundefuehrer) hundefuehrerDropdown.setOptions(personenOptionen(resultate[index++]));
      if (config.wild) wildgruppeDropdown.setOptions(resultate[index]);
      if (typ === "nachsuchen") await ortDropdown.laden();
      await laden();
    } catch (error) {
      console.error(`${config.titel} konnte nicht initialisiert werden:`, error);
      alert(`Das Modul ${config.titel} konnte nicht geladen werden.`);
    }
  }

  async function laden() {
    rows = await NachsuchenService.getEintraege(typ);
    rendern();
  }

  function relation(value) { return Array.isArray(value) ? value[0] : value; }
  function name(value) {
    const person = relation(value);
    return person ? [person.vorname, person.nachname].filter(Boolean).join(" ") : "";
  }

  function spalten() {
    const basis = [
      { label: "Nr", wert: (row) => row.nr },
      { label: "Datum", wert: (row) => formatDatum(row.datum) },
      { label: "Jäger", wert: (row) => name(row.jaeger) },
    ];
    if (config.hundefuehrer)
      basis.push({ label: "Hundeführer", wert: (row) => name(row.hundefuehrer) });
    if (config.wild) {
      basis.push(
        { label: "Wildgruppe", wert: (row) => relation(row.wildgruppen)?.bezeichnung },
        { label: config.wildLabel, wert: (row) => relation(row.wildklassen)?.bezeichnung },
      );
    }
    basis.push(
      { label: "Ort", wert: (row) => relation(row.ort_stammdaten)?.name || row.ort },
      { label: "Info", wert: (row) => row.info },
    );
    if (config.gefunden)
      basis.push({ label: "Wild gefunden", wert: (row) => row.wild_gefunden ? "Ja" : "Nein" });
    return basis;
  }

  function tabelleKonfigurieren() {
    const kopf = el("nsTabelleKopf");
    kopf.innerHTML = "";
    [...spalten().map((spalte) => spalte.label), "Aktionen"].forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label;
      if (label === "Aktionen") th.className = "col-actions";
      kopf.appendChild(th);
    });
  }

  function rendern() {
    const query = el("nsSuche").value.trim().toLocaleLowerCase("de");
    const definitionen = spalten();
    el("nsTabelleBody").innerHTML = "";
    rows.filter((row) => !query || definitionen.map((spalte) => spalte.wert(row))
      .join(" ").toLocaleLowerCase("de").includes(query))
      .forEach((row) => {
        const tr = document.createElement("tr");
        tr.dataset.id = row.id;
        definitionen.forEach((spalte) => {
          const td = document.createElement("td");
          td.textContent = spalte.wert(row) ?? "";
          td.dataset.label = spalte.label;
          tr.appendChild(td);
        });
        const actions = document.createElement("td");
        actions.className = "action-cell";
        actions.dataset.label = "Aktionen";
        actions.innerHTML =
          `<button class="action-btn edit-btn" data-action="edit" data-id="${row.id}" title="Bearbeiten" aria-label="Bearbeiten"></button>` +
          `<button class="action-btn delete-btn" data-action="delete" data-id="${row.id}" title="Löschen" aria-label="Löschen"></button>`;
        tr.appendChild(actions);
        el("nsTabelleBody").appendChild(tr);
      });
  }

  async function wildgruppeGeaendert(option) {
    wildklasseDropdown.clear(false);
    wildklasseDropdown.setOptions([]);
    wildklasseDropdown.setDisabled(true);
    if (!option || !config.wild) return;
    try {
      const klassen = await wildklassenFuerWildgruppe(option.value, option.data);
      wildklasseDropdown.setOptions(klassen);
      wildklasseDropdown.setDisabled(!klassen.length);
    } catch (error) {
      fehler("Die Wildauswahl konnte nicht geladen werden.");
    }
  }

  async function wildklassenFuerWildgruppe(wildgruppeId, wildgruppe = null) {
    const gruppe = wildgruppe || wildgruppeDropdown.options.find(
      (option) => String(option.value) === String(wildgruppeId),
    )?.data;
    if (gruppe?.abschussplan === true) {
      return WildklassenService
        .getAktivePlanWildklassenByWildgruppe(wildgruppeId);
    }
    return WildklassenService.getAktiveWildklassenByWildgruppe(wildgruppeId);
  }

  async function neu() {
    aktuell = null;
    nummerJahr = null;
    formularLeeren();
    el("nsModalTitel").textContent = `Neuer ${config.singular}`;
    el("nsDatum").value = new Date().toISOString().slice(0, 10);
    await datumGeaendert();
    oeffnen();
  }

  async function datumGeaendert() {
    if (aktuell) return;
    const jahr = Number(String(el("nsDatum").value).slice(0, 4));
    if (!jahr || jahr === nummerJahr) return;
    nummerJahr = jahr;
    try {
      el("nsNr").value = await NachsuchenService.getNaechsteNummer(typ, jahr);
    } catch (error) {
      nummerJahr = null;
      fehler("Die nächste Nummer konnte nicht ermittelt werden.", el("nsNr"));
    }
  }

  async function bearbeiten(id) {
    const row = rows.find((item) => String(item.id) === String(id));
    if (!row) return;
    aktuell = row;
    formularLeeren();
    nummerJahr = Number(String(row.datum).slice(0, 4));
    el("nsModalTitel").textContent = `${config.singular} bearbeiten`;
    el("nsNr").value = row.nr;
    el("nsDatum").value = row.datum;
    jaegerDropdown.setValue(row.jaeger_id, false);
    if (config.hundefuehrer) hundefuehrerDropdown.setValue(row.hundefuehrer_id, false);
    if (config.wild) {
      wildgruppeDropdown.setValue(row.wildgruppe_id, false);
      const klassen = await wildklassenFuerWildgruppe(row.wildgruppe_id);
      wildklasseDropdown.setOptions(klassen);
      wildklasseDropdown.setDisabled(false);
      wildklasseDropdown.setValue(row.wildklasse_id, false);
    }
    if (typ === "nachsuchen") ortDropdown.setValue(row.ort_id, false);
    else el("nsOrt").value = row.ort || "";
    el("nsInfo").value = row.info || "";
    el("nsWildGefunden").checked = row.wild_gefunden === true;
    oeffnen();
  }

  function payload() {
    const daten = {
      nr: Number(el("nsNr").value), datum: el("nsDatum").value,
      jaeger_id: jaegerDropdown.getValue(),
      ort: typ === "nachsuchen" ? null : el("nsOrt").value.trim() || null,
      info: el("nsInfo").value.trim() || null,
    };
    if (typ === "nachsuchen") daten.ort_id = ortDropdown.getValue();
    if (config.hundefuehrer) daten.hundefuehrer_id = hundefuehrerDropdown.getValue();
    if (config.wild) {
      daten.wildgruppe_id = wildgruppeDropdown.getValue();
      daten.wildklasse_id = wildklasseDropdown.getValue();
    }
    if (config.gefunden) daten.wild_gefunden = el("nsWildGefunden").checked;
    return daten;
  }

  async function speichern() {
    const daten = payload();
    if (!Number.isInteger(daten.nr) || daten.nr <= 0)
      return fehler("Bitte eine positive ganze Nummer eingeben.", el("nsNr"));
    if (!daten.datum) return fehler("Bitte ein Datum auswählen.", el("nsDatum"));
    if (!daten.jaeger_id) return fehler("Bitte einen Jäger auswählen.", jaegerDropdown.input);
    if (config.hundefuehrer && !daten.hundefuehrer_id)
      return fehler("Bitte einen Hundeführer auswählen.", hundefuehrerDropdown.input);
    if (config.wild && !daten.wildgruppe_id)
      return fehler("Bitte eine Wildgruppe auswählen.", wildgruppeDropdown.input);
    if (config.wild && !daten.wildklasse_id)
      return fehler(`Bitte eine ${config.wildLabel} auswählen.`, wildklasseDropdown.input);
    const jahr = Number(daten.datum.slice(0, 4));
    el("nsSpeichern").disabled = true;
    try {
      if (await NachsuchenService.istNummerVergeben(typ, jahr, daten.nr, aktuell?.id))
        return fehler(`Die Nummer ${daten.nr} ist im Jahr ${jahr} bereits vergeben.`);
      if (aktuell) await NachsuchenService.updateEintrag(typ, aktuell.id, daten);
      else await NachsuchenService.createEintrag(typ, daten);
      await laden();
      schliessen();
      AppFeedback.success(`${config.singular} gespeichert.`);
    } catch (error) {
      console.error(`${config.singular} konnte nicht gespeichert werden:`, error);
      fehler(`${config.singular} konnte nicht gespeichert werden.`);
    } finally {
      el("nsSpeichern").disabled = false;
    }
  }

  async function tabellenAktion(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit") await bearbeiten(button.dataset.id);
    if (button.dataset.action === "delete") await loeschen(button.dataset.id);
  }

  async function loeschen(id) {
    if (!await AppFeedback.confirmDelete(`${config.singular} löschen?`, "Der Datensatz wird dauerhaft gelöscht.")) return;
    try {
      await NachsuchenService.deleteEintrag(typ, id);
      await laden();
      AppFeedback.success(`${config.singular} gelöscht.`);
    } catch (error) {
      alert(`${config.singular} konnte nicht gelöscht werden.`);
    }
  }

  function formularLeeren() {
    ["nsNr", "nsDatum", "nsOrt", "nsInfo"].forEach((id) => { el(id).value = ""; });
    ortDropdown.clear();
    jaegerDropdown.clear(false);
    hundefuehrerDropdown.clear(false);
    wildgruppeDropdown.clear(false);
    wildklasseDropdown.clear(false);
    wildklasseDropdown.setOptions([]);
    wildklasseDropdown.setDisabled(true);
    el("nsWildGefunden").checked = false;
    el("nsFehler").hidden = true;
  }

  function oeffnen() {
    el("nsModal").style.display = "block";
    el("nsModal").setAttribute("aria-hidden", "false");
  }
  function schliessen() {
    el("nsModal").style.display = "none";
    el("nsModal").setAttribute("aria-hidden", "true");
    aktuell = null;
  }
  function fehler(text, fokus = null) {
    el("nsFehler").textContent = text;
    el("nsFehler").hidden = false;
    if (fokus) fokus.focus();
    return false;
  }
  function formatDatum(value) {
    if (!value) return "";
    const [jahr, monat, tag] = value.split("-");
    return `${tag}.${monat}.${jahr}`;
  }

  return { init };
})();

window.Nachsuchen = Nachsuchen;
