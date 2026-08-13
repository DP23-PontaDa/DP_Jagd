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
  let overviewCharts = [];

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

  function formatPlanposition(planposition) {
    return planposition?.bezeichnung || "";
  }

  async function renderOverview() {
    const container = document.getElementById("ap-overview-content");
    if (!container) return;
    overviewCharts.forEach((chart) => chart.destroy());
    overviewCharts = [];
    container.innerHTML = "";

    const planperiode = await AbschussplanService.getAktivePlanperiode();
    if (!planperiode) {
      const leer = document.createElement("div");
      leer.className = "no-data";
      leer.textContent = "Keine aktive Planperiode vorhanden.";
      container.appendChild(leer);
      return;
    }

    const periode = document.createElement("div");
    periode.className = "ap-overview-period";
    const periodeLabel = document.createElement("span");
    const periodeWert = document.createElement("strong");
    periodeLabel.textContent = "Aktive Planperiode";
    periodeWert.textContent =
      `${planperiode.startjahr} / ${planperiode.endjahr}`;
    periode.append(periodeLabel, periodeWert);
    container.appendChild(periode);

    const [gruppen, periodPositionen, plaene] = await Promise.all([
      AbschussplanService.getWildgruppen(),
      AbschussplanService.getPlanperiodePlanpositionen(planperiode.id),
      AbschussplanService.getAbschussplaene(planperiode.id),
    ]);

    for (const gruppe of gruppen) {
      const klassen = periodPositionen
        .filter(
          (eintrag) =>
            eintrag.aktiv === true &&
            String(eintrag.wildgruppe_id) === String(gruppe.id),
        )
        .sort(
          (a, b) =>
            Number(a.reihenfolge ?? Number.MAX_SAFE_INTEGER) -
            Number(b.reihenfolge ?? Number.MAX_SAFE_INTEGER),
        );
      if (!klassen.length) continue;

      const gruppenPlaene = plaene.filter(
        (plan) => String(plan.wildgruppe_id) === String(gruppe.id),
      );
      const kjPlan = gruppenPlaene.find((plan) => plan.plan_typ === "KJ");
      const jahr1Plan = gruppenPlaene.find(
        (plan) =>
          plan.plan_typ === "INTERN" &&
          Number(plan.jahr) === Number(planperiode.startjahr),
      );
      const jahr2Plan = gruppenPlaene.find(
        (plan) =>
          plan.plan_typ === "INTERN" &&
          Number(plan.jahr) === Number(planperiode.endjahr),
      );
      const gruppenPositionen = await Promise.all(
        [kjPlan, jahr1Plan, jahr2Plan].map((plan) =>
          plan
            ? AbschussplanService.getPositionen(plan.id)
            : Promise.resolve([]),
        ),
      );

      const bereich = document.createElement("section");
      bereich.className = "ap-overview-group";
      const ziel = uebersichtWildgruppenZiel(gruppe.bezeichnung);
      if (ziel) {
        bereich.classList.add("is-clickable");
        bereich.tabIndex = 0;
        bereich.setAttribute("role", "button");
        bereich.addEventListener("click", () => activateTab(ziel));
        bereich.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activateTab(ziel);
          }
        });
      }
      const titel = document.createElement("h3");
      titel.textContent = String(gruppe.bezeichnung || "").toLocaleUpperCase(
        "de",
      );
      bereich.appendChild(titel);

      const summen = gruppenPositionen.map((positionen) =>
        klassen.reduce((summe, klasse) => {
          const position = positionen.find(
            (eintrag) =>
              String(eintrag.planperiode_planposition_id) === String(klasse.id),
          );
          return summe + Number(position?.soll || 0);
        }, 0),
      );
      const summary = document.createElement("div");
      summary.className = "ap-overview-totals";
      [
        ["KJ Gesamt", summen[0]],
        [`${planperiode.startjahr} Gesamt`, summen[1]],
        [`${planperiode.endjahr} Gesamt`, summen[2]],
      ].forEach(([label, wert]) => {
        const item = document.createElement("div");
        const beschriftung = document.createElement("span");
        const zahl = document.createElement("strong");
        beschriftung.textContent = label;
        zahl.textContent = wert;
        item.append(beschriftung, zahl);
        summary.appendChild(item);
      });
      bereich.appendChild(summary);

      const chartContainer = document.createElement("div");
      chartContainer.className = "ap-overview-chart";
      const canvas = document.createElement("canvas");
      canvas.setAttribute(
        "aria-label",
        `Abschussplan ${gruppe.bezeichnung}`,
      );
      canvas.setAttribute("role", "img");
      chartContainer.appendChild(canvas);
      bereich.appendChild(chartContainer);
      container.appendChild(bereich);

      if (window.Chart) {
        const labels = klassen.map(formatPlanposition);
        const werte = gruppenPositionen.map((positionen) =>
          klassen.map((klasse) => {
            const position = positionen.find(
              (eintrag) =>
                String(eintrag.planperiode_planposition_id) === String(klasse.id),
            );
            return Number(position?.soll || 0);
          }),
        );
        overviewCharts.push(
          new Chart(canvas, {
            type: "bar",
            data: {
              labels,
              datasets: [
                {
                  label: "KJ",
                  data: werte[0],
                  backgroundColor: "#2878a8",
                  borderRadius: 4,
                },
                {
                  label: String(planperiode.startjahr),
                  data: werte[1],
                  backgroundColor: "#167c68",
                  borderRadius: 4,
                },
                {
                  label: String(planperiode.endjahr),
                  data: werte[2],
                  backgroundColor: "#d47b19",
                  borderRadius: 4,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 450 },
              plugins: {
                legend: {
                  position: "top",
                  align: "end",
                },
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: { maxRotation: 0, minRotation: 0 },
                },
                y: {
                  beginAtZero: true,
                  ticks: { precision: 0 },
                },
              },
            },
          }),
        );
      }
    }
  }

  async function renderSpecies(groupId) {
    const container = document.getElementById(`ap-${groupId.toLowerCase()}`);
    if (!container || !window.AbschussplanWildgruppe) return;
    await AbschussplanWildgruppe.renderGroup(groupId, container.id);
  }

  function uebersichtWildgruppenZiel(bezeichnung) {
    const name = String(bezeichnung || "").toLocaleLowerCase("de");
    if (name === "rotwild") return "ap-rotwild";
    if (name === "rehwild") return "ap-rehwild";
    if (name === "gamswild") return "ap-gamswild";
    return null;
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
      if (!planperioden?.length) {
        empty.textContent = "Keine Planperioden vorhanden.";
        empty.style.display = "block";
        return;
      }

      for (const period of planperioden) {
        const [wildgruppen, einrichtung] = await Promise.all([
          AbschussplanService.getPlanperiodeJahresuebersicht(period.id),
          AbschussplanService.isPlanperiodeComplete(period.id),
        ]);
        const zeitraum = `${period.startjahr} / ${period.endjahr}`;
        const gruppenwerte = new Map(
          wildgruppen.map((wildgruppe) => [
            String(wildgruppe.wildgruppe || "").toLocaleLowerCase("de"),
            `${wildgruppe.soll_kj ?? 0} / ${wildgruppe.ist_kj ?? 0}`,
          ]),
        );
          const tr = document.createElement("tr");
          tr.dataset.id = period.id;
          const actionCell = document.createElement("td");
          actionCell.className = "action-cell";

          tr.innerHTML = `
            <td>${zeitraum}</td>
            <td>${period.status}</td>
            <td class="ap-number-column">${gruppenwerte.get("rotwild") || "– / –"}</td>
            <td class="ap-number-column">${gruppenwerte.get("rehwild") || "– / –"}</td>
            <td class="ap-number-column">${gruppenwerte.get("gamswild") || "– / –"}</td>
            <td>${einrichtung.planpositionen ? "✔ eingerichtet" : "✖ offen"}</td>
            <td>${einrichtung.abschussplaene ? "✔ eingerichtet" : "✖ offen"}</td>
          `;
          tr.appendChild(actionCell);
          tbody.appendChild(tr);

          if (!einrichtung.complete) {
            const fortsetzenBtn = document.createElement("button");
            fortsetzenBtn.className = "btn btn-outline";
            fortsetzenBtn.type = "button";
            fortsetzenBtn.textContent = "Einrichtung fortsetzen";
            fortsetzenBtn.onclick = () => {
              if (!einrichtung.planpositionen) {
                openPlanpositionenModal(period.id);
              } else {
                openPlaeneErzeugenModal(period.id);
              }
            };
            actionCell.appendChild(fortsetzenBtn);
          }

          const editBtn = document.createElement("button");
          editBtn.className = "action-btn edit-btn";
          editBtn.title = "Bearbeiten";
          editBtn.setAttribute("aria-label", "Bearbeiten");
          editBtn.onclick = () => openPlanperiodeModal("edit", period.id);
          actionCell.appendChild(editBtn);

          const planpositionenBtn = document.createElement("button");
          planpositionenBtn.className =
            "action-btn planpositionen-action-btn";
          planpositionenBtn.type = "button";
          planpositionenBtn.title = "Planpositionen";
          planpositionenBtn.setAttribute("aria-label", "Planpositionen");
          planpositionenBtn.onclick = () =>
            openPlanpositionenModal(
              period.id,
              period.status === "ARCHIV"
                ? "readonly"
                : "manage",
            );
          actionCell.appendChild(planpositionenBtn);

          if (period.status !== "AKTIV") {
            const aktivBtn = document.createElement("button");
            aktivBtn.className = "action-btn aktiv-btn";
            aktivBtn.title = "Aktiv setzen";
            aktivBtn.setAttribute("aria-label", "Aktiv setzen");
            aktivBtn.onclick = async () => {
              const ok = await AbschussplanService.setPlanperiodeStatus(
                period.id,
                "AKTIV",
              );
              if (ok) await renderAll();
            };
            actionCell.appendChild(aktivBtn);
          }

          if (period.status !== "ARCHIV") {
            const archivBtn = document.createElement("button");
            archivBtn.className = "action-btn archiv-btn";
            archivBtn.title = "Archivieren";
            archivBtn.setAttribute("aria-label", "Archivieren");
            archivBtn.onclick = async () => {
              const ok = await AbschussplanService.setPlanperiodeStatus(
                period.id,
                "ARCHIV",
              );
              if (ok) await renderPlanperiodenTable();
            };
            actionCell.appendChild(archivBtn);
          }

          const deleteBtn = document.createElement("button");
          deleteBtn.className = "action-btn delete-btn";
          deleteBtn.title = "Löschen";
          deleteBtn.setAttribute("aria-label", "Löschen");
          deleteBtn.onclick = async () => {
            if (!await AppFeedback.confirmDelete(
              "Planperiode löschen?",
              "Diese Aktion kann nicht rückgängig gemacht werden.",
            )) return;

            if (await AbschussplanService.deletePlanperiode(period.id)) {
              await renderAll();
              AppFeedback.success("Datensatz gelöscht.");
            } else {
              alert("Planperiode konnte nicht gelöscht werden.");
            }
          };
          actionCell.appendChild(deleteBtn);

          tr.addEventListener("click", (event) => {
            if (!event.target.closest("button")) {
              openPlanperiodeModal("read", period.id);
            }
          });
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

    if (mode !== "new" && planperiodeId) {
      title.textContent =
        mode === "read" ? "Planperiode" : "Planperiode bearbeiten";
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
      modal.dataset.status = period.status || "";
      nameInput.value = period.bezeichnung || "";
      startInput.value = period.startjahr || "";
      endInput.value = period.endjahr || "";
      remarkInput.value = period.bemerkung || "";
    } else {
      title.textContent = "Neue Planperiode";
      modal.dataset.editId = "";
      modal.dataset.status = "";
      nameInput.value = "";
      startInput.value = "";
      endInput.value = "";
      remarkInput.value = "";
    }

    DetailMode.setMode(modal, mode === "read" ? "read" : "edit", {
      capture: mode === "edit",
    });
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

    }

    if (!result) {
      alert("Planperiode konnte nicht gespeichert werden.");
      return;
    }

    if (!modal.dataset.editId) {
      await renderAll();
      closePlanperiodeModal();
      AppFeedback.success("Planperiode gespeichert.");
      if (result.id)
        AppFeedback.focusRow(`#ap-jahre-body tr[data-id="${result.id}"]`);
      return;
    }

    await renderAll();
    const gespeichertId = modal.dataset.editId || result.id;
    closePlanperiodeModal();
    AppFeedback.success("Planperiode gespeichert.");
    if (gespeichertId)
      AppFeedback.focusRow(
        `#ap-jahre-body tr[data-id="${gespeichertId}"]`,
      );
  }

  function closeWizardModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function wizardAbbrechen(id) {
    closeWizardModal(id);
    await renderPlanperiodenTable();
    activateTab("ap-jahre");
  }

  async function renderPlanperiodePlanpositionen(planperiodeId) {
    const liste = document.getElementById("apPlanpositionenListe");
    const eintraege =
      await AbschussplanService.getPlanperiodePlanpositionen(planperiodeId);
    const gruppen = new Map();

    eintraege.forEach((eintrag) => {
      const gruppe =
        eintrag.wildgruppen?.bezeichnung || "Weitere";
      if (!gruppen.has(gruppe)) gruppen.set(gruppe, []);
      gruppen.get(gruppe).push(eintrag);
    });

    liste.innerHTML = "";
    gruppen.forEach((klassen, gruppe) => {
      const bereich = document.createElement("section");
      bereich.className = "ap-wizard-group";
      const titel = document.createElement("h3");
      titel.textContent = gruppe;
      bereich.appendChild(titel);

      const klassenListe = document.createElement("div");
      klassenListe.className = "ap-wizard-class-list";

      klassen.forEach((eintrag) => {
        const label = document.createElement("label");
        label.className = "ap-wizard-class";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = eintrag.aktiv === true;
        checkbox.dataset.id = eintrag.id;
        label.append(
          checkbox,
          document.createTextNode(
            formatPlanposition(eintrag) || "Unbekannte Planposition",
          ),
        );
        klassenListe.appendChild(label);
      });
      bereich.appendChild(klassenListe);
      liste.appendChild(bereich);
    });
  }

  async function openPlanpositionenModal(planperiodeId, kontext = "wizard") {
    const modal = document.getElementById("apPlanpositionenModal");
    const readonly = kontext === "readonly";
    modal.dataset.planperiodeId = planperiodeId;
    modal.dataset.kontext = kontext;
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    try {
      if (kontext === "wizard") {
        await AbschussplanService.createPlanperiodePlanpositionen(planperiodeId);
      }
      await renderPlanperiodePlanpositionen(planperiodeId);
      modal.querySelectorAll("input").forEach((input) => {
        input.disabled = readonly;
      });
      document.getElementById("apPlanpositionenSync").hidden =
        readonly || kontext === "manage";
      document.getElementById("apPlanpositionenSave").hidden = readonly;
    } catch (error) {
      console.error("Planpositionen konnten nicht geladen werden:", error);
      alert("Die Planpositionen der Planperiode konnten nicht geladen werden.");
      closeWizardModal("apPlanpositionenModal");
    }
  }

  async function saveWizardPlanpositionen() {
    const modal = document.getElementById("apPlanpositionenModal");
    const planperiodeId = modal.dataset.planperiodeId;
    const planpositionen = Array.from(
      document.querySelectorAll("#apPlanpositionenListe input[data-id]"),
    ).map((checkbox) => ({
      id: checkbox.dataset.id,
      aktiv: checkbox.checked,
    }));

    if (!planpositionen.some((eintrag) => eintrag.aktiv)) {
      alert("Bitte mindestens eine Planposition auswählen.");
      return;
    }

    await AbschussplanService.savePlanperiodePlanpositionen(
      planperiodeId,
      planpositionen,
    );

    if (modal.dataset.kontext === "manage") {
      closeWizardModal("apPlanpositionenModal");
      await renderAll();
      activateTab("ap-jahre");
      AppFeedback.success("Planpositionen gespeichert.");
      return;
    }

    closeWizardModal("apPlanpositionenModal");
    AppFeedback.success("Planpositionen gespeichert.");
    openPlaeneErzeugenModal(planperiodeId);
  }

  function openPlaeneErzeugenModal(planperiodeId) {
    const modal = document.getElementById("apPlaeneErzeugenModal");
    modal.dataset.planperiodeId = planperiodeId;
    const alle = modal.querySelector('input[name="apPlanTyp"][value="ALLE"]');
    if (alle) alle.checked = true;
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function fragePlanAktualisierung() {
    const modal = document.getElementById("apPlaeneAktualisierenModal");
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    return new Promise((resolve) => {
      modal._resolveAuswahl = resolve;
    });
  }

  function planAktualisierungBeantworten(antwort) {
    const modal = document.getElementById("apPlaeneAktualisierenModal");
    closeWizardModal("apPlaeneAktualisierenModal");
    if (modal._resolveAuswahl) {
      modal._resolveAuswahl(antwort);
      modal._resolveAuswahl = null;
    }
  }

  async function plaeneErzeugen() {
    const modal = document.getElementById("apPlaeneErzeugenModal");
    const planperiodeId = modal.dataset.planperiodeId;
    const auswahl =
      modal.querySelector('input[name="apPlanTyp"]:checked')?.value || "ALLE";
    const button = document.getElementById("apPlaeneErzeugenStart");
    button.disabled = true;
    try {
      await AbschussplanService.createAbschussplaene(
        planperiodeId,
        auswahl,
      );
      closeWizardModal("apPlaeneErzeugenModal");
      AppFeedback.success("Planperiode erfolgreich eingerichtet.");
      await renderAll();
      activateTab("ap-jahre");
    } catch (error) {
      console.error("Abschusspläne konnten nicht erzeugt werden:", error);
      alert(error?.message || "Die Abschusspläne konnten nicht erzeugt werden.");
    } finally {
      button.disabled = false;
    }
  }

  function wireWizardEvents() {
    const planpositionenModal = document.getElementById("apPlanpositionenModal");
    const planModal = document.getElementById("apPlaeneErzeugenModal");
    document.getElementById("apPlanpositionenClose")
      ?.addEventListener("click", () => wizardAbbrechen("apPlanpositionenModal"));
    document.getElementById("apPlanpositionenCancel")
      ?.addEventListener("click", () => wizardAbbrechen("apPlanpositionenModal"));
    document.getElementById("apPlanpositionenSave")
      ?.addEventListener("click", async () => {
        try {
          await saveWizardPlanpositionen();
        } catch (error) {
          console.error("Planpositionen konnten nicht gespeichert werden:", error);
          alert("Die Planpositionen konnten nicht gespeichert werden.");
        }
      });
    document.getElementById("apPlanpositionenSync")
      ?.addEventListener("click", async () => {
        const id = planpositionenModal.dataset.planperiodeId;
        try {
          const anzahl =
            await AbschussplanService.syncPlanperiodePlanpositionen(id);
          if (anzahl)
            AppFeedback.success(
              "Neue Planpositionen wurden aus den Stammdaten übernommen.",
            );
          else
            AppFeedback.info("Es sind keine neuen Planpositionen vorhanden.");
          if (anzahl) await renderPlanperiodePlanpositionen(id);
        } catch (error) {
          console.error("Planpositionen konnten nicht übernommen werden:", error);
          alert("Die Planpositionen konnten nicht übernommen werden.");
        }
      });
    document.getElementById("apPlaeneErzeugenClose")
      ?.addEventListener("click", () =>
        wizardAbbrechen("apPlaeneErzeugenModal"));
    document.getElementById("apPlaeneErzeugenCancel")
      ?.addEventListener("click", () =>
        wizardAbbrechen("apPlaeneErzeugenModal"));
    document.getElementById("apPlaeneErzeugenStart")
      ?.addEventListener("click", plaeneErzeugen);
    document.getElementById("apPlaeneAktualisierenJa")
      ?.addEventListener("click", () =>
        planAktualisierungBeantworten(true));
    document.getElementById("apPlaeneAktualisierenNein")
      ?.addEventListener("click", () =>
        planAktualisierungBeantworten(false));
    planpositionenModal?.addEventListener("click", (event) => {
      if (event.target === planpositionenModal)
        wizardAbbrechen("apPlanpositionenModal");
    });
    planModal?.addEventListener("click", (event) => {
      if (event.target === planModal)
        wizardAbbrechen("apPlaeneErzeugenModal");
    });
  }

  function wirePlanperiodeEvents() {
    const addButton = document.getElementById("ap-add-planperiode");
    const closeButton = document.getElementById("apPlanperiodeClose");
    const cancelButton = document.getElementById("apPlanperiodeCancel");
    const saveButton = document.getElementById("apPlanperiodeSave");
    const detailEdit = document.getElementById("apPlanperiodeDetailEdit");
    const detailDelete = document.getElementById("apPlanperiodeDetailDelete");
    const modal = document.getElementById("apPlanperiodeModal");

    if (addButton)
      addButton.addEventListener("click", () => openPlanperiodeModal("new"));
    if (closeButton)
      closeButton.addEventListener("click", closePlanperiodeModal);
    if (cancelButton) {
      cancelButton.addEventListener("click", () => {
        if (modal?.dataset.editId && modal.dataset.detailMode === "edit") {
          DetailMode.cancel(modal);
        } else {
          closePlanperiodeModal();
        }
      });
    }
    if (saveButton) saveButton.addEventListener("click", savePlanperiode);
    if (detailEdit) {
      detailEdit.addEventListener("click", () =>
        DetailMode.setMode(modal, "edit", { capture: true }),
      );
    }
    if (detailDelete) {
      detailDelete.addEventListener("click", async () => {
        const id = modal?.dataset.editId;
        if (!id || !await AppFeedback.confirmDelete(
          "Planperiode löschen?",
          "Diese Aktion kann nicht rückgängig gemacht werden.",
        )) return;
        if (await AbschussplanService.deletePlanperiode(id)) {
          closePlanperiodeModal();
          await renderAll();
          AppFeedback.success("Datensatz gelöscht.");
        }
      });
    }
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
      btn.hidden = !BerechtigungService.darf(btn.dataset.rechtCode, "Lesen");
      btn.addEventListener("click", () => {
        activateTab(btn.dataset.target);
      });
    });
  }

  function activateTab(targetId) {
    if (!BerechtigungService.darfBereich("abschussplan", targetId, "Lesen")) {
      return false;
    }
    Router.currentPanel = targetId;
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
    BerechtigungService.aktionsrechteAnwenden("abschussplan", document.getElementById("app-content"));
    return true;
  }

  async function renderAll() {
    const aufgaben = [];
    if (BerechtigungService.darf("abschussplan-uebersicht", "Lesen")) aufgaben.push(renderOverview());
    if (BerechtigungService.darf("abschussplan-rotwild", "Lesen")) aufgaben.push(renderSpecies("Rotwild"));
    if (BerechtigungService.darf("abschussplan-rehwild", "Lesen")) aufgaben.push(renderSpecies("Rehwild"));
    if (BerechtigungService.darf("abschussplan-gamswild", "Lesen")) aufgaben.push(renderSpecies("Gamswild"));
    if (BerechtigungService.darf("abschussplan-jahre", "Lesen")) aufgaben.push(renderPlanperiodenTable());
    await Promise.all(aufgaben);
  }

  async function init(initialPanel = "ap-overview") {
    if (!document.getElementById("ap-overview")) {
      return;
    }

    wireTabs();

    AbschussplanWildgruppe.wireKJModal();
    AbschussplanWildgruppe.wireInternModal();

    wirePlanperiodeEvents();
    wireWizardEvents();

    await renderAll();

    const gueltigePanels = [
      "ap-overview",
      "ap-rotwild",
      "ap-rehwild",
      "ap-gamswild",
      "ap-jahre",
    ];
    const startPanel = gueltigePanels.includes(initialPanel) &&
      BerechtigungService.darfBereich("abschussplan", initialPanel, "Lesen")
      ? initialPanel : BerechtigungService.ersterBereich("abschussplan");
    if (startPanel) activateTab(startPanel);
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
