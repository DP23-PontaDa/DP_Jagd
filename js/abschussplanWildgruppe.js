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

  function formatPlanposition(planposition) {
    return planposition?.bezeichnung || "";
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

  function matrixPosition(positionen, planpositionId) {
    return positionen.find(
      (position) =>
        String(position.planperiode_planposition_id) ===
        String(planpositionId),
    );
  }

  function readPlanwert(input) {
    if (!input || input.disabled || input.value.trim() === "") return null;
    const wert = Number(input.value);
    return Number.isInteger(wert) && wert >= 0 ? wert : null;
  }

  function updateMatrixDirtyState(input, saveButton) {
    const geaendert =
      (Number(input.value) || 0) !== Number(input.dataset.originalValue);
    input.classList.toggle("is-dirty", geaendert);
    const matrix = input.closest(".ap-species");
    saveButton.disabled = !matrix.querySelector(".ap-matrix-input.is-dirty");
  }

  function calculatePlanwert(state, changedInput, saveButton) {
    const changedType = changedInput.dataset.planwertType;
    if (state.mode === "startjahr") {
      const kj = readPlanwert(state.inputs.kj);
      const start = readPlanwert(state.inputs.start);
      const endInput = state.inputs.end;
      if (kj === null || start === null || !endInput) return;

      endInput.value = String(Math.max(0, kj - start));
      updateMatrixDirtyState(endInput, saveButton);
      return;
    }

    if (state.mode === "endjahr") {
      if (changedType !== "kj") return;
      const kj = readPlanwert(state.inputs.kj);
      const endInput = state.inputs.end;
      if (kj === null || !endInput) return;

      endInput.value = String(Math.max(0, kj - state.istStartjahr));
      updateMatrixDirtyState(endInput, saveButton);
      return;
    }

    if (state.mode !== "standard") return;

    state.manualOrder = state.manualOrder.filter(
      (type) => type !== changedType,
    );
    state.manualOrder.push(changedType);
    state.manualOrder = state.manualOrder.slice(-2);

    const werte = {
      kj: readPlanwert(state.inputs.kj),
      start: readPlanwert(state.inputs.start),
      end: readPlanwert(state.inputs.end),
    };
    const vorhandeneTypen = Object.keys(werte).filter(
      (type) => werte[type] !== null,
    );
    if (vorhandeneTypen.length < 2) return;

    let zielTyp = Object.keys(werte).find((type) => werte[type] === null);
    if (!zielTyp) {
      if (state.manualOrder.length === 2) {
        zielTyp = ["kj", "start", "end"].find(
          (type) => !state.manualOrder.includes(type),
        );
      } else {
        zielTyp = changedType === "end" ? "start" : "end";
      }
    }

    let berechnet;
    if (zielTyp === "kj") {
      berechnet = werte.start + werte.end;
    } else if (zielTyp === "start") {
      berechnet = werte.kj - werte.end;
    } else {
      berechnet = werte.kj - werte.start;
    }

    const zielInput = state.inputs[zielTyp];
    if (
      !zielInput ||
      zielInput.disabled ||
      !Number.isInteger(berechnet) ||
      berechnet < 0
    ) {
      return;
    }

    zielInput.value = String(berechnet);
    updateMatrixDirtyState(zielInput, saveButton);
  }

  function createMatrixInput(
    plan,
    position,
    planpositionId,
    saveButton,
    planwertType,
    state,
    angezeigterWert,
  ) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.inputMode = "numeric";
    input.className = "ap-matrix-input";
    input.value = angezeigterWert ?? position?.soll ?? 0;
    input.dataset.originalValue = String(Number(position?.soll ?? 0));
    input.dataset.planId = plan?.id || "";
    input.dataset.positionId = position?.id || "";
    input.dataset.planpositionId = planpositionId;
    input.dataset.planwertType = planwertType;
    input.disabled = !plan;
    input.readOnly = !state.editableTypes.includes(planwertType);
    state.inputs[planwertType] = input;

    input.addEventListener("input", () => {
      if (
        input.value !== "" &&
        (!Number.isInteger(Number(input.value)) || Number(input.value) < 0)
      ) {
        input.value = "";
      }
      updateMatrixDirtyState(input, saveButton);
      calculatePlanwert(state, input, saveButton);
    });
    input.addEventListener("keydown", (event) => {
      if (["-", "+", ".", ",", "e", "E"].includes(event.key)) {
        event.preventDefault();
      }
    });
    return input;
  }

  function createRevierIstInput(
    plan,
    position,
    planpositionId,
    saveButton,
    field,
  ) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.inputMode = "numeric";
    input.className = "ap-matrix-input ap-matrix-revier-input";
    input.value = String(Number(position?.[field] ?? 0));
    input.dataset.originalValue = input.value;
    input.dataset.planId = plan?.id || "";
    input.dataset.positionId = position?.id || "";
    input.dataset.planpositionId = planpositionId;
    input.dataset.revierField = field;
    input.disabled = !plan;

    input.addEventListener("input", () => {
      if (
        input.value !== "" &&
        (!Number.isInteger(Number(input.value)) || Number(input.value) < 0)
      ) {
        input.value = "";
      }
      updateMatrixDirtyState(input, saveButton);
    });
    input.addEventListener("keydown", (event) => {
      if (["-", "+", ".", ",", "e", "E"].includes(event.key)) {
        event.preventDefault();
      }
    });
    return input;
  }

  function createB1FreigabeInput(
    planperiode,
    planpositionId,
    wildklasseId,
    jahr,
    wert,
    saveButton,
  ) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.inputMode = "numeric";
    input.className = "ap-matrix-input ap-b1-release-input";
    input.value = String(Number(wert) || 0);
    input.dataset.originalValue = input.value;
    input.dataset.b1Release = "true";
    input.dataset.planperiodeId = planperiode.id;
    input.dataset.planpositionId = planpositionId;
    input.dataset.wildklasseId = wildklasseId;
    input.dataset.jahr = String(jahr);
    input.addEventListener("input", () => {
      if (
        input.value !== "" &&
        (!Number.isInteger(Number(input.value)) || Number(input.value) < 0)
      ) {
        input.value = "";
      }
      updateMatrixDirtyState(input, saveButton);
    });
    input.addEventListener("keydown", (event) => {
      if (["-", "+", ".", ",", "e", "E"].includes(event.key)) {
        event.preventDefault();
      }
    });
    return input;
  }

  function appendMatrixMetric(matrix, wert, klasse = "") {
    const cell = document.createElement("div");
    cell.className = "ap-matrix-cell ap-matrix-value ap-matrix-metric";
    if (klasse) cell.classList.add(klasse);
    const display = document.createElement("span");
    display.className = "ap-matrix-display";
    display.textContent = wert;
    cell.appendChild(display);
    matrix.appendChild(cell);
  }

  function setMatrixEditMode(card, editing) {
    card.classList.toggle("is-editing", editing);
    card.querySelector(".ap-matrix-edit").hidden =
      editing || card._planwertEditable === false;
    card.querySelector(".ap-matrix-footer").hidden = !editing;
  }

  function cancelPlanningMatrix(card) {
    card.querySelectorAll(".ap-matrix-input").forEach((input) => {
      input.value = input.dataset.originalValue;
      input.classList.remove("is-dirty", "is-saved");
    });
    (card._planwertStates || []).forEach((state) => {
      state.manualOrder = [];
    });
    card.querySelector(".ap-matrix-save").disabled = true;
    setMatrixEditMode(card, false);
  }

  async function savePlanningMatrix(card) {
    const inputs = Array.from(
      card.querySelectorAll(".ap-matrix-input.is-dirty"),
    );
    if (!inputs.length) return;

    const button = card.querySelector(".ap-matrix-save");
    button.disabled = true;
    try {
      for (const input of inputs) {
        if (input.dataset.b1Release === "true") {
          const wert = Number(input.value);
          if (!Number.isInteger(wert) || wert < 0) {
            input.focus();
            throw new Error(
              "Die interne Hirsch-B1-Freigabe muss eine ganze Zahl ab 0 sein.",
            );
          }
          const gespeichert = await AbschussplanService.saveInterneFreigabe({
            planperiode_id: input.dataset.planperiodeId,
            planperiode_planposition_id: input.dataset.planpositionId,
            wildklasse_id: input.dataset.wildklasseId,
            jahr: Number(input.dataset.jahr),
            interne_freigabe: wert,
            geaendert_am: new Date().toISOString(),
          });
          if (!gespeichert) {
            throw new Error(
              "Die interne Hirsch-B1-Freigabe konnte nicht gespeichert werden.",
            );
          }
          input.dataset.originalValue = String(wert);
          const display = input.parentElement.querySelector(
            ".ap-matrix-display",
          );
          if (display) display.textContent = String(wert);
          input.classList.remove("is-dirty");
          continue;
        }
        const revierField = input.dataset.revierField;
        const payload = {
          plan_id: input.dataset.planId,
          planperiode_planposition_id: input.dataset.planpositionId,
        };
        if (revierField) {
          payload[revierField] = Number(input.value) || 0;
        } else {
          payload.soll = Number(input.value) || 0;
        }
        if (input.dataset.positionId) {
          const gespeichert = await AbschussplanService.updatePosition(
            input.dataset.positionId,
            payload,
          );
          if (!gespeichert) throw new Error("Fehler beim Speichern.");
        } else {
          const createPayload = revierField
            ? { ...payload, soll: 0 }
            : payload;
          const gespeichert =
            await AbschussplanService.createPosition(createPayload);
          if (!gespeichert) throw new Error("Fehler beim Speichern.");
          input.dataset.positionId = gespeichert.id;
          if (revierField) {
            card.querySelectorAll(
              `.ap-matrix-revier-input[data-planposition-id="${input.dataset.planpositionId}"]`,
            ).forEach((revierInput) => {
              revierInput.dataset.positionId = gespeichert.id;
            });
          }
        }
        const gespeicherterWert = revierField
          ? payload[revierField]
          : payload.soll;
        input.dataset.originalValue = String(gespeicherterWert);
        const display = input.parentElement.querySelector(
          ".ap-matrix-display",
        );
        if (display) display.textContent = String(gespeicherterWert);
        if (display) {
          display.classList.add("is-saved");
          window.setTimeout(() => display.classList.remove("is-saved"), 2000);
        }
        input.classList.remove("is-dirty");
        input.classList.add("is-saved");
        window.setTimeout(() => input.classList.remove("is-saved"), 2000);
      }
      AppFeedback.success("Änderungen gespeichert.");
      setMatrixEditMode(card, false);
      await window.Abschussplan.renderAll();
    } catch (error) {
      console.error("Abschussplan konnte nicht gespeichert werden:", error);
      AppFeedback.error("Die Änderungen konnten nicht gespeichert werden.");
    } finally {
      button.disabled =
        !card.querySelector(".ap-matrix-input.is-dirty");
    }
  }

  async function buildPlanningMatrix(groupCode, containerId) {
    const container = document.getElementById(containerId);
    const template = document.getElementById("ap-species-template");
    if (!container || !template) return;

    container.innerHTML = "";
    container.appendChild(template.content.cloneNode(true));
    const card = container.querySelector(".ap-species");
    const title = card.querySelector(".ap-species-title");
    const info = card.querySelector(".ap-planperiode-info");
    const noData = card.querySelector(".ap-no-data-message");
    const scroll = card.querySelector(".ap-matrix-scroll");
    const matrix = card.querySelector(".ap-planning-matrix");
    const footer = card.querySelector(".ap-matrix-footer");
    const saveButton = card.querySelector(".ap-matrix-save");
    const editButton = card.querySelector(".ap-matrix-edit");
    const cancelButton = card.querySelector(".ap-matrix-cancel");
    const deleteButton = card.querySelector(".ap-delete-kj");
    const groupName = resolveWildgruppe(groupCode);
    const istGamswild =
      String(groupName).trim().toLocaleLowerCase("de") === "gamswild";
    const istRotwild =
      String(groupName).trim().toLocaleLowerCase("de") === "rotwild";
    matrix.classList.toggle("ap-matrix-gamswild", istGamswild);
    card._planwertStates = [];

    title.textContent = groupName;
    const planperiode = await AbschussplanService.getAktivePlanperiode();
    if (!planperiode) {
      info.textContent = "Keine aktive Planperiode";
      info.hidden = false;
      noData.style.display = "block";
      editButton.hidden = true;
      deleteButton.hidden = true;
      return;
    }

    info.textContent =
      `Planperiode ${planperiode.startjahr} / ${planperiode.endjahr}`;
    info.hidden = false;
    const aktuellesJahr = new Date().getFullYear();
    const istAktuellesStartjahr =
      aktuellesJahr === Number(planperiode.startjahr);
    const istAktuellesEndjahr =
      aktuellesJahr === Number(planperiode.endjahr);
    const planwertMode = istAktuellesStartjahr
      ? "startjahr"
      : istAktuellesEndjahr
        ? "endjahr"
        : "readonly";
    card._planwertEditable =
      planwertMode === "startjahr" || planwertMode === "endjahr" ||
      istGamswild || istRotwild;
    const wildgruppeId = await getWildgruppeId(groupName);
    const kjPlan = await getKJPlan(planperiode.id, wildgruppeId);
    const internPlaene = await getInternPlaene(
      planperiode.id,
      wildgruppeId,
    );
    const internJahr1 = internPlaene.find(
      (plan) => Number(plan.jahr) === Number(planperiode.startjahr),
    );
    const internJahr2 = internPlaene.find(
      (plan) => Number(plan.jahr) === Number(planperiode.endjahr),
    );
    const plaene = [kjPlan, internJahr1, internJahr2];

    if (!plaene.some(Boolean)) {
      noData.style.display = "block";
      editButton.hidden = true;
      deleteButton.hidden = true;
      return;
    }

    const klassen = (
      await AbschussplanService.getPlanperiodePlanpositionen(planperiode.id)
    )
      .filter(
        (eintrag) =>
          eintrag.aktiv === true &&
          String(eintrag.wildgruppe_id) === String(wildgruppeId),
      )
      .sort(
        (a, b) =>
          Number(a.reihenfolge ?? Number.MAX_SAFE_INTEGER) -
          Number(b.reihenfolge ?? Number.MAX_SAFE_INTEGER),
      )
      .map((eintrag) => ({
        id: eintrag.id,
        code: eintrag.code || "",
        bezeichnung: eintrag.bezeichnung || "",
      }));
    const positionsListen = await Promise.all(
      plaene.map((plan) =>
        plan ? AbschussplanService.getPositionen(plan.id) : Promise.resolve([]),
      ),
    );
    const hirschBPlanposition = istRotwild
      ? klassen.find((klasse) =>
          String(klasse.bezeichnung || "").trim().toLocaleLowerCase("de") ===
            "hirsch b")
      : null;
    let b1Konfiguration = null;
    if (hirschBPlanposition) {
      const mappings = await AbschussplanService.getPlanpositionWildklassen(
        planperiode.id,
        hirschBPlanposition.id,
      );
      const b1 = mappings.find((mapping) =>
        String(mapping.wildklasse_bezeichnung || "")
          .trim().toLocaleLowerCase("de") === "hirsch b1");
      if (b1) {
        const [freigaben, statistik] = await Promise.all([
          AbschussplanService.getInterneFreigaben(
            planperiode.id,
            hirschBPlanposition.id,
          ),
          AbschussplanService.getHirschB1Statistik(
            planperiode,
            b1.wildklasse_id,
          ),
        ]);
        b1Konfiguration = { b1, freigaben, statistik };
      }
    }

    const headers = [
      "Planposition",
      "Soll KJ",
      `Soll ${planperiode.startjahr}`,
      `Soll ${planperiode.endjahr}`,
      "Ist KJ",
      `Ist ${planperiode.startjahr}`,
      `Ist ${planperiode.endjahr}`,
      ...(istGamswild
        ? [
            `Ist Reviere ${planperiode.startjahr}`,
            `Ist Reviere ${planperiode.endjahr}`,
          ]
        : []),
      "Rest",
      "%",
      "Fallwild",
    ];
    const istDividerIndex = istGamswild ? 8 : 6;
    matrix.style.setProperty(
      "--ap-matrix-columns",
      `220px repeat(${headers.length - 1}, minmax(100px, 1fr))`,
    );
    headers
      .forEach((text, index) => {
        const header = document.createElement("div");
        header.className =
          "ap-matrix-cell ap-matrix-header" +
          (index === 0 ? " ap-matrix-sticky-column" : "");
        if (index === headers.length - 1) {
          header.classList.add("ap-matrix-row-end");
        }
        if (index === 3 || index === istDividerIndex) {
          header.classList.add("ap-matrix-divider-after");
        }
        header.textContent = text;
        matrix.appendChild(header);
      });

    klassen.forEach((klasse) => {
      const kjPosition = matrixPosition(positionsListen[0], klasse.id);
      const startjahrPosition = matrixPosition(positionsListen[1], klasse.id);
      const endjahrPosition = matrixPosition(positionsListen[2], klasse.id);
      const angezeigteJahresSollwerte =
        AbschussplanService.getAngezeigteJahresSollwerte({
          planperiode,
          sollKj: kjPosition?.soll,
          sollStartjahr: startjahrPosition?.soll,
          sollEndjahr: endjahrPosition?.soll,
          istStartjahr: startjahrPosition?.ist,
          referenzjahr: aktuellesJahr,
        });
      const automatischerEndjahrSoll =
        angezeigteJahresSollwerte[String(planperiode.endjahr)];
      const planwertState = {
        inputs: {},
        manualOrder: [],
        mode: planwertMode,
        istStartjahr: Number(startjahrPosition?.ist ?? 0),
        editableTypes:
          planwertMode === "startjahr" || planwertMode === "endjahr"
          ? ["kj", "start"]
          : [],
      };
      card._planwertStates.push(planwertState);
      const name = document.createElement("div");
      name.className = "ap-matrix-cell ap-matrix-class ap-matrix-sticky-column";
      name.textContent = formatPlanposition(klasse);
      matrix.appendChild(name);

      plaene.forEach((plan, index) => {
        const cell = document.createElement("div");
        cell.className = "ap-matrix-cell ap-matrix-value";
        if (index === 0) cell.classList.add("ap-matrix-kj");
        if (index === 2) cell.classList.add("ap-matrix-divider-after");
        const position = matrixPosition(positionsListen[index], klasse.id);
        const angezeigterWert =
          index === 2 &&
          (planwertMode === "startjahr" || planwertMode === "endjahr")
            ? automatischerEndjahrSoll
            : position?.soll ?? 0;
        const display = document.createElement("span");
        display.className = "ap-matrix-display";
        display.textContent = String(angezeigterWert);
        const input = createMatrixInput(
          plan,
          position,
          klasse.id,
          saveButton,
          ["kj", "start", "end"][index],
          planwertState,
          angezeigterWert,
        );
        cell.append(display, input);
        matrix.appendChild(cell);
      });

      const istWert = Number(kjPosition?.ist ?? 0);
      const istStartjahr = Number(startjahrPosition?.ist ?? 0);
      const istEndjahr = Number(endjahrPosition?.ist ?? 0);
      const restWert = Number(kjPosition?.rest ?? 0);
      const prozentWert = Number(kjPosition?.erfuellung_prozent ?? 0);
      const fallwildWert = Number(kjPosition?.fallwild ?? 0);

      const metriken = [
        { wert: String(istWert) },
        { wert: String(istStartjahr) },
        {
          wert: String(istEndjahr),
          klasse: istGamswild ? "" : "ap-matrix-divider-after",
        },
      ];
      metriken.forEach(({ wert, klasse }) =>
        appendMatrixMetric(matrix, wert, klasse));
      metriken.length = 0;

      if (istGamswild) {
        ["ist_reviere_startjahr", "ist_reviere_endjahr"]
          .forEach((field, index) => {
            const cell = document.createElement("div");
            cell.className =
              "ap-matrix-cell ap-matrix-value ap-matrix-metric " +
              "ap-matrix-revier";
            if (index === 1) cell.classList.add("ap-matrix-divider-after");
            const display = document.createElement("span");
            display.className = "ap-matrix-display";
            display.textContent = String(Number(kjPosition?.[field] ?? 0));
            const input = createRevierIstInput(
              kjPlan,
              kjPosition,
              klasse.id,
              saveButton,
              field,
            );
            cell.append(display, input);
            matrix.appendChild(cell);
          });
      }

      metriken.push(
        {
          wert: String(restWert),
          klasse: restWert > 0
            ? "ap-matrix-rest-positive"
            : "ap-matrix-rest-nonpositive",
        },
        {
          wert: `${prozentWert.toLocaleString("de-AT", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
          })} %`,
        },
        { wert: String(fallwildWert), klasse: "ap-matrix-row-end" },
      );
      metriken.forEach(({ wert, klasse }) =>
        appendMatrixMetric(matrix, wert, klasse));

      if (
        b1Konfiguration &&
        String(klasse.id) === String(hirschBPlanposition.id)
      ) {
        const b1Statistik = b1Konfiguration.statistik;
        const b1Name = document.createElement("div");
        b1Name.className =
          "ap-matrix-cell ap-matrix-class ap-matrix-sticky-column " +
          "ap-b1-statistics-label";
        b1Name.textContent = "Hirsch B1";
        matrix.appendChild(b1Name);
        appendMatrixMetric(matrix, "–", "ap-matrix-kj");
        appendMatrixMetric(matrix, "–");
        appendMatrixMetric(matrix, "–", "ap-matrix-divider-after");
        appendMatrixMetric(matrix, String(b1Statistik.gesamt));
        appendMatrixMetric(matrix, String(b1Statistik.startjahr));
        appendMatrixMetric(
          matrix,
          String(b1Statistik.endjahr),
          "ap-matrix-divider-after",
        );
        appendMatrixMetric(matrix, "–");
        appendMatrixMetric(matrix, "–");
        appendMatrixMetric(
          matrix,
          String(b1Statistik.fallwild),
          "ap-matrix-row-end",
        );

        const name = document.createElement("div");
        name.className =
          "ap-matrix-cell ap-matrix-class ap-matrix-sticky-column " +
          "ap-b1-release-label";
        name.textContent = "Interne Hirsch-B1-Freigabe";
        matrix.appendChild(name);

        const startFreigabe = Number(
          b1Konfiguration.freigaben.find((eintrag) =>
            Number(eintrag.jahr) === Number(planperiode.startjahr))
            ?.interne_freigabe,
        ) || 0;
        const endFreigabe = Number(
          b1Konfiguration.freigaben.find((eintrag) =>
            Number(eintrag.jahr) === Number(planperiode.endjahr))
            ?.interne_freigabe,
        ) || 0;
        const gesamtFreigabe = startFreigabe + endFreigabe;
        const internerRest = gesamtFreigabe - b1Statistik.internGesamt;
        const interneErfuellung = gesamtFreigabe > 0
          ? b1Statistik.internGesamt * 100 / gesamtFreigabe
          : 0;
        appendMatrixMetric(matrix, String(gesamtFreigabe), "ap-matrix-kj");
        [planperiode.startjahr, planperiode.endjahr].forEach((jahr, index) => {
          const freigabe = b1Konfiguration.freigaben.find((eintrag) =>
            Number(eintrag.jahr) === Number(jahr));
          const cell = document.createElement("div");
          cell.className = "ap-matrix-cell ap-matrix-value ap-b1-release-cell";
          if (index === 1) cell.classList.add("ap-matrix-divider-after");
          const display = document.createElement("span");
          display.className = "ap-matrix-display";
          display.textContent = String(Number(freigabe?.interne_freigabe) || 0);
          const input = createB1FreigabeInput(
            planperiode,
            hirschBPlanposition.id,
            b1Konfiguration.b1.wildklasse_id,
            jahr,
            freigabe?.interne_freigabe ?? 0,
            saveButton,
          );
          cell.append(display, input);
          matrix.appendChild(cell);
        });
        appendMatrixMetric(matrix, String(b1Statistik.internGesamt));
        appendMatrixMetric(matrix, String(b1Statistik.internStartjahr));
        appendMatrixMetric(
          matrix,
          String(b1Statistik.internEndjahr),
          "ap-matrix-divider-after",
        );
        appendMatrixMetric(
          matrix,
          String(internerRest),
          internerRest > 0
            ? "ap-matrix-rest-positive"
            : "ap-matrix-rest-nonpositive",
        );
        appendMatrixMetric(
          matrix,
          `${interneErfuellung.toLocaleString("de-AT", {
            maximumFractionDigits: 1,
          })} %`,
        );
        appendMatrixMetric(
          matrix,
          String(b1Statistik.internFallwild),
          "ap-matrix-row-end",
        );
      }
    });

    noData.style.display = "none";
    scroll.hidden = false;
    footer.hidden = false;
    editButton.hidden = !card._planwertEditable;
    deleteButton.hidden = !kjPlan;
    deleteButton.onclick = () => deleteKJPlanForGroup(groupCode);
    editButton.addEventListener("click", () =>
      setMatrixEditMode(card, true));
    cancelButton.addEventListener("click", () =>
      cancelPlanningMatrix(card));
    saveButton.addEventListener("click", () => savePlanningMatrix(card));
    setMatrixEditMode(card, false);
    if (planwertMode === "startjahr" || planwertMode === "endjahr") {
      card.querySelectorAll(
        '.ap-matrix-input[data-planwert-type="end"]',
      ).forEach((input) => updateMatrixDirtyState(input, saveButton));
    }
  }

  async function buildGroupPane(groupCode, containerId) {
    return buildPlanningMatrix(groupCode, containerId);

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
            <td>${formatPlanposition(pos.planperiode_planpositionen)}</td>
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
    const klassen = (
      await AbschussplanService.getPlanperiodePlanpositionen(planperiode.id)
    ).filter(
      (eintrag) => String(eintrag.wildgruppe_id) === String(wildgruppeId),
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
      buttonGruppe.className = "action-cell";
      button.className = "action-btn edit-btn";
      button.type = "button";
      button.title = "Bearbeiten";
      button.setAttribute("aria-label", "Bearbeiten");
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
        klasseHeader.textContent = "Wildklasse";
        sollHeader.textContent = "Soll";
        header.append(klasseHeader, sollHeader);
        thead.appendChild(header);

        klassen.forEach((klasseEintrag) => {
          const position = positionen.find(
            (eintrag) =>
              String(eintrag.planperiode_planposition_id) ===
                String(klasseEintrag.id),
          );
          const tr = document.createElement("tr");
          const klasse = document.createElement("td");
          const soll = document.createElement("td");

          klasse.textContent = formatPlanposition(klasseEintrag);
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

    const klassen = (
      await AbschussplanService.getPlanperiodePlanpositionen(planperiode.id)
    ).filter(
      (eintrag) =>
        eintrag.aktiv === true &&
        String(eintrag.wildgruppe_id) === String(wildgruppeId),
    );

    const positionen = await AbschussplanService.getPositionen(plan.id);

    body.innerHTML = "";

    for (const klasse of klassen) {
      const position = positionen.find(
        (p) =>
          String(p.planperiode_planposition_id) === String(klasse.id),
      );

      const tr = document.createElement("tr");

      tr.innerHTML = `
      <td>${formatPlanposition(klasse)}</td>
      <td>
        <input
          type="number"
          class="kj-plan-soll"
          data-position-id="${position?.id ?? ""}"
          data-planposition-id="${klasse.id}"
          value="${position?.soll ?? 0}">
      </td>
    `;

      body.appendChild(tr);

      if (String(groupName || "").trim().toLocaleLowerCase("de") === "rotwild" &&
          String(klasse.bezeichnung || "").trim().toLocaleLowerCase("de") === "hirsch b") {
        const mappings = await AbschussplanService.getPlanpositionWildklassen(
          planperiode.id, klasse.id,
        );
        const b1 = mappings.find((mapping) =>
          String(mapping.wildklasse_bezeichnung || "").trim().toLocaleLowerCase("de") === "hirsch b1");
        if (b1) {
          const freigaben = await AbschussplanService.getInterneFreigaben(
            planperiode.id, klasse.id,
          );
          const freigabeRow = document.createElement("tr");
          freigabeRow.className = "kj-internal-release-row";
          freigabeRow.innerHTML = `
            <td>Interne Hirsch-B1-Freigabe</td>
            <td class="kj-internal-release-fields">
              <label>${planperiode.startjahr}
                <input type="number" min="0" step="1" class="kj-b1-freigabe"
                  data-planperiode-id="${planperiode.id}"
                  data-planposition-id="${klasse.id}"
                  data-wildklasse-id="${b1.wildklasse_id}"
                  data-jahr="${planperiode.startjahr}"
                  value="${freigaben.find((x) => Number(x.jahr) === Number(planperiode.startjahr))?.interne_freigabe ?? 0}">
              </label>
              <label>${planperiode.endjahr}
                <input type="number" min="0" step="1" class="kj-b1-freigabe"
                  data-planperiode-id="${planperiode.id}"
                  data-planposition-id="${klasse.id}"
                  data-wildklasse-id="${b1.wildklasse_id}"
                  data-jahr="${planperiode.endjahr}"
                  value="${freigaben.find((x) => Number(x.jahr) === Number(planperiode.endjahr))?.interne_freigabe ?? 0}">
              </label>
            </td>`;
          body.appendChild(freigabeRow);
        }
      }
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

    const klassen = (
      await AbschussplanService.getPlanperiodePlanpositionen(planperiode.id)
    ).filter(
      (eintrag) => String(eintrag.wildgruppe_id) === String(wildgruppeId),
    );
    const positionen = await AbschussplanService.getPositionen(plan.id);

    for (const klasse of klassen) {
      const position = positionen.find(
        (eintrag) =>
          String(eintrag.planperiode_planposition_id) === String(klasse.id),
      );
      const tr = document.createElement("tr");
      const klasseCell = document.createElement("td");
      const sollCell = document.createElement("td");
      const input = document.createElement("input");

      klasseCell.textContent = formatPlanposition(klasse);
      input.type = "number";
      input.className = "intern-plan-soll";
      input.dataset.positionId = position?.id || "";
      input.dataset.planpositionId = klasse.id;
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
        planperiode_planposition_id: input.dataset.planpositionId,
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
    AppFeedback.success("Abschussplan gespeichert.");
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

      const planpositionId = input.dataset.planpositionId;

      const soll = Number(input.value) || 0;

      const payload = {
        plan_id: plan.id,
        planperiode_planposition_id: planpositionId,
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

    for (const input of body.querySelectorAll(".kj-b1-freigabe")) {
      const wert = Number(input.value);
      if (!Number.isInteger(wert) || wert < 0) {
        alert("Die interne Hirsch-B1-Freigabe muss eine ganze Zahl ab 0 sein.");
        input.focus();
        return;
      }
      const gespeichert = await AbschussplanService.saveInterneFreigabe({
        planperiode_id: input.dataset.planperiodeId,
        planperiode_planposition_id: input.dataset.planpositionId,
        wildklasse_id: input.dataset.wildklasseId,
        jahr: Number(input.dataset.jahr),
        interne_freigabe: wert,
        geaendert_am: new Date().toISOString(),
      });
      if (!gespeichert) {
        alert("Die interne Hirsch-B1-Freigabe konnte nicht gespeichert werden.");
        return;
      }
    }

    closeKJModal();

    await window.Abschussplan.renderAll();
    AppFeedback.success("Abschussplan gespeichert.");
  }

  async function deleteKJPlan() {
    if (!await AppFeedback.confirmDelete(
      "KJ-Abschussplan löschen?",
      "Diese Aktion kann nicht rückgängig gemacht werden.",
    )) {
      return;
    }

    const wildgruppe = document.getElementById("kjWildgruppe").value;

    const deleted = await deleteKJPlanForGroup(wildgruppe);

    if (deleted) {
      closeKJModal();

      await window.Abschussplan.renderAll();
      AppFeedback.success("Datensatz gelöscht.");
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
