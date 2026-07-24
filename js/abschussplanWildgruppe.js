/* ==========================================================
   DP_Jagd
   abschussplanWildgruppe.js
   Teil 1
========================================================== */

const AbschussplanWildgruppe = (() => {
  const GROUP_MAP = {
    RW: "Rotwild",
    RE: "Rehwild",
    GA: "Gamswild",
  };

  function resolveWildgruppe(code) {
    return GROUP_MAP[code] || code;
  }

  async function getWildgruppeId(groupName) {
    const gruppen = await AbschussplanService.getWildgruppen();

    const gruppe = gruppen.find(
      (g) => g.bezeichnung === groupName || String(g.id) === String(groupName),
    );

    return gruppe ? gruppe.id : null;
  }

  async function getKJPlan(planperiodeId, wildgruppeId) {
    const plaene = await AbschussplanService.getAbschussplaeneNachTyp(
      planperiodeId,
      wildgruppeId,
      "KJ",
    );

    return plaene[0] || null;
  }

  async function getInternPlaene(planperiodeId, wildgruppeId) {
    return AbschussplanService.getAbschussplaeneNachTyp(
      planperiodeId,
      wildgruppeId,
      "INTERN",
    );
  }

  async function buildGroupPane(groupCode, containerId) {
    const container = document.getElementById(containerId);

    if (!container) return;

    const template = document.getElementById("ap-species-template");

    if (!template) return;

    container.innerHTML = "";

    const clone = template.content.cloneNode(true);

    container.appendChild(clone);

    const card = container.querySelector(".ap-species");

    const title = card.querySelector(".ap-species-title");

    const info = card.querySelector(".ap-planperiode-info");

    const body = card.querySelector(".ap-species-body");

    const table = card.querySelector(".ap-species-table");

    const noData = card.querySelector(".ap-no-data-message");

    const btnEdit = card.querySelector(".ap-edit-kj");

    const btnDelete = card.querySelector(".ap-delete-kj");

    const internContainer = card.querySelector(".ap-intern-plaene");

    const groupName = resolveWildgruppe(groupCode);

    title.textContent = groupName;

    const planperiode = await AbschussplanService.getAktivePlanperiode();

    if (!planperiode) {
      info.textContent = "Keine aktive Planperiode";

      table.hidden = true;

      noData.style.display = "block";

      btnEdit.hidden = true;
      btnDelete.hidden = true;

      return;
    }

    info.textContent = `KJ-Abschussplan · Planperiode ${planperiode.startjahr} / ${planperiode.endjahr}`;
    info.hidden = false;

    const wildgruppeId = await getWildgruppeId(groupName);

    const plan = await getKJPlan(planperiode.id, wildgruppeId);

    if (!plan) {
      table.hidden = true;

      noData.style.display = "block";

      noData.textContent = "Kein KJ-Abschussplan vorhanden.";

      btnEdit.hidden = true;
      btnDelete.hidden = true;
    } else {
      btnEdit.hidden = false;
      btnDelete.hidden = false;

      btnEdit.onclick = () => openKJModal(groupCode);

      btnDelete.onclick = () => deleteKJPlanForGroup(groupCode);

      table.hidden = false;

      noData.style.display = "none";

      body.innerHTML = "";

      const positionen = await AbschussplanService.getPositionen(plan.id);

      positionen.forEach((pos) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${pos.wildklassen?.bezeichnung ?? ""}</td>
            <td>${pos.soll}</td>
        `;

        body.appendChild(tr);
      });
    }

    await renderInternPlaene(
      groupCode,
      wildgruppeId,
      planperiode,
      internContainer,
    );
  }

  async function renderInternPlaene(
    groupCode,
    wildgruppeId,
    planperiode,
    container,
  ) {
    if (!container) return;

    container.innerHTML = "";

    const plaene = await getInternPlaene(planperiode.id, wildgruppeId);
    const klassen = await AbschussplanService.getWildklassen(
      wildgruppeId,
      false,
    );
    const jahre = [planperiode.startjahr, planperiode.endjahr];

    for (const jahr of jahre) {
      const plan =
        plaene.find((eintrag) => Number(eintrag.jahr) === Number(jahr)) || null;
      const bereich = document.createElement("div");
      const actionBar = document.createElement("div");
      const leer = document.createElement("div");
      const buttonGruppe = document.createElement("div");
      const button = document.createElement("button");
      const info = document.createElement("div");
      const titel = document.createElement("h2");

      actionBar.className = "action-bar";
      leer.textContent = "";
      buttonGruppe.className = "btn-group";
      button.className = "btn btn-outline";
      button.type = "button";
      button.textContent = "Bearbeiten";
      button.hidden = !plan;
      button.onclick = () => openInternModal(groupCode, jahr);
      info.className = "ap-planperiode-info";
      info.textContent =
        `INTERN-Abschussplan · Jahr ${jahr} · ` +
        `Planperiode ${planperiode.startjahr} / ${planperiode.endjahr}`;
      titel.textContent = `INTERN ${jahr}`;

      buttonGruppe.appendChild(button);
      actionBar.append(leer, buttonGruppe);
      bereich.append(actionBar, info, titel);

      if (!plan) {
        const noData = document.createElement("div");
        noData.className = "no-data";
        noData.style.display = "block";
        noData.textContent = `Kein INTERN-Abschussplan für ${jahr} vorhanden.`;
        bereich.appendChild(noData);
      } else {
        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const header = document.createElement("tr");
        const klasseHeader = document.createElement("th");
        const sollHeader = document.createElement("th");
        const tbody = document.createElement("tbody");
        const positionen = await AbschussplanService.getPositionen(plan.id);

        table.className = "person-table";
        klasseHeader.textContent = "Klasse";
        sollHeader.textContent = "Soll";
        header.append(klasseHeader, sollHeader);
        thead.appendChild(header);

        klassen.forEach((klasseEintrag) => {
          const position = positionen.find(
            (eintrag) =>
              String(eintrag.klasse_id) === String(klasseEintrag.id),
          );
          const tr = document.createElement("tr");
          const klasse = document.createElement("td");
          const soll = document.createElement("td");

          klasse.textContent = klasseEintrag.bezeichnung || "";
          soll.textContent = position?.soll ?? 0;
          tr.append(klasse, soll);
          tbody.appendChild(tr);
        });

        table.append(thead, tbody);
        bereich.appendChild(table);
      }

      container.appendChild(bereich);
    }
  }

  async function renderGroup(groupCode, containerId) {
    await buildGroupPane(groupCode, containerId);
  }

  async function openKJModal(groupCode) {
    const modal = document.getElementById("kjPlanModal");
    const title = document.getElementById("kjModalTitle");
    const txtPlanperiode = document.getElementById("kjPlanperiode");
    const txtWildgruppe = document.getElementById("kjWildgruppe");
    const tableContainer = document.getElementById("kjPlanTableContainer");
    const empty = document.getElementById("kjPlanEmpty");
    const body = document.getElementById("kjPlanPositionsBody");

    if (
      !modal ||
      !title ||
      !txtPlanperiode ||
      !txtWildgruppe ||
      !tableContainer ||
      !empty ||
      !body
    ) {
      return;
    }

    const groupName = resolveWildgruppe(groupCode);

    title.textContent = `KJ-Abschussplan ${groupName}`;

    body.innerHTML = "";

    modal.dataset.planId = "";

    txtWildgruppe.value = groupName;

    const planperiode = await AbschussplanService.getAktivePlanperiode();

    if (!planperiode) {
      txtPlanperiode.value = "";

      empty.textContent = "Keine aktive Planperiode vorhanden.";

      empty.style.display = "block";

      tableContainer.style.display = "none";

      modal.style.display = "block";

      return;
    }

    txtPlanperiode.value = `${planperiode.startjahr} / ${planperiode.endjahr}`;

    const wildgruppeId = await getWildgruppeId(groupName);

    const plan = await getKJPlan(planperiode.id, wildgruppeId);

    if (!plan) {
      empty.style.display = "block";

      empty.textContent = "Kein KJ-Abschussplan vorhanden.";

      tableContainer.style.display = "none";

      modal.style.display = "block";

      return;
    }

    modal.dataset.planId = plan.id;

    empty.style.display = "none";

    tableContainer.style.display = "block";

    const klassen = await AbschussplanService.getWildklassen(wildgruppeId);

    const positionen = await AbschussplanService.getPositionen(plan.id);

    body.innerHTML = "";

    for (const klasse of klassen) {
      const position = positionen.find(
        (p) => String(p.klasse_id) === String(klasse.id),
      );

      const tr = document.createElement("tr");

      tr.innerHTML = `
      <td>${klasse.bezeichnung}</td>
      <td>
        <input
          type="number"
          class="kj-plan-soll"
          data-position-id="${position?.id ?? ""}"
          data-klasse-id="${klasse.id}"
          value="${position?.soll ?? 0}">
      </td>
    `;

      body.appendChild(tr);
    }

    modal.style.display = "block";

    modal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";
  }

  function closeKJModal() {
    const modal = document.getElementById("kjPlanModal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function openInternModal(groupCode, jahr) {
    const modal = document.getElementById("internPlanModal");
    const title = document.getElementById("internModalTitle");
    const txtPlanperiode = document.getElementById("internPlanperiode");
    const txtJahr = document.getElementById("internJahr");
    const txtWildgruppe = document.getElementById("internWildgruppe");
    const tableContainer = document.getElementById(
      "internPlanTableContainer",
    );
    const empty = document.getElementById("internPlanEmpty");
    const body = document.getElementById("internPlanPositionsBody");

    if (
      !modal ||
      !title ||
      !txtPlanperiode ||
      !txtJahr ||
      !txtWildgruppe ||
      !tableContainer ||
      !empty ||
      !body
    ) {
      return;
    }

    const groupName = resolveWildgruppe(groupCode);
    const planperiode = await AbschussplanService.getAktivePlanperiode();

    title.textContent = `INTERN-Abschussplan ${groupName}`;
    txtWildgruppe.value = groupName;
    txtJahr.value = jahr;
    body.innerHTML = "";
    modal.dataset.planId = "";
    modal.dataset.groupCode = groupCode;

    if (!planperiode) {
      txtPlanperiode.value = "";
      empty.textContent = "Keine aktive Planperiode vorhanden.";
      empty.style.display = "block";
      tableContainer.style.display = "none";
      modal.style.display = "block";
      return;
    }

    txtPlanperiode.value =
      `${planperiode.startjahr} / ${planperiode.endjahr}`;

    const wildgruppeId = await getWildgruppeId(groupName);
    const plaene = await getInternPlaene(planperiode.id, wildgruppeId);
    const plan =
      plaene.find((eintrag) => Number(eintrag.jahr) === Number(jahr)) || null;

    if (!plan) {
      empty.textContent = `Kein INTERN-Abschussplan für ${jahr} vorhanden.`;
      empty.style.display = "block";
      tableContainer.style.display = "none";
      modal.style.display = "block";
      return;
    }

    modal.dataset.planId = plan.id;
    empty.style.display = "none";
    tableContainer.style.display = "block";

    const klassen = await AbschussplanService.getWildklassen(
      wildgruppeId,
      false,
    );
    const positionen = await AbschussplanService.getPositionen(plan.id);

    for (const klasse of klassen) {
      const position = positionen.find(
        (eintrag) => String(eintrag.klasse_id) === String(klasse.id),
      );
      const tr = document.createElement("tr");
      const klasseCell = document.createElement("td");
      const sollCell = document.createElement("td");
      const input = document.createElement("input");

      klasseCell.textContent = klasse.bezeichnung;
      input.type = "number";
      input.className = "intern-plan-soll";
      input.dataset.positionId = position?.id || "";
      input.dataset.klasseId = klasse.id;
      input.value = position?.soll ?? 0;
      sollCell.appendChild(input);
      tr.append(klasseCell, sollCell);
      body.appendChild(tr);
    }

    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeInternModal() {
    const modal = document.getElementById("internPlanModal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function saveInternPlan() {
    const modal = document.getElementById("internPlanModal");
    const body = document.getElementById("internPlanPositionsBody");

    if (!modal || !body) return;

    const planId = modal.dataset.planId;

    if (!planId) {
      alert("INTERN-Abschussplan nicht gefunden.");
      return;
    }

    const plan = await AbschussplanService.getAbschussplan(planId);

    if (!plan) {
      alert("INTERN-Abschussplan konnte nicht geladen werden.");
      return;
    }

    const inputs = body.querySelectorAll(".intern-plan-soll");

    for (const input of inputs) {
      const payload = {
        plan_id: plan.id,
        klasse_id: input.dataset.klasseId,
        soll: Number(input.value) || 0,
      };
      const positionId = input.dataset.positionId;

      if (positionId) {
        const gespeichert = await AbschussplanService.updatePosition(
          positionId,
          payload,
        );

        if (!gespeichert) {
          alert("Fehler beim Speichern.");
          return;
        }
      } else {
        const position =
          await AbschussplanService.createPosition(payload);

        if (!position) {
          alert("Fehler beim Speichern.");
          return;
        }

        input.dataset.positionId = position.id;
      }
    }

    closeInternModal();
    await window.Abschussplan.renderAll();
  }

  function wireInternModal() {
    const modal = document.getElementById("internPlanModal");
    const btnClose = document.getElementById("internModalClose");
    const btnCancel = document.getElementById("internPlanCancel");
    const btnSave = document.getElementById("internPlanSave");

    if (btnClose) btnClose.onclick = closeInternModal;
    if (btnCancel) btnCancel.onclick = closeInternModal;
    if (btnSave) btnSave.onclick = saveInternPlan;

    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeInternModal();
        }
      });
    }
  }

  async function saveKJPlan() {
    const modal = document.getElementById("kjPlanModal");
    const body = document.getElementById("kjPlanPositionsBody");

    if (!modal || !body) {
      return;
    }

    const planId = modal.dataset.planId;

    if (!planId) {
      alert("KJ-Abschussplan nicht gefunden.");
      return;
    }

    const plan = await AbschussplanService.getAbschussplan(planId);

    if (!plan) {
      alert("KJ-Abschussplan konnte nicht geladen werden.");
      return;
    }

    const inputs = body.querySelectorAll(".kj-plan-soll");

    for (const input of inputs) {
      const positionId = input.dataset.positionId;

      const klasseId = input.dataset.klasseId;

      const soll = Number(input.value) || 0;

      const payload = {
        plan_id: plan.id,
        klasse_id: klasseId,
        soll: soll,
      };

      if (positionId) {
        const ok = await AbschussplanService.updatePosition(
          positionId,
          payload,
        );

        if (!ok) {
          alert("Fehler beim Speichern.");
          return;
        }
      } else {
        const neu = await AbschussplanService.createPosition(payload);

        if (!neu) {
          alert("Fehler beim Speichern.");
          return;
        }

        input.dataset.positionId = neu.id;
      }
    }

    closeKJModal();

    await window.Abschussplan.renderAll();
  }

  async function deleteKJPlan() {
    if (!confirm("KJ-Abschussplan wirklich löschen?")) {
      return;
    }

    const wildgruppe = document.getElementById("kjWildgruppe").value;

    const deleted = await deleteKJPlanForGroup(wildgruppe);

    if (deleted) {
      closeKJModal();

      await window.Abschussplan.renderAll();
    }
  }

  function wireKJModal() {
    const modal = document.getElementById("kjPlanModal");

    const btnClose = document.getElementById("kjModalClose");

    const btnSave = document.getElementById("kjPlanSave");

    const btnDelete = document.getElementById("kjPlanDelete");

    if (btnClose) {
      btnClose.onclick = closeKJModal;
    }

    if (btnSave) {
      btnSave.onclick = saveKJPlan;
    }

    if (btnDelete) {
      btnDelete.onclick = deleteKJPlan;
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          closeKJModal();
        }
      });
    }
  }

  async function deleteKJPlanForGroup(groupCode) {
    const planperiode = await AbschussplanService.getAktivePlanperiode();

    if (!planperiode) {
      alert("Keine aktive Planperiode vorhanden.");
      return false;
    }

    const groupName = resolveWildgruppe(groupCode);

    const wildgruppeId = await getWildgruppeId(groupName);

    const plan = await getKJPlan(planperiode.id, wildgruppeId);

    if (!plan) {
      return false;
    }

    const positionen = await AbschussplanService.getPositionen(plan.id);

    for (const position of positionen) {
      const ok = await AbschussplanService.deletePosition(position.id);

      if (!ok) {
        alert("Position konnte nicht gelöscht werden.");
        return false;
      }
    }

    const ok = await AbschussplanService.deleteAbschussplan(plan.id);

    if (!ok) {
      alert("Abschussplan konnte nicht gelöscht werden.");
      return false;
    }

    await renderGroup(groupCode, `ap-${groupCode.toLowerCase()}`);

    return true;
  }

  const api = {
    renderGroup,
    openKJModal,
    wireKJModal,
    saveKJPlan,
    deleteKJPlan,
    deleteKJPlanForGroup,
    openInternModal,
    wireInternModal,
    saveInternPlan,
  };

  window.AbschussplanWildgruppe = api;
  return api;
})();
