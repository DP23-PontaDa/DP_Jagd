/* ==========================================
   DP_Jagd V2
   stammdaten.js
========================================== */

window.Stammdaten = (() => {
  let aktuelleWildgruppe = null;
  let aktuelleWildklasse = null;
  let aktuelleKlasse = null;
  let istNeu = false;
  let aktuelleKahlwildregeln = [];
  let aktuelleKahlwildregelId = null;
  let kahlwildregelnBearbeitbar = false;
  let kahlwildregelnLoeschbar = false;

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
    document.getElementById("sdKahlwildregelNeu").addEventListener("click", () => kahlwildregelFormOeffnen());
    document.getElementById("sdKahlwildregelAbbrechen").addEventListener("click", kahlwildregelFormSchliessen);
    document.getElementById("sdKahlwildregelSpeichern").addEventListener("click", kahlwildregelSpeichern);

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

    const [daten, alleRegeln] = await Promise.all([
      WildklassenService.getWildklassen(aktuelleWildgruppe),
      WildklassenService.getKahlwildpflichtRegeln(),
    ]);
    const regelMap = new Map();
    alleRegeln.forEach((regel) => { const key=String(regel.wildklasse_id); const liste=regelMap.get(key)||[]; liste.push(regel); regelMap.set(key,liste); });

    tbody.innerHTML = "";

    daten.forEach((klasse) => {
      const tr = document.createElement("tr");
      tr.dataset.id = klasse.id;

      tr.innerHTML = `
          <td>${klasse.reihenfolge}</td>

          <td>${klasse.code}</td>

          <td>${klasse.bezeichnung}</td>
          <td>${klasse.kuerzel || "–"}</td>

          <td>${Number(klasse.stehzeit_jahre) || 0}</td>
          <td>${Number(klasse.stehzeit_nicht_passend_jahre) || 0}</td>
          <td>${(regelMap.get(String(klasse.id)) || []).map((regel) => `ab ${regel.gueltig_ab_jahr}: ${regel.anzahl}`).join(", ") || "–"}</td>

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

  async function bearbeiten(klasse, mode = "edit") {
    istNeu = false;
    aktuelleKlasse = klasse.id;
    aktuelleWildklasse = klasse;

    document.getElementById("sdCode").value = klasse.code;

    document.getElementById("sdBezeichnung").value = klasse.bezeichnung;
    document.getElementById("sdKuerzel").value = klasse.kuerzel || "";

    document.getElementById("sdReihenfolge").value = klasse.reihenfolge;
    document.getElementById("sdStehzeit").value = klasse.stehzeit_jahre ?? 0;
    document.getElementById("sdStehzeitNichtPassend").value = klasse.stehzeit_nicht_passend_jahre ?? 0;
    kahlwildregelnBearbeitbar = mode !== "read" && BerechtigungService.darf("wildklassen", "Bearbeiten");
    kahlwildregelnLoeschbar = mode !== "read" && BerechtigungService.darf("wildklassen", "Löschen");
    await kahlwildregelnLaden();
    document.getElementById("sdKahlwildregelNeu").hidden = !kahlwildregelnBearbeitbar;

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
    document.getElementById("sdKuerzel").value = "";
    document.getElementById("sdReihenfolge").value = "";
    document.getElementById("sdStehzeit").value = "0";
    document.getElementById("sdStehzeitNichtPassend").value = "0";
    aktuelleKahlwildregeln = []; aktuelleKahlwildregelId = null;
    kahlwildregelnBearbeitbar = false;
    kahlwildregelnLoeschbar = false;
    kahlwildregelnRendern();
    document.getElementById("sdKahlwildregelNeu").hidden = true;
    document.getElementById("sdKahlwildregelHinweis").textContent = "Wildklasse zuerst speichern; danach können Kahlwildpflicht-Regeln angelegt werden.";
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
    if (!await AppFeedback.confirmDelete(
      "Wildklasse löschen?",
      `„${klasse.bezeichnung}“ wird dauerhaft gelöscht.`,
    )) {
      return;
    }

    try {
      await WildklassenService.deleteWildklasse(klasse.id);

      await ladeWildklassen();
      document.getElementById("sdWildklasseModal").style.display = "none";
      AppFeedback.success("Datensatz gelöscht.");
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
      kuerzel: document.getElementById("sdKuerzel").value.trim() || null,

      reihenfolge: Number(document.getElementById("sdReihenfolge").value),

      stehzeit_jahre: Number(document.getElementById("sdStehzeit").value || 0),
      stehzeit_nicht_passend_jahre: Number(document.getElementById("sdStehzeitNichtPassend").value || 0),
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

      if (!Number.isInteger(daten.stehzeit_jahre) || daten.stehzeit_jahre < 0) {
        alert("Bitte eine gültige Stehzeit in Jahren eingeben.");
        return;
      }
      if (!Number.isInteger(daten.stehzeit_nicht_passend_jahre) || daten.stehzeit_nicht_passend_jahre < 0) {
        alert("Bitte gültige nicht negative Regelwerte eingeben.");
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
      document.getElementById("sdWildklasseModal").style.display = "none";
      AppFeedback.success("Wildklasse gespeichert.");
      if (gespeichert)
        AppFeedback.focusRow(
          `#sdWildklassenBody tr[data-id="${gespeichert.id}"]`,
        );
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function kahlwildregelnLaden() {
    aktuelleKahlwildregeln = aktuelleKlasse ? await WildklassenService.getKahlwildpflichtRegeln(aktuelleKlasse) : [];
    aktuelleKahlwildregelId = null; kahlwildregelnRendern(); kahlwildregelFormSchliessen();
    document.getElementById("sdKahlwildregelHinweis").textContent = "";
  }

  function kahlwildregelnRendern() {
    const body=document.getElementById("sdKahlwildregelnBody"); body.innerHTML="";
    aktuelleKahlwildregeln.forEach((regel)=>{
      const tr=document.createElement("tr"); tr.innerHTML=`<td>${regel.gueltig_ab_jahr}</td><td>${regel.anzahl}</td><td class="action-cell"><button class="action-btn edit-btn" type="button" title="Bearbeiten" aria-label="Bearbeiten"></button><button class="action-btn delete-btn" type="button" title="Löschen" aria-label="Löschen"></button></td>`;
      tr.querySelector(".edit-btn").hidden=!kahlwildregelnBearbeitbar;
      tr.querySelector(".delete-btn").hidden=!kahlwildregelnLoeschbar;
      tr.querySelector(".action-cell").hidden=!kahlwildregelnBearbeitbar&&!kahlwildregelnLoeschbar;
      tr.querySelector(".edit-btn").addEventListener("click",()=>kahlwildregelFormOeffnen(regel));
      tr.querySelector(".delete-btn").addEventListener("click",()=>kahlwildregelLoeschen(regel)); body.append(tr);
    });
    if(!aktuelleKahlwildregeln.length) body.innerHTML='<tr><td colspan="3">Keine Kahlwildpflicht hinterlegt.</td></tr>';
  }

  function kahlwildregelFormOeffnen(regel=null) {
    if(!aktuelleKlasse)return; aktuelleKahlwildregelId=regel?.id||null;
    document.getElementById("sdKahlwildregelJahr").value=regel?.gueltig_ab_jahr??"";
    document.getElementById("sdKahlwildregelAnzahl").value=regel?.anzahl??"";
    document.getElementById("sdKahlwildregelForm").hidden=false;
  }
  function kahlwildregelFormSchliessen(){document.getElementById("sdKahlwildregelForm").hidden=true;aktuelleKahlwildregelId=null;}
  async function kahlwildregelSpeichern(){
    const jahr=Number(document.getElementById("sdKahlwildregelJahr").value); const anzahl=Number(document.getElementById("sdKahlwildregelAnzahl").value);
    if(!Number.isInteger(jahr)||jahr<1900||jahr>2999){AppFeedback.error("Gültig ab muss eine vierstellige Jahreszahl sein.");return;}
    if(!Number.isInteger(anzahl)||anzahl<0){AppFeedback.error("Stück pro Hirsch muss eine nicht negative ganze Zahl sein.");return;}
    if(aktuelleKahlwildregeln.some((regel)=>Number(regel.gueltig_ab_jahr)===jahr&&String(regel.id)!==String(aktuelleKahlwildregelId||""))){AppFeedback.error(`Für ${aktuelleWildklasse?.bezeichnung||"diese Wildklasse"} existiert bereits eine Kahlwildpflicht ab ${jahr}.`);return;}
    try{const payload={wildklasse_id:aktuelleKlasse,gueltig_ab_jahr:jahr,anzahl};if(aktuelleKahlwildregelId)await WildklassenService.updateKahlwildpflichtRegel(aktuelleKahlwildregelId,payload);else await WildklassenService.createKahlwildpflichtRegel(payload);await kahlwildregelnLaden();await ladeWildklassen();AppFeedback.success("Kahlwildpflicht-Regel gespeichert.");}catch(error){AppFeedback.error(error.message);}
  }
  async function kahlwildregelLoeschen(regel){
    if(!await AppFeedback.confirmDelete("Kahlwildpflicht-Regel löschen?",`Die Regel ab ${regel.gueltig_ab_jahr} wird gelöscht.`))return;
    try{await WildklassenService.deleteKahlwildpflichtRegel(regel.id);await kahlwildregelnLaden();await ladeWildklassen();AppFeedback.success("Kahlwildpflicht-Regel gelöscht.");}catch(error){AppFeedback.error(error.message);}
  }

  return {
    init,
  };
})();
