/* Abschussplan — Platzhalter-Implementation für Sprint 3.0
   Liefert Seitenstruktur, Platzhalterdaten und berechnende Helferfunktionen.
   Später kann dies an Supabase angebunden werden.
*/

(function () {
  const KJ_PLANS = [
    { id: "2025-2026", start: 2025, end: 2026 },
    { id: "2024-2025", start: 2024, end: 2025 },
  ];

  const CLASSES = ["K0", "K1", "K2"];

  // Placeholder Abschuss (tatsächliche Ist-Zahlen), keyed by [group][year]
  const ABSCHUSS = {};

  // Placeholder Soll 2 Jahre and Intern plans per group/class
  const PLAN_PLACEHOLDER = {};

  // Placeholder intern first year values (editable)
  const INTERN_PLACEHOLDER = {};

  function $(sel, ctx = document) {
    return ctx.querySelector(sel);
  }
  function $all(sel, ctx = document) {
    return Array.from(ctx.querySelectorAll(sel));
  }

  function computeVorschlag(soll2, internFirst) {
    return (Number(soll2) || 0) - (Number(internFirst) || 0);
  }

  function computeAktuellerSoll(soll2, actualFirst) {
    return (Number(soll2) || 0) - (Number(actualFirst) || 0);
  }

  async function renderOverview() {
    const tbody = document.getElementById("ap-overview-body");

    if (!tbody) {
      return;
    }

    tbody.innerHTML = "";

    const gruppen = await AbschussplanService.getWildgruppen();

    for (const gruppe of gruppen) {
      const tr = document.createElement("tr");

      tr.innerHTML = `
      <td>${gruppe.bezeichnung}</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
    `;

      tbody.appendChild(tr);
    }
  }

  function sumPlaceholder(obj) {
    if (!obj) {
      return 0;
    }

    return Object.values(obj).reduce((sum, value) => {
      return sum + Number(value || 0);
    }, 0);
  }

  async function renderSpecies(groupId) {
    const container = document.getElementById(`ap-${groupId.toLowerCase()}`);
    if (!container || !window.AbschussplanWildgruppe) return;
    await AbschussplanWildgruppe.renderGroup(groupId, container.id);
  }

  function getNumberColor(ist, soll) {
    if (ist === 0) return "#000000";
    if (ist < soll) return "#e67e22";
    if (ist === soll) return "#27ae60";
    return "#c0392b";
  }

  function formatPlanperiodeValue(planperiode, species) {
    const soll = getPlaceholderSoll(species);
    const ist = getPlaceholderIst(planperiode, species);
    return `${ist} / ${soll}`;
  }

  async function renderPlanperiodenTable() {
    const tbody = document.getElementById("ap-jahre-body");
    const empty = document.getElementById("ap-jahre-empty");
    const error = document.getElementById("ap-jahre-error");

    if (!tbody || !empty || !error) return;

    tbody.innerHTML = "";
    empty.style.display = "none";
    error.style.display = "none";

    try {
      const planperioden = await AbschussplanService.getPlanperioden();

      if (!planperioden || planperioden.length === 0) {
        empty.style.display = "block";
        return;
      }

      for (const period of planperioden) {
        const zeitraum = `${period.startjahr} / ${period.endjahr}`;
        const status = period.status;
        const plaene = await AbschussplanService.getAbschussplaene(period.id);

        //console.log("Planperiode:", period.id);
        //console.log("Abschusspläne:", plaene);

        const erstellt = plaene.length;
        const erwartet = 9;

        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${zeitraum}</td>
          <td>${status}</td>
          <td>${erstellt} / ${erwartet}</td>
          <td>0 / 0</td>
          <td>0 / 0</td>
          <td class="action-cell"></td>
        `;

        tbody.appendChild(tr);

        const actionCell = tr.querySelector(".action-cell");

        // Bearbeiten

        const editBtn = document.createElement("button");
        editBtn.className = "action-btn edit-btn";
        editBtn.title = "Bearbeiten";
        editBtn.innerHTML = "✏";
        editBtn.onclick = () => openPlanperiodeModal("edit", period.id);
        actionCell.appendChild(editBtn);

        // Aktiv

        if (status !== "AKTIV") {
          const aktivBtn = document.createElement("button");
          aktivBtn.className = "action-btn aktiv-btn";
          aktivBtn.title = "Aktiv setzen";
          aktivBtn.innerHTML = "✔";

          aktivBtn.onclick = async () => {
            const ok = await AbschussplanService.setPlanperiodeStatus(
              period.id,
              "AKTIV",
            );

            if (ok) {
              await renderAll();
            }
          };

          actionCell.appendChild(aktivBtn);
        }

        // Archiv

        if (status !== "ARCHIV") {
          const archivBtn = document.createElement("button");
          archivBtn.className = "action-btn archiv-btn";
          archivBtn.title = "Archivieren";
          archivBtn.innerHTML = "📦";

          archivBtn.onclick = async () => {
            const ok = await AbschussplanService.setPlanperiodeStatus(
              period.id,
              "ARCHIV",
            );

            if (ok) {
              await renderPlanperiodenTable();
            }
          };

          actionCell.appendChild(archivBtn);
        }

        // Löschen

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "action-btn delete-btn";
        deleteBtn.title = "Löschen";
        deleteBtn.innerHTML = "🗑";

        deleteBtn.onclick = async () => {
          if (!confirm("Planperiode wirklich löschen?")) {
            return;
          }

          const ok = await AbschussplanService.deletePlanperiode(period.id);

          if (ok) {
            await renderAll();
          } else {
            alert("Planperiode konnte nicht gelöscht werden.");
          }
        };

        actionCell.appendChild(deleteBtn);
      }
    } catch (err) {
      console.error(err);

      error.style.display = "block";
    }
  }

  async function openPlanperiodeModal(mode, planperiodeId) {
    const modal = document.getElementById("apPlanperiodeModal");
    const title = document.getElementById("apPlanperiodeModalTitle");
    const nameInput = document.getElementById("apPlanperiodeName");
    const startInput = document.getElementById("apPlanperiodeStartjahr");
    const endInput = document.getElementById("apPlanperiodeEndjahr");
    const remarkInput = document.getElementById("apPlanperiodeBemerkung");

    if (
      !modal ||
      !title ||
      !nameInput ||
      !startInput ||
      !endInput ||
      !remarkInput
    )
      return;

    if (mode === "edit" && planperiodeId) {
      title.textContent = "Planperiode bearbeiten";
      const planperioden = await AbschussplanService.getPlanperioden();
      //console.log("planperioden", planperioden);
      const period = (planperioden || []).find(
        (item) => String(item.id) === String(planperiodeId),
      );
      if (!period) {
        alert("Planperiode nicht gefunden.");
        return;
      }
      modal.dataset.editId = period.id;
      nameInput.value = period.bezeichnung || "";
      startInput.value = period.startjahr || "";
      endInput.value = period.endjahr || "";
      remarkInput.value = period.bemerkung || "";
    } else {
      title.textContent = "Neue Planperiode";
      modal.dataset.editId = "";
      nameInput.value = "";
      startInput.value = "";
      endInput.value = "";
      remarkInput.value = "";
    }

    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closePlanperiodeModal() {
    const modal = document.getElementById("apPlanperiodeModal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function createStandardPositionen(plan) {
    const klassen = await AbschussplanService.getWildklassen(
      plan.wildgruppe_id,
    );

    for (const klasse of klassen) {
      await AbschussplanService.createPosition({
        plan_id: plan.id,
        klasse_id: klasse.id,
        soll: 0,
      });
    }
  }

  async function savePlanperiode() {
    const modal = document.getElementById("apPlanperiodeModal");

    const nameInput = document.getElementById("apPlanperiodeName");
    const startInput = document.getElementById("apPlanperiodeStartjahr");
    const endInput = document.getElementById("apPlanperiodeEndjahr");
    const remarkInput = document.getElementById("apPlanperiodeBemerkung");

    const bezeichnung = nameInput.value.trim();
    const startjahr = Number(startInput.value);
    const endjahr = Number(endInput.value);
    const bemerkung = remarkInput.value.trim();

    if (!bezeichnung) {
      alert("Bitte eine Bezeichnung eingeben.");
      return;
    }

    if (!startjahr || !endjahr) {
      alert("Bitte Start- und Endjahr eingeben.");
      return;
    }

    if (endjahr !== startjahr + 1) {
      alert("Endjahr muss genau ein Jahr nach dem Startjahr liegen.");
      return;
    }

    const payload = {
      bezeichnung,
      startjahr,
      endjahr,
      bemerkung,
    };

    let result;

    if (modal.dataset.editId) {
      result = await AbschussplanService.updatePlanperiode(
        modal.dataset.editId,
        payload,
      );
    } else {
      result = await AbschussplanService.createPlanperiode(payload);

      if (result) {
        const wildgruppen = await AbschussplanService.getWildgruppen();
        const planTypen = ["KJ", "INTERN"];

        for (const wildgruppe of wildgruppen) {
          for (const planTyp of planTypen) {
            if (planTyp === "KJ") {
              const kjPlan = await AbschussplanService.createAbschussplan({
                planperiode_id: result.id,
                wildgruppe_id: wildgruppe.id,
                plan_typ: "KJ",
                jahr: null,
              });

              if (kjPlan) {
                await createStandardPositionen(kjPlan);
              }
            } else {
              const internPlan1 = await AbschussplanService.createAbschussplan({
                planperiode_id: result.id,
                wildgruppe_id: wildgruppe.id,
                plan_typ: "INTERN",
                jahr: startjahr,
              });

              if (internPlan1) {
                await createStandardPositionen(internPlan1);
              }

              const internPlan2 = await AbschussplanService.createAbschussplan({
                planperiode_id: result.id,
                wildgruppe_id: wildgruppe.id,
                plan_typ: "INTERN",
                jahr: endjahr,
              });

              if (internPlan2) {
                await createStandardPositionen(internPlan2);
              }
            }
          }
        }

        const aktiv = confirm(
          "Die Planperiode wurde erfolgreich angelegt.\n\n" +
            "Soll sie jetzt als AKTIVE Planperiode gesetzt werden?",
        );

        if (aktiv) {
          await AbschussplanService.setPlanperiodeStatus(result.id, "AKTIV");
        }
      }
    }

    if (!result) {
      alert("Planperiode konnte nicht gespeichert werden.");
      return;
    }

    closePlanperiodeModal();

    await renderAll();
  }

  function wirePlanperiodeEvents() {
    const addButton = document.getElementById("ap-add-planperiode");
    const closeButton = document.getElementById("apPlanperiodeClose");
    const cancelButton = document.getElementById("apPlanperiodeCancel");
    const saveButton = document.getElementById("apPlanperiodeSave");
    const modal = document.getElementById("apPlanperiodeModal");

    if (addButton)
      addButton.addEventListener("click", () => openPlanperiodeModal("new"));
    if (closeButton)
      closeButton.addEventListener("click", closePlanperiodeModal);
    if (cancelButton)
      cancelButton.addEventListener("click", closePlanperiodeModal);
    if (saveButton) saveButton.addEventListener("click", savePlanperiode);
    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closePlanperiodeModal();
        }
      });
    }
  }

  function wireTabs() {
    $all(".pers-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activateTab(btn.dataset.target);
      });
    });
  }

  function activateTab(targetId) {
    $all(".ap-pane").forEach((p) => (p.hidden = true));
    $all(".pers-tab-btn").forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.target === targetId),
    );
    const target = document.getElementById(targetId);
    if (target) {
      target.hidden = false;
    }

    const searchGroup = document.querySelector(".search-group");
    if (searchGroup) {
      searchGroup.style.display = targetId === "ap-rotwild" ? "none" : "";
    }
  }

  async function renderAll() {
    renderOverview();
    await Promise.all([
      renderSpecies("Rotwild"),
      renderSpecies("Rehwild"),
      renderSpecies("Gamswild"),
    ]);
    await renderPlanperiodenTable();
  }

  async function init() {
    if (!document.getElementById("ap-overview")) {
      return;
    }

    wireTabs();

    AbschussplanWildgruppe.wireKJModal();
    AbschussplanWildgruppe.wireInternModal();

    wirePlanperiodeEvents();

    await renderAll();

    activateTab("ap-overview");
  }

  window.Abschussplan = {
    init,

    computeVorschlag,

    computeAktuellerSoll,

    activateTab,

    renderAll,

    _data: {
      KJ_PLANS,
      CLASSES,
    },
  };
})();
