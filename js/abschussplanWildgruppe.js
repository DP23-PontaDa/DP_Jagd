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
    const plaene = await AbschussplanService.getAbschussplaene(planperiodeId);

    return (
      plaene.find(
        (p) =>
          String(p.wildgruppe_id) === String(wildgruppeId) &&
          p.plan_typ === "KJ",
      ) || null
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

    const wildgruppeId = await getWildgruppeId(groupName);

    const plan = await getKJPlan(planperiode.id, wildgruppeId);

    if (!plan) {
      table.hidden = true;

      noData.style.display = "block";

      noData.textContent = "Kein KJ-Abschussplan vorhanden.";

      btnEdit.hidden = true;
      btnDelete.hidden = true;

      //btnNew.onclick = () => openKJModal(groupCode);

      return;
    }

    btnEdit.hidden = false;
    btnDelete.hidden = false;

    //btnNew.onclick = () => openKJModal(groupCode);

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
  };

  window.AbschussplanWildgruppe = api;
  return api;
})();
