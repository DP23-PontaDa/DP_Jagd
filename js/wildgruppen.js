/* ==========================================
   DP_Jagd V2
   wildgruppen.js
========================================== */

window.Wildgruppen = (() => {
  let wildgruppen = [];
  let aktuelleWildgruppe = null;

  function element(id) {
    return document.getElementById(id);
  }

  function modalOeffnen() {
    element("wgModal").style.display = "block";
    element("wgCode").focus();
  }

  function modalSchliessen() {
    element("wgModal").style.display = "none";
    aktuelleWildgruppe = null;
  }

  async function init() {
    element("wgNeu").addEventListener("click", neueWildgruppe);
    element("wgSpeichern").addEventListener("click", speichern);
    element("wgAbbrechen").addEventListener("click", modalSchliessen);
    element("wgSchliessen").addEventListener("click", modalSchliessen);
    element("wgSchliessen").addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        modalSchliessen();
      }
    });
    element("wgModal").addEventListener("click", (event) => {
      if (event.target === element("wgModal")) {
        modalSchliessen();
      }
    });
    element("wgTabelleBody").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-aktion]");

      if (!button) {
        return;
      }

      const wildgruppe = wildgruppen.find(
        (eintrag) => String(eintrag.id) === button.dataset.id,
      );

      if (!wildgruppe) {
        return;
      }

      if (button.dataset.aktion === "bearbeiten") {
        bearbeiten(wildgruppe);
      } else if (button.dataset.aktion === "loeschen") {
        loeschen(wildgruppe);
      }
    });

    await ladeWildgruppen();
  }

  async function ladeWildgruppen() {
    try {
      wildgruppen = await WildgruppenService.getWildgruppen();
      wildgruppen.sort((a, b) =>
        String(a.bezeichnung || "").localeCompare(
          String(b.bezeichnung || ""),
          "de",
          { sensitivity: "base" },
        ),
      );
      renderTabelle();
    } catch (error) {
      console.error("Wildgruppen konnten nicht geladen werden:", error);
      wildgruppen = [];
      renderTabelle();
      alert(error.message);
    }
  }

  function renderTabelle() {
    const tbody = element("wgTabelleBody");
    tbody.innerHTML = "";

    wildgruppen.forEach((wildgruppe) => {
      const tr = document.createElement("tr");
      const code = document.createElement("td");
      const bezeichnung = document.createElement("td");
      const aktiv = document.createElement("td");
      const aktionen = document.createElement("td");
      const buttonGruppe = document.createElement("div");
      const bearbeitenButton = document.createElement("button");
      const loeschenButton = document.createElement("button");

      code.textContent = wildgruppe.code || "";
      bezeichnung.textContent = wildgruppe.bezeichnung || "";
      aktiv.textContent = wildgruppe.aktiv ? "✓" : "—";

      buttonGruppe.className = "btn-group";

      bearbeitenButton.type = "button";
      bearbeitenButton.className = "btn btn-outline";
      bearbeitenButton.dataset.aktion = "bearbeiten";
      bearbeitenButton.dataset.id = wildgruppe.id;
      bearbeitenButton.textContent = "Bearbeiten";

      loeschenButton.type = "button";
      loeschenButton.className = "btn btn-outline";
      loeschenButton.dataset.aktion = "loeschen";
      loeschenButton.dataset.id = wildgruppe.id;
      loeschenButton.textContent = "Löschen";

      buttonGruppe.append(bearbeitenButton, loeschenButton);
      aktionen.appendChild(buttonGruppe);
      tr.append(code, bezeichnung, aktiv, aktionen);
      tbody.appendChild(tr);
    });
  }

  function neueWildgruppe() {
    aktuelleWildgruppe = null;
    element("wgModalTitel").textContent = "Neue Wildgruppe";
    element("wgCode").value = "";
    element("wgBezeichnung").value = "";
    element("wgAktiv").checked = true;
    modalOeffnen();
  }

  function bearbeiten(wildgruppe) {
    aktuelleWildgruppe = wildgruppe;
    element("wgModalTitel").textContent = "Wildgruppe bearbeiten";
    element("wgCode").value = wildgruppe.code || "";
    element("wgBezeichnung").value = wildgruppe.bezeichnung || "";
    element("wgAktiv").checked = wildgruppe.aktiv === true;
    modalOeffnen();
  }

  async function speichern() {
    const daten = {
      code: element("wgCode").value.trim().toUpperCase(),
      bezeichnung: element("wgBezeichnung").value.trim(),
      aktiv: element("wgAktiv").checked,
    };

    if (!daten.code) {
      alert("Bitte einen Code eingeben.");
      element("wgCode").focus();
      return;
    }

    if (!daten.bezeichnung) {
      alert("Bitte eine Bezeichnung eingeben.");
      element("wgBezeichnung").focus();
      return;
    }

    const speichernButton = element("wgSpeichern");
    speichernButton.disabled = true;

    try {
      if (aktuelleWildgruppe) {
        await WildgruppenService.updateWildgruppe(
          aktuelleWildgruppe.id,
          daten,
        );
      } else {
        await WildgruppenService.createWildgruppe(daten);
      }

      modalSchliessen();
      await ladeWildgruppen();
    } catch (error) {
      console.error("Wildgruppe konnte nicht gespeichert werden:", error);
      alert(error.message);
    } finally {
      speichernButton.disabled = false;
    }
  }

  async function loeschen(wildgruppe) {
    if (!confirm(`Wildgruppe "${wildgruppe.bezeichnung}" löschen?`)) {
      return;
    }

    try {
      await WildgruppenService.deleteWildgruppe(wildgruppe.id);
      await ladeWildgruppen();
    } catch (error) {
      console.error("Wildgruppe konnte nicht gelöscht werden:", error);

      if (error.code === "23503") {
        alert(
          "Diese Wildgruppe kann nicht gelöscht werden, da sie bereits verwendet wird.",
        );
        return;
      }

      alert(error.message);
    }
  }

  return {
    init,
    ladeWildgruppen,
    renderTabelle,
    neueWildgruppe,
    bearbeiten,
    speichern,
    loeschen,
    modalOeffnen,
    modalSchliessen,
  };
})();
