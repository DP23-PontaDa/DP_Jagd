const Dashboard = (() => {
  const GROUP_KEYS = {
    rotwild: "rotwild",
    rehwild: "rehwild",
    gamswild: "gamswild",
  };
  let charts = [];
  let sectionObserver = null;
  let dashboardData = null;
  let dashboardBereiche = null;
  let dashboardJahr = "beide";
  let heatmapKarte = null;
  let heatmapLadeId = 0;

  function withAlpha(color, alpha) {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      const red = parseInt(color.slice(1, 3), 16);
      const green = parseInt(color.slice(3, 5), 16);
      const blue = parseInt(color.slice(5, 7), 16);
      return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }
    if (color.startsWith("hsl(")) {
      return color.replace(/\)$/, ` / ${alpha})`);
    }
    return color;
  }

  function destroyCharts() {
    charts.forEach((chart) => chart.destroy());
    charts = [];
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    if (heatmapKarte) {
      heatmapKarte.remove();
      heatmapKarte = null;
    }
    heatmapLadeId += 1;
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  const verticalValueLabels = {
    id: "verticalValueLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = "#243342";
      ctx.font = "600 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        chart.getDatasetMeta(datasetIndex).data.forEach((bar, index) => {
          const value = dataset.data[index];
          if (value === null || value === undefined) return;
          ctx.fillText(String(numberValue(value)), bar.x, bar.y - 6);
        });
      });
      ctx.restore();
    },
  };

  const planAxisLabels = {
    id: "planAxisLabels",
    afterDraw(chart) {
      const { ctx, chartArea, data } = chart;
      const metricNames = data.datasets.map((dataset) => dataset.axisLabel);
      ctx.save();
      ctx.fillStyle = "#596775";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      data.labels.forEach((label, index) => {
        const bars = data.datasets.map((dataset, datasetIndex) => ({
          bar: chart.getDatasetMeta(datasetIndex).data[index],
          name: metricNames[datasetIndex],
          value: dataset.data[index],
        })).filter((entry) => entry.bar && entry.value !== null && entry.value !== undefined);
        bars.forEach((entry) => {
          const zeilen = entry.name === "Soll/Periode"
            ? ["Soll/", "Periode"]
            : entry.name === "Soll (Jahr)"
              ? ["Soll", "(Jahr)"]
              : [entry.name];
          zeilen.forEach((zeile, zeilenIndex) =>
            ctx.fillText(
              zeile,
              entry.bar.x,
              chartArea.bottom + 5 + zeilenIndex * 11,
            ));
        });
        const x = chart.scales.x.getPixelForValue(index);
        ctx.font = "600 11px sans-serif";
        ctx.fillText(String(label), x, chartArea.bottom + 31);
        ctx.font = "10px sans-serif";
      });
      ctx.restore();
    },
  };

  function createPlanChart(canvas, rows, planperiode) {
    const labels = rows.map((row) => row.planposition);
    const classColors = rows.map((row) =>
      WildklasseColors.get(row.wildgruppe, row.planposition));
    const aktuellesJahr =
      rows[0]?.aktuelles_jahr || new Date().getFullYear();
    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Soll/Periode",
            axisLabel: "Soll/Periode",
            data: rows.map((row) => row.ohne_soll || row.nur_jahre
              ? null : numberValue(row.soll_kj)),
            backgroundColor: classColors,
            stack: "soll-periode",
          },
          {
            label: "Ist KJ",
            axisLabel: "Gesamt",
            data: rows.map((row) => row.ohne_gesamt || row.nur_jahre
              ? null : numberValue(row.ist_kj)),
            backgroundColor: classColors.map((color) =>
              withAlpha(color, 0.78)),
            stack: "ist-kj",
          },
          {
            label: `Ist ${planperiode.startjahr}`,
            axisLabel: String(planperiode.startjahr),
            data: rows.map((row) => numberValue(row.ist_startjahr)),
            backgroundColor: classColors.map((color) =>
              withAlpha(color, 0.56)),
            stack: "ist-startjahr",
          },
          {
            label: `Soll ${aktuellesJahr}`,
            axisLabel: "Soll (Jahr)",
            data: rows.map((row) => row.ohne_soll || row.nur_jahre
              ? null : numberValue(row.soll_aktuelles_jahr)),
            backgroundColor: classColors.map((color) =>
              withAlpha(color, 0.46)),
            stack: "soll-jahr",
          },
          {
            label: `Ist ${planperiode.endjahr}`,
            axisLabel: String(planperiode.endjahr),
            data: rows.map((row) => numberValue(row.ist_endjahr)),
            backgroundColor: classColors.map((color) =>
              withAlpha(color, 0.36)),
            stack: "ist-endjahr",
          },
        ],
      },
      plugins: [verticalValueLabels, planAxisLabels],
      options: DashboardChartOptions.withTooltip({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 24, bottom: 50 } },
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { display: false } },
          y: { stacked: true, beginAtZero: true, grace: "15%", ticks: { precision: 0 } },
        },
      }),
    });
    charts.push(chart);
    return chart;
  }

  function createPlanLegend(chart) {
    const legend = createElement("div", "dashboard-plan-legend");
    legend.setAttribute("role", "list");
    chart.data.datasets.forEach((dataset) => {
      const item = createElement("span", "dashboard-plan-legend-item");
      item.setAttribute("role", "listitem");
      const color = Array.isArray(dataset.backgroundColor)
        ? dataset.backgroundColor[0] : dataset.backgroundColor;
      const swatch = createElement("span", "dashboard-plan-legend-swatch");
      swatch.style.backgroundColor = color || "#596775";
      item.append(swatch, document.createTextNode(dataset.label));
      legend.appendChild(item);
    });
    return legend;
  }

  function createPlanTable(rows) {
    const wrapper = createElement("div", "dashboard-table-wrap");
    const table = createElement("table", "ap-table dashboard-plan-table");
    const colgroup = document.createElement("colgroup");
    ["position", "soll", "ist", "rest", "prozent", "fallwild"].forEach((name) => {
      const col = document.createElement("col");
      col.className = `dashboard-plan-col dashboard-plan-col-${name}`;
      colgroup.appendChild(col);
    });
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const aktuellesJahr =
      rows[0]?.aktuelles_jahr || new Date().getFullYear();
    const columns = [
      "Planpositionen",
      `Soll ${aktuellesJahr}`,
      "Ist KJ",
      "Rest",
      "%",
      "Fallwild",
    ];
    columns.forEach((label, index) => {
        const th = createElement("th", index ? "dashboard-number-cell" : "dashboard-position-cell");
        if (index === 1) {
          const desktopLabel = createElement("span", "dashboard-soll-label-desktop", label);
          const mobileLabel = createElement("span", "dashboard-soll-label-mobile", `Soll ${String(aktuellesJahr).slice(-2)}`);
          th.append(desktopLabel, mobileLabel);
        } else {
          th.textContent = label;
        }
        headerRow.appendChild(th);
      });
    head.appendChild(headerRow);

    const body = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const values = [
        row.planposition,
        row.soll_aktuelles_jahr,
        row.ist_kj,
        row.rest,
        `${numberValue(row.erfuellung_prozent).toLocaleString("de-AT", {
          maximumFractionDigits: 1,
        })} %`,
        row.fallwild,
      ];
      values.forEach((value, index) => {
        const cell = createElement(
          "td",
          index ? "dashboard-number-cell" : "dashboard-position-cell",
          String(value ?? 0),
        );
        cell.dataset.label = columns[index];
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
    table.append(colgroup, head, body);
    wrapper.appendChild(table);
    return wrapper;
  }

  function createRotwildBreakdown(rows, jaegerRows, planperiode, b1Statistik) {
    if (normalizeGroup(rows[0]?.wildgruppe) !== "rotwild") return rows;
    function summe(namen, jahr) {
      const erlaubt = new Set(namen.map(normalizeGroup));
      return jaegerRows.reduce((sum, row) =>
        normalizeGroup(row.wildgruppe) === "rotwild" &&
        Number(row.jahr) === Number(jahr) && erlaubt.has(normalizeGroup(row.wildklasse))
          ? sum + numberValue(row.anzahl) : sum, 0);
    }
    const statistik = b1Statistik || {};
    const gesamtFreigabe = numberValue(statistik.freigabeStartjahr) +
      numberValue(statistik.freigabeEndjahr);
    const aktuellesJahr = new Date().getFullYear();
    const aktuelleFreigabe = aktuellesJahr === Number(planperiode.startjahr)
      ? numberValue(statistik.freigabeStartjahr)
      : aktuellesJahr === Number(planperiode.endjahr)
        ? numberValue(statistik.freigabeEndjahr) : 0;
    const zusatz = [
      { planposition: "Hirsch B1", ohne_soll: true,
        soll_kj: 0, soll_aktuelles_jahr: 0,
        ist_kj: numberValue(statistik.gesamt),
        ist_startjahr: numberValue(statistik.startjahr),
        ist_endjahr: numberValue(statistik.endjahr),
        rest: 0, erfuellung_prozent: 0,
        fallwild: numberValue(statistik.fallwild) },
      { planposition: "Interne Hirsch-B1-Freigabe",
        soll_kj: gesamtFreigabe,
        soll_aktuelles_jahr: aktuelleFreigabe,
        ist_kj: numberValue(statistik.internGesamt),
        ist_startjahr: numberValue(statistik.internStartjahr),
        ist_endjahr: numberValue(statistik.internEndjahr),
        rest: gesamtFreigabe - numberValue(statistik.internGesamt),
        erfuellung_prozent: gesamtFreigabe > 0
          ? numberValue(statistik.internGesamt) * 100 / gesamtFreigabe : 0,
        fallwild: numberValue(statistik.internFallwild) },
      { planposition: "Tier", nur_jahre: true,
        nur_diagramm: true,
        ist_startjahr: summe(["Tier", "Schmaltier"], planperiode.startjahr),
        ist_endjahr: summe(["Tier", "Schmaltier"], planperiode.endjahr) },
      { planposition: "Kalb", nur_jahre: true,
        nur_diagramm: true,
        ist_startjahr: summe(["Kalb männlich", "Kalb weiblich"], planperiode.startjahr),
        ist_endjahr: summe(["Kalb männlich", "Kalb weiblich"], planperiode.endjahr) },
    ];
    const ergebnis = [...rows];
    const hirschBIndex = ergebnis.findIndex((row) =>
      normalizeGroup(row.planposition) === "hirsch b");
    ergebnis.splice(
      hirschBIndex >= 0 ? hirschBIndex + 1 : 0,
      0,
      ...zusatz.slice(0, 2),
    );
    const kahlwildIndex = ergebnis.findIndex((row) =>
      normalizeGroup(row.planposition) === "kahlwild");
    ergebnis.splice(
      kahlwildIndex >= 0 ? kahlwildIndex + 1 : ergebnis.length,
      0,
      ...zusatz.slice(2),
    );
    return ergebnis;
  }

  function createGroupCard(groupName, rows, planperiode, jaegerRows, b1Statistik) {
    const key = GROUP_KEYS[groupName.toLocaleLowerCase("de")] || "";
    const card = createElement(
      "section",
      `dashboard-card dashboard-group-card dashboard-group-${key}`,
    );
    card.appendChild(createElement("h2", "", groupName));

    const dashboardRows = createRotwildBreakdown(
      rows, jaegerRows, planperiode, b1Statistik,
    );
    const chartWrap = createElement("div", "dashboard-plan-chart");
    const chartStage = createElement("div", "dashboard-plan-chart-stage");
    if (key === "rotwild") {
      chartStage.style.minWidth =
        `${Math.max(1100, dashboardRows.length * 185)}px`;
    }
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      `Soll- und Ist-Werte für ${groupName}`,
    );
    chartStage.appendChild(canvas);
    chartWrap.appendChild(chartStage);
    const chart = createPlanChart(canvas, dashboardRows, planperiode);
    card.append(
      chartWrap,
      createPlanLegend(chart),
      createPlanTable(dashboardRows.filter((row) => !row.nur_diagramm)),
    );
    return card;
  }

  const hunterValueLabels = {
    id: "hunterValueLabels",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, data, scales } = chart;
      ctx.save();
      ctx.fillStyle = "#243342";
      ctx.font = "600 12px sans-serif";
      ctx.textBaseline = "middle";
      data.labels.forEach((label, index) => {
        const total = data.datasets.reduce(
          (sum, dataset) => sum + numberValue(dataset.data[index]),
          0,
        );
        const bar = data.datasets
          .map((dataset, datasetIndex) => chart.getDatasetMeta(datasetIndex).data[index])
          .find(Boolean);
        if (!bar) return;
        const valueX = scales.x.getPixelForValue(total);
        ctx.textAlign = "left";
        ctx.fillText(String(total), valueX + 6, bar.y);
      });
      ctx.restore();
    },
  };

  function normalizeGroup(value) {
    return String(value || "").trim().toLocaleLowerCase("de");
  }

  function getSortedHunters(rows) {
    const hunters = new Map();
    rows.forEach((row) => {
      const id = String(row.jaeger_id);
      const current = hunters.get(id) || {
        id,
        name: row.jaeger || "Unbekannt",
        number: row.jaeger_nr,
        total: 0,
      };
      current.total += numberValue(row.anzahl);
      hunters.set(id, current);
    });
    return [...hunters.values()]
      .filter((hunter) => hunter.total > 0)
      .sort((left, right) => {
        const totalDifference = right.total - left.total;
        if (totalDifference) return totalDifference;

        const leftNumber = Number(left.number);
        const rightNumber = Number(right.number);
        const leftHasNumber = left.number !== null && left.number !== "" &&
          Number.isFinite(leftNumber);
        const rightHasNumber = right.number !== null && right.number !== "" &&
          Number.isFinite(rightNumber);
        if (leftHasNumber && rightHasNumber && leftNumber !== rightNumber) {
          return leftNumber - rightNumber;
        }
        if (leftHasNumber !== rightHasNumber) return leftHasNumber ? -1 : 1;
        return left.id.localeCompare(right.id, "de", { numeric: true });
      });
  }

  function aggregateForHunter(rows, hunterId, predicate) {
    return rows.reduce((sum, row) => {
      if (String(row.jaeger_id) !== hunterId || !predicate(row)) return sum;
      return sum + numberValue(row.anzahl);
    }, 0);
  }

  function createClassDatasets(rows, hunters, groupName) {
    const groupKey = normalizeGroup(groupName);
    const classes = new Map();
    rows.forEach((row) => {
      if (normalizeGroup(row.wildgruppe) !== groupKey) return;
      const id = String(row.wildklasse_id);
      if (!classes.has(id)) classes.set(id, row);
    });
    return [...classes.values()]
      .sort(
        (left, right) =>
          numberValue(left.wildklasse_reihenfolge) -
            numberValue(right.wildklasse_reihenfolge) ||
          String(left.wildklasse).localeCompare(String(right.wildklasse), "de"),
      )
      .map((wildklasse) => ({
        label: wildklasse.wildklasse,
        tooltipCategory: `${groupName} / ${wildklasse.wildklasse}`,
        data: hunters.map((hunter) =>
          aggregateForHunter(
            rows,
            hunter.id,
            (row) =>
              normalizeGroup(row.wildgruppe) === groupKey &&
              String(row.wildklasse_id) === String(wildklasse.wildklasse_id),
          )),
        backgroundColor: WildklasseColors.get(
          groupName,
          wildklasse.wildklasse,
        ),
      }));
  }

  function createTotalDatasets(rows, hunters, groupNames) {
    return groupNames.map((groupName) => ({
      label: groupName,
      tooltipCategory: groupName,
      data: hunters.map((hunter) =>
        aggregateForHunter(
          rows,
          hunter.id,
          (row) => normalizeGroup(row.wildgruppe) === normalizeGroup(groupName),
        )),
      backgroundColor: WildklasseColors.getGroup(groupName),
    }));
  }

  function createHunterCard(grid, definition, rows, groupNames) {
    const card = createElement(
      "section",
      `dashboard-card dashboard-hunter-card dashboard-hunter-${definition.key}`,
    );
    card.appendChild(createElement("h2", "", definition.title));
    grid.appendChild(card);

    const cardRows = definition.key === "gesamt"
      ? rows
      : rows.filter(
          (row) =>
            normalizeGroup(row.wildgruppe) === normalizeGroup(definition.group),
        );
    const hunters = getSortedHunters(cardRows);
    if (!hunters.length) {
      card.appendChild(createElement(
        "div",
        "dashboard-chart-empty",
        "Keine regulären Abschüsse vorhanden.",
      ));
      return;
    }
    const datasets = definition.key === "gesamt"
      ? createTotalDatasets(cardRows, hunters, groupNames)
      : createClassDatasets(cardRows, hunters, definition.group);

    const chartWrap = createElement("div", "dashboard-hunter-chart");
    chartWrap.style.minHeight = `${Math.min(720, Math.max(320, hunters.length * 38 + 120))}px`;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", definition.title);
    chartWrap.appendChild(canvas);
    card.appendChild(chartWrap);

    charts.push(new Chart(canvas, {
      type: "bar",
      data: {
        labels: hunters.map((hunter) => hunter.name),
        datasets,
      },
      plugins: [hunterValueLabels],
      options: DashboardChartOptions.withTooltip({
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { right: 42 } },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              title: (items) => items[0]?.label || "",
              label: (context) =>
                `${context.dataset.tooltipCategory}: ${numberValue(context.raw)}`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            beginAtZero: true,
            grace: "15%",
            title: { display: true, text: "Anzahl Abschüsse" },
            ticks: { precision: 0 },
          },
          y: { stacked: true, grid: { display: false } },
        },
      }),
    }));
  }

  function createHunterCharts(container, rows, wildgruppen) {
    const groupNames = wildgruppen.map((wildgruppe) => wildgruppe.bezeichnung);
    const relevantGroups = new Set(groupNames.map(normalizeGroup));
    const relevantRows = rows.filter((row) =>
      relevantGroups.has(normalizeGroup(row.wildgruppe)));
    const section = createElement("section", "dashboard-hunter-section");
    section.id = "dashboard-jaeger";
    section.appendChild(createElement("h2", "", "Abschüsse nach Jäger"));
    const grid = createElement("div", "dashboard-hunter-grid");
    section.appendChild(grid);
    container.appendChild(section);

    const definitionen = groupNames.map((groupName) => ({
      key: normalizeGroup(groupName),
      title: `Abschüsse Jäger ${groupName}`,
      group: groupName,
    }));
    definitionen.push({ key: "gesamt", title: "Abschüsse Jäger Gesamt" });
    definitionen.forEach((definition) =>
      createHunterCard(grid, definition, relevantRows, groupNames));
  }

  function formatDealerValue(value, metric) {
    const number = numberValue(value);
    if (metric === "price") {
      return `${number.toLocaleString("de-AT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} €`;
    }
    if (metric === "weight") {
      return `${number.toLocaleString("de-AT", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} kg`;
    }
    return number.toLocaleString("de-AT", { maximumFractionDigits: 0 });
  }

  const dealerValueLabels = {
    id: "dealerValueLabels",
    afterDatasetsDraw(chart) {
      const { ctx, data } = chart;
      ctx.save();
      ctx.fillStyle = "#243342";
      ctx.font = "600 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      data.datasets.forEach((dataset, datasetIndex) => {
        const elements = chart.getDatasetMeta(datasetIndex).data;
        elements.forEach((bar, index) => {
          ctx.fillText(
            formatDealerValue(dataset.data[index], dataset.metric),
            bar.x,
            Math.max(12, bar.y - 8),
          );
        });
      });
      ctx.restore();
    },
  };

  function cssVariable(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  function createDealerCard(grid, definition, rows) {
    const card = createElement(
      "section",
      `dashboard-card dashboard-dealer-card dashboard-dealer-${definition.key}`,
    );
    card.appendChild(createElement("h2", "", definition.title));
    grid.appendChild(card);
    if (!rows.length) {
      card.appendChild(createElement(
        "div",
        "dashboard-chart-empty",
        "Keine regulären Abschüsse mit Wildhändler vorhanden.",
      ));
      return;
    }

    const chartWrap = createElement("div", "dashboard-dealer-chart");
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", definition.title);
    chartWrap.appendChild(canvas);
    card.appendChild(chartWrap);

    charts.push(new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map((row) => row.wildhaendler),
        datasets: [
          {
            label: "Anzahl an Wild",
            metric: "count",
            data: rows.map((row) => numberValue(row.anzahl)),
            backgroundColor: cssVariable("--dashboard-dealer-count"),
            yAxisID: "yCount",
          },
          {
            label: "Gesamtpreis",
            metric: "price",
            data: rows.map((row) => numberValue(row.gesamtpreis)),
            backgroundColor: cssVariable("--dashboard-dealer-price"),
            yAxisID: "yValue",
          },
          {
            label: "Gesamtgewicht",
            metric: "weight",
            data: rows.map((row) => numberValue(row.gewicht)),
            backgroundColor: cssVariable("--dashboard-dealer-weight"),
            yAxisID: "yValue",
          },
        ],
      },
      plugins: [dealerValueLabels],
      options: DashboardChartOptions.withTooltip({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 32 } },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              title: (items) => items[0]?.label || "",
              label: (context) =>
                `${context.dataset.label}: ${formatDealerValue(
                  context.raw,
                  context.dataset.metric,
                )}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, minRotation: 0 },
          },
          yCount: {
            type: "linear",
            position: "left",
            beginAtZero: true,
            grace: "15%",
            title: { display: true, text: "Anzahl" },
            ticks: { precision: 0 },
          },
          yValue: {
            type: "linear",
            position: "right",
            beginAtZero: true,
            grace: "15%",
            title: { display: true, text: "Preis / Gewicht" },
            grid: { drawOnChartArea: false },
          },
        },
      }),
    }));
  }

  function createDealerCharts(container, data) {
    const section = createElement("section", "dashboard-dealer-section");
    section.id = "dashboard-wildhaendler";
    section.appendChild(createElement("h2", "", "Wildhändler"));
    const grid = createElement("div", "dashboard-dealer-grid");
    section.appendChild(grid);
    container.appendChild(section);

    [
      { key: "gesamt", title: "Wildfleisch Gesamt" },
      { key: "rotwild", title: "Wildfleisch Rotwild" },
      { key: "rehwild", title: "Wildfleisch Rehwild" },
    ].forEach((definition) =>
      createDealerCard(grid, definition, data?.[definition.key] || []));
  }

  function createYearFilter(container, planperiode, onChange = renderDashboardContent) {
    const section = createElement("section", "dashboard-year-filter");
    section.appendChild(createElement("strong", "", "Jahr:"));
    const group = createElement("div", "dashboard-year-filter-buttons");
    [
      { value: String(planperiode.startjahr), label: String(planperiode.startjahr) },
      { value: String(planperiode.endjahr), label: String(planperiode.endjahr) },
      { value: "beide", label: "Beide" },
    ].forEach((option) => {
      const button = createElement("button", "btn btn-outline", option.label);
      button.type = "button";
      button.classList.toggle("active", dashboardJahr === option.value);
      button.setAttribute("aria-pressed", String(dashboardJahr === option.value));
      button.addEventListener("click", () => {
        if (dashboardJahr === option.value) return;
        dashboardJahr = option.value;
        onChange();
      });
      group.appendChild(button);
    });
    section.appendChild(group);
    container.appendChild(section);
  }

  function optionenSetzen(select, werte, leertext, selected = "") {
    select.innerHTML = "";
    const leer = document.createElement("option");
    leer.value = "";
    leer.textContent = leertext;
    select.appendChild(leer);
    werte.forEach((wert) => {
      const option = document.createElement("option");
      option.value = wert.id;
      option.textContent = wert.bezeichnung;
      select.appendChild(option);
    });
    select.value = selected || "";
  }

  function gruppenAuswahlRendern(container, gruppen, onChange) {
    container.innerHTML = "";
    gruppen.forEach((gruppe) => {
      const label = createElement("label", "dashboard-heatmap-check");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = gruppe.id;
      input.addEventListener("change", onChange);
      label.append(input, document.createTextNode(gruppe.bezeichnung));
      container.appendChild(label);
    });
  }

  function ausgewaehlteGruppen(container) {
    return [...container.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => input.value);
  }

  function heatmapPopup(punkt) {
    const container = createElement("div", "dashboard-heatmap-popup");
    container.appendChild(createElement("strong", "", punkt.ort_name));
    container.appendChild(createElement("div", "", `${punkt.anzahl} Abschüsse`));
    punkt.wildgruppen.forEach((gruppe) => container.appendChild(
      createElement("div", "", `${gruppe.bezeichnung}: ${gruppe.anzahl}`),
    ));
    return container;
  }

  async function heatmapKarteRendern(container, daten, modus, ladeId) {
    let einstellungen = null;
    try { einstellungen = await OrteService.kartenEinstellungenLaden(); }
    catch (error) { console.warn("Karteneinstellungen konnten nicht geladen werden:", error); }
    if (ladeId !== heatmapLadeId || !container.isConnected) return;
    if (heatmapKarte) heatmapKarte.remove();
    heatmapKarte = null;
    const fallback = {
      lat: Number(einstellungen?.map_lat) || 47.3,
      lng: Number(einstellungen?.map_lng) || 13.7,
      zoom: Number(einstellungen?.map_zoom) || 8,
    };
    heatmapKarte = OrteKarte.karteAnlegen(container, fallback);
    const markerLayer = L.layerGroup();
    const grenzen = [];
    daten.punkte.forEach((punkt) => {
      const position = [punkt.latitude, punkt.longitude];
      grenzen.push(position);
      L.marker(position).bindPopup(heatmapPopup(punkt)).addTo(markerLayer);
    });
    let heatLayer;
    if (typeof L.heatLayer === "function") {
      const maximum = Math.max(1, ...daten.punkte.map((punkt) => punkt.anzahl));
      heatLayer = L.heatLayer(
        daten.punkte.map((punkt) => [punkt.latitude, punkt.longitude, punkt.anzahl]),
        { radius: 30, blur: 22, maxZoom: 17, max: maximum, minOpacity: 0.3 },
      );
    } else {
      const maximum = Math.max(1, ...daten.punkte.map((punkt) => punkt.anzahl));
      heatLayer = L.layerGroup(daten.punkte.map((punkt) => L.circleMarker(
        [punkt.latitude, punkt.longitude], {
          radius: 10 + 20 * (punkt.anzahl / maximum), stroke: false,
          fillColor: "#d73027", fillOpacity: 0.25 + 0.55 * (punkt.anzahl / maximum),
        },
      )));
    }
    (modus === "orte" ? markerLayer : heatLayer).addTo(heatmapKarte);
    if (grenzen.length > 1) heatmapKarte.fitBounds(grenzen, { padding: [28, 28], maxZoom: 16 });
    else if (grenzen.length === 1) heatmapKarte.setView(grenzen[0], 16);
    setTimeout(() => heatmapKarte?.invalidateSize(), 100);
  }

  function createHeatmapSection(container, planperiode) {
    const section = createElement("section", "dashboard-card dashboard-heatmap-card");
    section.id = "dashboard-orte-heatmap";
    section.appendChild(createElement("h2", "", "Erlegungsorte – Heatmap"));
    const controls = createElement("div", "dashboard-heatmap-controls");
    const gruppeFeld = createElement("div", "dashboard-heatmap-filter");
    gruppeFeld.appendChild(createElement("span", "dashboard-heatmap-filter-label", "Wildgruppen"));
    const gruppeAuswahl = createElement("div", "dashboard-heatmap-group-options");
    gruppeAuswahl.setAttribute("aria-label", "Wildgruppen auswählen; keine Auswahl bedeutet alle Wildgruppen");
    gruppeFeld.appendChild(gruppeAuswahl);
    gruppeFeld.appendChild(createElement("small", "dashboard-heatmap-filter-help", "Keine Auswahl = alle Wildgruppen"));
    const klasseLabel = createElement("label", "", "Wildklasse");
    const klasseSelect = document.createElement("select");
    klasseLabel.appendChild(klasseSelect);
    const modusLabel = createElement("label", "", "Darstellung");
    const modusSelect = document.createElement("select");
    modusSelect.innerHTML = '<option value="heatmap">Heatmap</option><option value="orte">Orte</option>';
    modusLabel.appendChild(modusSelect);
    const fallwildLabel = createElement("label", "dashboard-heatmap-fallwild");
    const fallwildInput = document.createElement("input");
    fallwildInput.type = "checkbox";
    fallwildInput.checked = false;
    fallwildLabel.append(fallwildInput, document.createTextNode("Fallwild einblenden"));
    controls.append(gruppeFeld, klasseLabel, modusLabel, fallwildLabel);
    section.appendChild(controls);
    const map = createElement("div", "dashboard-heatmap-map");
    map.setAttribute("aria-label", "Heatmap der Erlegungsorte");
    section.appendChild(map);
    const legend = createElement("div", "dashboard-heatmap-legend");
    legend.innerHTML = '<span>wenig Abschüsse</span><i aria-hidden="true"></i><span>viele Abschüsse</span>';
    section.appendChild(legend);
    const info = createElement("p", "dashboard-heatmap-info");
    section.appendChild(info);
    container.appendChild(section);

    let alleGruppen = [];
    let alleKlassen = [];
    async function laden(initial = false) {
      const ladeId = ++heatmapLadeId;
      section.setAttribute("aria-busy", "true");
      try {
        const ergebnis = await DashboardService.getAbschussHeatmapDaten({
          planperiode,
          jahr: dashboardJahr,
          wildgruppeIds: ausgewaehlteGruppen(gruppeAuswahl),
          wildklasseId: klasseSelect.value || null,
          inklusiveFallwild: fallwildInput.checked,
        });
        if (ladeId !== heatmapLadeId || !section.isConnected) return;
        if (initial) {
          alleGruppen = ergebnis.wildgruppen;
          alleKlassen = ergebnis.wildklassen;
          gruppenAuswahlRendern(gruppeAuswahl, alleGruppen, gruppenGeaendert);
          optionenSetzen(klasseSelect, alleKlassen, "Alle Wildklassen");
        }
        info.textContent = `${ergebnis.ohneKoordinaten} Abschüsse ohne gespeicherte Koordinaten.`;
        await heatmapKarteRendern(map, ergebnis, modusSelect.value, ladeId);
      } catch (error) {
        console.error("Erlegungsorte-Heatmap konnte nicht geladen werden:", error);
        info.textContent = "Die Heatmap konnte nicht geladen werden.";
      } finally {
        if (ladeId === heatmapLadeId) section.removeAttribute("aria-busy");
      }
    }
    function gruppenGeaendert() {
      const gruppenIds = ausgewaehlteGruppen(gruppeAuswahl);
      const klassen = gruppenIds.length
        ? alleKlassen.filter((klasse) => gruppenIds.includes(String(klasse.wildgruppe_id)))
        : alleKlassen;
      optionenSetzen(klasseSelect, klassen, "Alle Wildklassen");
      laden();
    }
    klasseSelect.addEventListener("change", () => laden());
    modusSelect.addEventListener("change", () => laden());
    fallwildInput.addEventListener("change", () => laden());
    laden(true);
  }

  function renderDashboardContent() {
    const content = document.getElementById("dashboardContent");
    if (!content || !dashboardData || !dashboardBereiche) return;
    destroyCharts();
    content.innerHTML = "";
    const data = dashboardData;
    const bereiche = dashboardBereiche;
    const groupNames = data.wildgruppen.map((wildgruppe) => wildgruppe.bezeichnung);
    if (bereiche.abschuss) {
      const harvestSection = createElement("section", "dashboard-harvest-section");
      harvestSection.id = "dashboard-abschuss";
      content.appendChild(harvestSection);
      groupNames.forEach((groupName) => {
        const rows = data.planpositionen.filter((row) => row.wildgruppe === groupName);
        harvestSection.appendChild(createGroupCard(
          groupName, rows, data.planperiode, data.jaeger,
          data.hirsch_b1,
        ));
      });
    }
    if (bereiche.abschuss || bereiche.jaeger || bereiche.wildhaendler) {
      createYearFilter(content, data.planperiode);
    }
    const jaegerRows = dashboardJahr === "beide" ? data.jaeger :
      data.jaeger.filter((row) => String(row.jahr) === dashboardJahr);
    if (bereiche.jaeger) createHunterCharts(content, jaegerRows, data.wildgruppen);
    if (bereiche.wildhaendler) {
      const dealerKey = dashboardJahr === "beide" ? "beide" : dashboardJahr;
      createDealerCharts(content, data.wildhaendler?.[dealerKey] || {});
    }
    observeDashboardSections();
  }

  function scrollToSection(sectionId) {
    const target = document.getElementById(sectionId || "dashboard-abschuss");
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  function observeDashboardSections() {
    const sections = [
      "dashboard-abschuss",
      "dashboard-jaeger",
      "dashboard-wildhaendler",
    ].map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length || typeof IntersectionObserver !== "function") return;

    sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort(
          (left, right) =>
            Math.abs(left.boundingClientRect.top - 76) -
            Math.abs(right.boundingClientRect.top - 76),
        );
      const activeId = visible[0]?.target.id;
      if (!activeId || typeof Router === "undefined") return;
      Router.currentDashboardSection = activeId;
      Router.updateMenu("dashboard");
    }, {
      rootMargin: "-76px 0px -55% 0px",
      threshold: [0, 0.01],
    });
    sections.forEach((section) => sectionObserver.observe(section));
  }

  async function init(initialSection = null) {
    const content = document.getElementById("dashboardContent");
    const period = document.getElementById("dashboardPeriod");
    const error = document.getElementById("dashboardError");
    if (!content || !period || !error) return;

    destroyCharts();
    dashboardData = null;
    dashboardBereiche = null;
    dashboardJahr = "beide";
    content.innerHTML = "";
    error.hidden = true;

    try {
      const bereiche = {
        abschuss: BerechtigungService.darf("dashboard-abschuss", "Lesen"),
        jaeger: BerechtigungService.darf("dashboard-jaeger", "Lesen"),
        wildhaendler: BerechtigungService.darf("dashboard-wildhaendler", "Lesen"),
      };
      const data = await DashboardService.loadDashboard(bereiche);
      if (!data.planperiode) {
        period.textContent = "Keine aktive Planperiode";
        content.appendChild(createElement(
          "div",
          "no-data",
          "Für das Dashboard ist eine aktive Planperiode erforderlich.",
        ));
        return;
      }

      period.textContent =
        `Aktive Planperiode: ${data.planperiode.startjahr} / ` +
        data.planperiode.endjahr;
      dashboardData = data;
      dashboardBereiche = bereiche;
      const aktuellesJahr = new Date().getFullYear();
      dashboardJahr = [Number(data.planperiode.startjahr), Number(data.planperiode.endjahr)]
        .includes(aktuellesJahr) ? String(aktuellesJahr) : "beide";
      renderDashboardContent();
      if (initialSection) {
        requestAnimationFrame(() => scrollToSection(initialSection));
      }
    } catch (loadError) {
      console.error("Dashboard konnte nicht geladen werden:", loadError);
      error.hidden = false;
    }
  }

  async function initHeatmapPage() {
    const content = document.getElementById("heatmapDashboardContent");
    const period = document.getElementById("heatmapDashboardPeriode");
    const error = document.getElementById("heatmapDashboardFehler");
    if (!content || !period || !error) return;
    destroyCharts();
    content.innerHTML = "";
    error.hidden = true;
    try {
      const planperiode = await DashboardService.getAktivePlanperiode();
      if (!planperiode) {
        period.textContent = "Keine aktive Planperiode";
        content.appendChild(createElement("div", "no-data",
          "Für die Heatmap ist eine aktive Planperiode erforderlich."));
        return;
      }
      period.textContent = `Aktive Planperiode: ${planperiode.startjahr} / ${planperiode.endjahr}`;
      const aktuellesJahr = new Date().getFullYear();
      dashboardJahr = [Number(planperiode.startjahr), Number(planperiode.endjahr)]
        .includes(aktuellesJahr) ? String(aktuellesJahr) : "beide";
      const rendern = () => {
        if (!content.isConnected) return;
        if (heatmapKarte) { heatmapKarte.remove(); heatmapKarte = null; }
        heatmapLadeId += 1;
        content.innerHTML = "";
        createYearFilter(content, planperiode, rendern);
        createHeatmapSection(content, planperiode);
      };
      rendern();
    } catch (loadError) {
      console.error("Heatmap-Dashboard konnte nicht geladen werden:", loadError);
      error.hidden = false;
    }
  }

  return { init, initHeatmapPage, scrollToSection };
})();

window.Dashboard = Dashboard;
