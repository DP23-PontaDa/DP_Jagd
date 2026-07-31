window.Planpositionen = (() => {
  let positionen = [];
  let aktuellePosition = null;
  const element = (id) => document.getElementById(id);

  function modal(id, sichtbar) {
    const ziel = element(id);
    ziel.style.display = sichtbar ? "block" : "none";
    ziel.setAttribute("aria-hidden", sichtbar ? "false" : "true");
  }

  async function init() {
    element("ppWildgruppe").addEventListener("change", laden);
    element("ppNeu").addEventListener("click", neu);
    element("ppSpeichern").addEventListener("click", speichern);
    element("ppAbbrechen").addEventListener("click", () => modal("ppModal", false));
    element("ppSchliessen").addEventListener("click", () => modal("ppModal", false));
    element("ppMappingAbbrechen").addEventListener("click", () => modal("ppMappingModal", false));
    element("ppMappingSchliessen").addEventListener("click", () => modal("ppMappingModal", false));
    element("ppMappingSpeichern").addEventListener("click", mappingSpeichern);
    const gruppen = await PlanpositionService.getWildgruppen();
    const select = element("ppWildgruppe");
    select.innerHTML = "";
    gruppen.forEach((gruppe) => {
      const option = document.createElement("option");
      option.value = gruppe.id;
      option.textContent = gruppe.bezeichnung;
      select.appendChild(option);
    });
    await laden();
  }

  async function laden() {
    positionen = element("ppWildgruppe").value
      ? await PlanpositionService.getPlanpositionen(element("ppWildgruppe").value)
      : [];
    const body = element("ppTabelleBody");
    body.innerHTML = "";
    positionen.forEach((position) => {
      const zeile = document.createElement("tr");
      zeile.dataset.id = position.id;
      zeile.innerHTML = `<td>${position.reihenfolge}</td><td>${position.code}</td>
        <td>${position.bezeichnung}</td>
        <td>${position.wildgruppen?.bezeichnung || ""}</td>
        <td class="text-center">${position.aktiv ? "✓" : "—"}</td>
        <td class="action-cell"><button class="btn btn-outline mapping" type="button">Zuordnung</button>
        <button class="action-btn edit-btn edit" type="button" title="Bearbeiten"></button>
        <button class="action-btn delete-btn delete" type="button" title="Löschen"></button></td>`;
      zeile.querySelector(".mapping").onclick = () => mappingOeffnen(position);
      zeile.querySelector(".edit").onclick = () => bearbeiten(position);
      zeile.querySelector(".delete").onclick = () => loeschen(position);
      body.appendChild(zeile);
    });
  }

  function neu() {
    aktuellePosition = null;
    element("ppModalTitel").textContent = "Neue Planposition";
    element("ppReihenfolge").value = "";
    element("ppCode").value = "";
    element("ppBezeichnung").value = "";
    element("ppAktiv").checked = true;
    modal("ppModal", true);
  }

  function bearbeiten(position) {
    aktuellePosition = position;
    element("ppModalTitel").textContent = "Planposition bearbeiten";
    element("ppReihenfolge").value = position.reihenfolge;
    element("ppCode").value = position.code;
    element("ppBezeichnung").value = position.bezeichnung;
    element("ppAktiv").checked = position.aktiv === true;
    modal("ppModal", true);
  }

  async function speichern() {
    const daten = {
      wildgruppe_id: element("ppWildgruppe").value,
      reihenfolge: Number(element("ppReihenfolge").value),
      code: element("ppCode").value.trim().toUpperCase(),
      bezeichnung: element("ppBezeichnung").value.trim(),
      aktiv: element("ppAktiv").checked,
    };
    if (!Number.isInteger(daten.reihenfolge) || daten.reihenfolge <= 0) {
      alert("Bitte eine positive ganze Reihenfolge eingeben."); return;
    }
    if (!daten.code || !daten.bezeichnung) {
      alert("Bitte Code und Bezeichnung eingeben."); return;
    }
    try {
      if (aktuellePosition)
        await PlanpositionService.updatePlanposition(aktuellePosition.id, daten);
      else await PlanpositionService.createPlanposition(daten);
      modal("ppModal", false);
      await laden();
      AppFeedback.success("Planposition gespeichert.");
    } catch (error) { alert(error.message); }
  }

  async function loeschen(position) {
    if (!await AppFeedback.confirmDelete("Planposition löschen?", `„${position.bezeichnung}“ wird dauerhaft gelöscht.`)) return;
    try {
      await PlanpositionService.deletePlanposition(position.id);
      await laden();
      AppFeedback.success("Datensatz gelöscht.");
    } catch (error) {
      alert(error.code === "23503"
        ? "Diese Planposition wird bereits verwendet und kann nicht gelöscht werden."
        : error.message);
    }
  }

  async function mappingOeffnen(position) {
    aktuellePosition = position;
    element("ppMappingTitel").textContent = `Zuordnung – ${position.bezeichnung}`;
    const [wildklassen, mapping] = await Promise.all([
      PlanpositionService.getWildklassen(position.wildgruppe_id),
      PlanpositionService.getMapping(position.id),
    ]);
    const ausgewaehlt = new Set(mapping.map((item) => String(item.wildklasse_id)));
    const liste = element("ppMappingListe");
    liste.innerHTML = "";
    wildklassen.forEach((wildklasse) => {
      const label = document.createElement("label");
      label.className = "ap-wizard-class";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = wildklasse.id;
      checkbox.checked = ausgewaehlt.has(String(wildklasse.id));
      label.append(checkbox, document.createTextNode(wildklasse.bezeichnung));
      liste.appendChild(label);
    });
    modal("ppMappingModal", true);
  }

  async function mappingSpeichern() {
    const ids = Array.from(
      element("ppMappingListe").querySelectorAll("input:checked"),
      (input) => input.value,
    );
    try {
      await PlanpositionService.saveMapping(aktuellePosition.id, ids);
      modal("ppMappingModal", false);
      AppFeedback.success("Zuordnung gespeichert.");
    } catch (error) { alert(error.message); }
  }

  return { init };
})();
