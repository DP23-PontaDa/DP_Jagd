window.Wildhaendler = (() => {
  let daten = [];
  let aktuell = null;
  const el = (id) => document.getElementById(id);

  async function init() {
    el("abNeu").addEventListener("click", neu);
    el("abSpeichern").addEventListener("click", speichern);
    el("abAbbrechen").addEventListener("click", abbrechen);
    el("abSchliessen").addEventListener("click", schliessen);
    el("abDetailEdit").addEventListener("click", () =>
      DetailMode.setMode(el("abModal"), "edit"),
    );
    el("abDetailDelete").addEventListener("click", () => {
      if (aktuell) loeschen(aktuell);
    });
    el("abSchliessen").addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") schliessen();
    });
    el("abModal").addEventListener("click", (event) => {
      if (event.target === el("abModal")) schliessen();
    });
    el("abTabelleBody").addEventListener("click", tabellenAktion);
    await laden();
  }

  async function laden() {
    try {
      daten = await WildhaendlerService.getWildhaendler();
      rendern();
    } catch (error) {
      console.error("Wildhändler konnten nicht geladen werden:", error);
      daten = [];
      rendern();
      alert("Die Wildhändler konnten nicht geladen werden. Bitte versuchen Sie es erneut.");
    }
  }

  function rendern() {
    const body = el("abTabelleBody");
    body.innerHTML = "";
    daten.forEach((wildhaendler) => {
      const row = document.createElement("tr");
      row.dataset.id = wildhaendler.id;
      [
        wildhaendler.reihenfolge,
        wildhaendler.code,
        wildhaendler.bezeichnung,
        wildhaendler.rechnungstext,
        formatPreis(wildhaendler.preis_pro_kg),
        wildhaendler.rechnung_moeglich ? "Ja" : "Nein",
        wildhaendler.aktiv ? "✓" : "—",
      ].forEach(
        (wert) => {
          const cell = document.createElement("td");
          cell.textContent = wert || "";
          row.appendChild(cell);
        },
      );
      const actions = document.createElement("td");
      actions.className = "action-cell";
      actions.innerHTML =
        `<button class="action-btn edit-btn" type="button" data-aktion="bearbeiten" data-id="${wildhaendler.id}" title="Bearbeiten" aria-label="Bearbeiten"></button>` +
        `<button class="action-btn delete-btn" type="button" data-aktion="loeschen" data-id="${wildhaendler.id}" title="Löschen" aria-label="Löschen"></button>`;
      row.appendChild(actions);
      body.appendChild(row);
    });
  }

  function formatPreis(wert) {
    return Number(wert || 0).toLocaleString("de-AT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function tabellenAktion(event) {
    const button = event.target.closest("[data-aktion]");
    if (!button) {
      const row = event.target.closest("tr[data-id]");
      const wildhaendler = daten.find(
        (item) => String(item.id) === String(row?.dataset.id),
      );
      if (wildhaendler) bearbeiten(wildhaendler, "read");
      return;
    }
    const wildhaendler = daten.find((item) => String(item.id) === button.dataset.id);
    if (!wildhaendler) return;
    if (button.dataset.aktion === "bearbeiten") bearbeiten(wildhaendler);
    else loeschen(wildhaendler);
  }

  function neu() {
    aktuell = null;
    el("abReihenfolge").value = "";
    el("abModalTitel").textContent = "Neuer Wildhändler";
    el("abCode").value = "";
    el("abBezeichnung").value = "";
    el("abRechnungstext").value = "";
    el("abPreisProKg").value = "0.00";
    el("abRechnungMoeglich").checked = true;
    el("abAktiv").checked = true;
    DetailMode.setMode(el("abModal"), "edit");
    oeffnen();
  }

  function bearbeiten(wildhaendler, mode = "edit") {
    aktuell = wildhaendler;
    el("abReihenfolge").value = wildhaendler.reihenfolge ?? "";
    el("abModalTitel").textContent =
      mode === "read" ? "Wildhändler" : "Wildhändler bearbeiten";
    el("abCode").value = wildhaendler.code || "";
    el("abBezeichnung").value = wildhaendler.bezeichnung || "";
    el("abRechnungstext").value = wildhaendler.rechnungstext || "";
    el("abPreisProKg").value = Number(wildhaendler.preis_pro_kg || 0).toFixed(2);
    el("abRechnungMoeglich").checked = wildhaendler.rechnung_moeglich === true;
    el("abAktiv").checked = wildhaendler.aktiv === true;
    DetailMode.setMode(el("abModal"), mode, {
      capture: mode === "edit",
    });
    oeffnen();
  }

  function oeffnen() {
    el("abFehler").hidden = true;
    el("abModal").style.display = "block";
    el("abModal").setAttribute("aria-hidden", "false");
    el("abCode").focus();
  }

  function schliessen() {
    el("abModal").style.display = "none";
    el("abModal").setAttribute("aria-hidden", "true");
    aktuell = null;
  }

  function abbrechen() {
    if (aktuell) {
      DetailMode.cancel(el("abModal"));
      return;
    }
    schliessen();
  }

  function meldung(text) {
    el("abFehler").textContent = text;
    el("abFehler").hidden = false;
  }

  async function speichern() {
    const eingabe = {
      reihenfolge: Number(el("abReihenfolge").value),
      code: el("abCode").value.trim().toUpperCase(),
      bezeichnung: el("abBezeichnung").value.trim(),
      rechnungstext: el("abRechnungstext").value.trim() || null,
      preis_pro_kg: Number(el("abPreisProKg").value || 0),
      rechnung_moeglich: el("abRechnungMoeglich").checked,
      aktiv: el("abAktiv").checked,
    };
    if (!Number.isInteger(eingabe.reihenfolge) || eingabe.reihenfolge <= 0)
      return meldung("Bitte eine positive ganze Reihenfolge eingeben.");
    if (!eingabe.code) return meldung("Bitte einen Code eingeben.");
    if (!eingabe.bezeichnung) return meldung("Bitte eine Bezeichnung eingeben.");
    if (!Number.isFinite(eingabe.preis_pro_kg) || eingabe.preis_pro_kg < 0)
      return meldung("Bitte einen gültigen Preis pro kg eingeben.");

    el("abSpeichern").disabled = true;
    try {
      const bisherigeId = aktuell && aktuell.id;
      if (bisherigeId) {
        await WildhaendlerService.updateWildhaendler(aktuell.id, eingabe);
      } else {
        await WildhaendlerService.createWildhaendler(eingabe);
      }
      await laden();
      const gespeichert = daten.find((item) =>
        bisherigeId
          ? String(item.id) === String(bisherigeId)
          : item.code === eingabe.code,
      );
      schliessen();
      AppFeedback.success("Wildhändler gespeichert.");
      if (gespeichert)
        AppFeedback.focusRow(`#abTabelleBody tr[data-id="${gespeichert.id}"]`);
    } catch (error) {
      console.error("Wildhändler konnte nicht gespeichert werden:", error);
      meldung(error.code === "23505"
        ? "Code und Bezeichnung müssen eindeutig sein."
        : "Der Wildhändler konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    } finally {
      el("abSpeichern").disabled = false;
    }
  }

  async function loeschen(wildhaendler) {
    if (!await AppFeedback.confirmDelete(
      "Wildhändler löschen?",
      `„${wildhaendler.bezeichnung}“ wird dauerhaft gelöscht.`,
    )) return;
    try {
      await WildhaendlerService.deleteWildhaendler(wildhaendler.id);
      await laden();
      schliessen();
      AppFeedback.success("Datensatz gelöscht.");
    } catch (error) {
      console.error("Wildhändler konnte nicht gelöscht werden:", error);
      alert(error.code === "23503"
        ? "Dieser Wildhändler kann nicht gelöscht werden, da er bereits verwendet wird."
        : "Der Wildhändler konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.");
    }
  }

  return { init };
})();
