/* ==========================================
   DP_Jagd V2
   stammdaten.js
========================================== */

window.Stammdaten = (() => {
  let aktuelleWildgruppe = null;
  let aktuelleWildklasse = null;
  let aktuelleKlasse = null;
  let istNeu = false;

  async function init() {
    await ladeWildgruppen();

    document
      .getElementById("sdWildgruppe")
      .addEventListener("change", async (e) => {
        aktuelleWildgruppe = e.target.value;

        await ladeWildklassen();
      });

    document
      .getElementById("sdNeueKlasse")
      .addEventListener("click", neueWildklasse);

    document.getElementById("sdSpeichern").addEventListener("click", speichern);

    document.getElementById("sdAbbrechen").addEventListener("click", abbrechen);
    document.getElementById("sdDetailEdit").addEventListener("click", () =>
      DetailMode.setMode(
        document.getElementById("sdWildklasseModal"),
        "edit",
      ),
    );
    document.getElementById("sdDetailDelete").addEventListener("click", () => {
      if (aktuelleWildklasse) loeschen(aktuelleWildklasse);
    });

    const schliessen = document.getElementById("sdSchliessen");

    if (schliessen) {
      schliessen.addEventListener("click", () => {
        document.getElementById("sdWildklasseModal").style.display = "none";
      });
    }
  }

  async function ladeWildgruppen() {
    const select = document.getElementById("sdWildgruppe");

    const gruppen = await WildklassenService.getWildgruppen();

    select.innerHTML = "";

    gruppen.forEach((gruppe) => {
      const option = document.createElement("option");

      option.value = gruppe.id;
      option.textContent = gruppe.bezeichnung;

      select.appendChild(option);
    });

    if (gruppen.length > 0) {
      aktuelleWildgruppe = gruppen[0].id;
      select.value = aktuelleWildgruppe;

      await ladeWildklassen();
    }
  }

  async function ladeWildklassen() {
    const tbody = document.getElementById("sdWildklassenBody");

    const daten = await WildklassenService.getWildklassen(aktuelleWildgruppe);

    tbody.innerHTML = "";

    daten.forEach((klasse) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
          <td>${klasse.reihenfolge}</td>

          <td>${klasse.code}</td>

          <td>${klasse.bezeichnung}</td>

          <td class="text-center">
              ${klasse.aktiv ? "✓" : "—"}
          </td>

          <td class="action-cell">

              <button
                  class="action-btn edit-btn edit"
                  type="button"
                  data-id="${klasse.id}"
                  title="Bearbeiten"
                  aria-label="Bearbeiten"></button>

              <button
                  class="action-btn delete-btn delete"
                  type="button"
                  data-id="${klasse.id}"
                  title="Löschen"
                  aria-label="Löschen"></button>

          </td>
      `;

      tbody.appendChild(tr);

      tr.querySelector(".edit").addEventListener("click", () =>
        bearbeiten(klasse),
      );

      tr.querySelector(".delete").addEventListener("click", () =>
        loeschen(klasse),
      );
      tr.addEventListener("click", (event) => {
        if (!event.target.closest("button")) bearbeiten(klasse, "read");
      });
    });

    return daten;
  }

  function bearbeiten(klasse, mode = "edit") {
    istNeu = false;
    aktuelleKlasse = klasse.id;
    aktuelleWildklasse = klasse;

    document.getElementById("sdCode").value = klasse.code;

    document.getElementById("sdBezeichnung").value = klasse.bezeichnung;

    document.getElementById("sdReihenfolge").value = klasse.reihenfolge;

    document.getElementById("sdAktiv").checked = klasse.aktiv;

    document.getElementById("sdWildklasseTitel").textContent =
      mode === "read" ? "Wildklasse" : "Wildklasse bearbeiten";

    DetailMode.setMode(
      document.getElementById("sdWildklasseModal"),
      mode,
      { capture: mode === "edit" },
    );
    document.getElementById("sdWildklasseModal").style.display = "block";
  }

  function neueWildklasse() {
    istNeu = true;
    aktuelleKlasse = null;
    aktuelleWildklasse = null;

    document.getElementById("sdWildklasseTitel").textContent =
      "Neue Wildklasse";

    document.getElementById("sdCode").value = "";
    document.getElementById("sdBezeichnung").value = "";
    document.getElementById("sdReihenfolge").value = "";
    document.getElementById("sdAktiv").checked = true;

    DetailMode.setMode(
      document.getElementById("sdWildklasseModal"),
      "edit",
    );
    document.getElementById("sdWildklasseModal").style.display = "block";
  }

  function abbrechen() {
    if (!istNeu && aktuelleWildklasse) {
      DetailMode.cancel(document.getElementById("sdWildklasseModal"));
      return;
    }
    document.getElementById("sdWildklasseModal").style.display = "none";
  }

  async function loeschen(klasse) {
    if (!confirm(`Wildklasse "${klasse.bezeichnung}" löschen?`)) {
      return;
    }

    try {
      await WildklassenService.deleteWildklasse(klasse.id);

      await ladeWildklassen();
    } catch (error) {
      if (error.code === "23503") {
        alert(
          "Diese Wildklasse kann nicht gelöscht werden, da sie bereits in einem Abschussplan verwendet wird.",
        );

        return;
      }

      throw error;
    }
  }

  async function speichern() {
    const daten = {
      wildgruppe_id: aktuelleWildgruppe,

      code: document.getElementById("sdCode").value.trim().toUpperCase(),

      bezeichnung: document.getElementById("sdBezeichnung").value.trim(),

      reihenfolge: Number(document.getElementById("sdReihenfolge").value),

      aktiv: document.getElementById("sdAktiv").checked,
    };

    console.log("Daten:", daten);

    try {
      if (!daten.code) {
        alert("Bitte einen Code eingeben.");
        return;
      }

      if (!daten.bezeichnung) {
        alert("Bitte eine Bezeichnung eingeben.");
        return;
      }

      if (istNeu) {
        await WildklassenService.createWildklasse(daten);
      } else {
        await WildklassenService.updateWildklasse(aktuelleKlasse, daten);
      }

      const klassen = await ladeWildklassen();
      const gespeichert = klassen.find((klasse) =>
        aktuelleKlasse
          ? String(klasse.id) === String(aktuelleKlasse)
          : klasse.code === daten.code,
      );
      if (gespeichert) bearbeiten(gespeichert, "read");
      else document.getElementById("sdWildklasseModal").style.display = "none";
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  return {
    init,
  };
})();
