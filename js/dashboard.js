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
  let dashboardAuswertungsJahre = new Set();
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

  const planValueLabels = {
    id: "planValueLabels",
    afterDatasetsDraw(chart) {
      const { ctx, data } = chart;
      ctx.save();
      ctx.fillStyle = "#243342";
      ctx.font = "600 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      data.datasets.forEach((dataset, datasetIndex) => {
        if (!dataset.valueLabel) return;
        chart.getDatasetMeta(datasetIndex).data.forEach((bar, index) => {
          const value = dataset.data[index];
          if (value === null || value === undefined) return;
          if (dataset.valueLabel === "stack-total") {
            const stackDatasets = data.datasets.filter((item) =>
              item.stack === dataset.stack && item.metricKey === dataset.metricKey);
            const total = stackDatasets.reduce((sum, item) =>
              sum + numberValue(item.data[index]), 0);
            const top = data.datasets.map((item, itemIndex) => ({ item, itemIndex }))
              .filter(({ item }) => item.stack === dataset.stack &&
                item.metricKey === dataset.metricKey &&
                item.data[index] !== null && item.data[index] !== undefined)
              .map(({ itemIndex }) => chart.getDatasetMeta(itemIndex).data[index])
              .filter(Boolean)
              .reduce((minimum, element) => Math.min(minimum, element.y), bar.y);
            ctx.fillText(String(total), bar.x, top - 6);
            return;
          }
          if (dataset.valueLabel === "stack-segment") {
            const base = Number(bar.base);
            const top = Number(bar.y);
            if (!Number.isFinite(base) || !Number.isFinite(top) || Math.abs(base - top) < 14) return;
            ctx.fillStyle = "#ffffff";
            ctx.textBaseline = "middle";
            ctx.fillText(String(numberValue(value)), bar.x, top + ((base - top) / 2));
            ctx.fillStyle = "#243342";
            ctx.textBaseline = "bottom";
            return;
          }
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
      ctx.save();
      ctx.fillStyle = "#596775";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      data.labels.forEach((label, index) => {
        const metriken = new Map();
        data.datasets.forEach((dataset, datasetIndex) => {
          const value = dataset.data[index];
          const bar = chart.getDatasetMeta(datasetIndex).data[index];
          if (!bar || value === null || value === undefined || metriken.has(dataset.metricKey)) return;
          metriken.set(dataset.metricKey, {
            bar,
            zeilen: dataset.axisLines || [dataset.axisLabel || dataset.label],
          });
        });
        metriken.forEach((entry) => {
          entry.zeilen.forEach((zeile, zeilenIndex) =>
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

  function relevantesPlanjahr(rows, planperiode) {
    const startjahr = Number(planperiode.startjahr);
    const endjahr = Number(planperiode.endjahr);
    const datenjahr = Number(rows[0]?.aktuelles_jahr);
    const kalenderjahr = Number.isFinite(datenjahr) ? datenjahr : new Date().getFullYear();
    if (kalenderjahr < startjahr) return startjahr;
    if (kalenderjahr > endjahr) return endjahr;
    return kalenderjahr;
  }

  function planperiodenJahre(planperiode) {
    const startjahr = Number(planperiode.startjahr);
    const endjahr = Number(planperiode.endjahr);
    return [...new Set([startjahr, endjahr].filter(Number.isFinite))];
  }

  function istJahreswert(row, jahr, planperiode) {
    if (Number(jahr) === Number(planperiode.startjahr)) return numberValue(row.ist_startjahr);
    if (Number(jahr) === Number(planperiode.endjahr)) return numberValue(row.ist_endjahr);
    return 0;
  }

  function sollJahreswert(row, jahr, planperiode) {
    const gespeicherterWert = row.soll_jahreswerte?.[String(jahr)];
    if (gespeicherterWert !== undefined && gespeicherterWert !== null) {
      return numberValue(gespeicherterWert);
    }
    if (Number(jahr) === Number(planperiode.startjahr)) return numberValue(row.soll_startjahr);
    if (Number(jahr) === Number(planperiode.endjahr)) return numberValue(row.soll_endjahr);
    return numberValue(row.soll_aktuelles_jahr);
  }

  function istInterneJahresauswertung(row) {
    return row.nur_jahre === true || row.ohne_soll === true;
  }

  function createPlanChart(canvas, rows, planperiode) {
    const labels = rows.map((row) => row.planposition);
    const classColors = rows.map((row) =>
      WildklasseColors.get(row.wildgruppe, row.planposition));
    const jahre = planperiodenJahre(planperiode);
    const aktuellesJahr = relevantesPlanjahr(rows, planperiode);
    const sollFarben = classColors.map((color) => withAlpha(color, 0.34));
    const istJahresFarben = jahre.map((jahr, index) => classColors.map((color) =>
      withAlpha(color, index === 0 ? 0.92 : 0.68)));
    const datasets = [
      {
        label: "Soll",
        legendLabel: "Soll",
        legendKey: "soll",
        showInLegend: true,
        axisLabel: "Soll/Periode",
        axisLines: ["Soll", "Periode"],
        metricKey: "soll-periode",
        data: rows.map((row) => istInterneJahresauswertung(row)
          ? null : numberValue(row.soll_kj)),
        backgroundColor: sollFarben,
        stack: "soll-periode",
        skipNull: true,
        valueLabel: "single",
      },
      ...jahre.map((jahr, index) => ({
        label: `Ist ${jahr}`,
        legendLabel: `Ist ${jahr}`,
        legendKey: `ist-${jahr}`,
        showInLegend: true,
        axisLabel: "Ist/Periode",
        axisLines: ["Ist", "Periode"],
        metricKey: "ist-periode",
        jahr,
        data: rows.map((row) => istInterneJahresauswertung(row)
          ? null : istJahreswert(row, jahr, planperiode)),
        backgroundColor: istJahresFarben[index],
        stack: "ist-periode",
        skipNull: true,
        // Der erste Jahreswert bleibt als unterstes Segment der Stapelsäule
        // sichtbar beschriftet; der letzte liefert weiterhin die Gesamtsumme.
        valueLabel: index === 0 ? "stack-segment" :
          (index === jahre.length - 1 ? "stack-total" : null),
      })),
      {
        label: `Soll ${aktuellesJahr}`,
        axisLabel: `Soll/${aktuellesJahr}`,
        axisLines: ["Soll", String(aktuellesJahr)],
        metricKey: "soll-jahr",
        data: rows.map((row) => istInterneJahresauswertung(row)
          ? null : sollJahreswert(row, aktuellesJahr, planperiode)),
        backgroundColor: sollFarben,
        stack: "soll-jahr",
        skipNull: true,
        valueLabel: "single",
      },
      {
        label: `Ist ${aktuellesJahr}`,
        axisLabel: `Ist/${aktuellesJahr}`,
        axisLines: ["Ist", String(aktuellesJahr)],
        metricKey: "ist-jahr",
        data: rows.map((row) => istInterneJahresauswertung(row)
          ? null : istJahreswert(row, aktuellesJahr, planperiode)),
        backgroundColor: classColors.map((color) => withAlpha(color, 0.92)),
        stack: "ist-jahr",
        skipNull: true,
        valueLabel: "single",
      },
      ...jahre.map((jahr, index) => ({
        label: `Ist ${jahr}`,
        axisLabel: `Ist/${jahr}`,
        axisLines: ["Ist", String(jahr)],
        metricKey: `intern-ist-${jahr}`,
        data: rows.map((row) => istInterneJahresauswertung(row)
          ? istJahreswert(row, jahr, planperiode) : null),
        backgroundColor: istJahresFarben[index],
        stack: `intern-ist-${jahr}`,
        skipNull: true,
        valueLabel: "single",
      })),
    ];
    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets,
      },
      plugins: [planValueLabels, planAxisLabels],
      options: DashboardChartOptions.withTooltip({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 24, bottom: 50 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const context = items[0];
                if (!context) return "";
                const dataset = context.dataset;
                const index = context.dataIndex;
                const wert = dataset.metricKey === "ist-periode"
                  ? datasets.filter((item) => item.metricKey === "ist-periode")
                    .reduce((sum, item) => sum + numberValue(item.data[index]), 0)
                  : numberValue(context.raw);
                return [String(context.label || ""), `${dataset.axisLabel}: ${wert}`];
              },
              label: (context) => context.dataset.metricKey === "ist-periode"
                ? jahre.map((jahr) => {
                  const dataset = datasets.find((item) =>
                    item.metricKey === "ist-periode" && Number(item.jahr) === Number(jahr));
                  return `${jahr}: ${numberValue(dataset?.data[context.dataIndex])}`;
                })
                : null,
            },
          },
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
    const verwendet = new Set();
    chart.data.datasets.forEach((dataset) => {
      if (!dataset.showInLegend || verwendet.has(dataset.legendKey)) return;
      verwendet.add(dataset.legendKey);
      const item = createElement("span", "dashboard-plan-legend-item");
      item.setAttribute("role", "listitem");
      const color = Array.isArray(dataset.backgroundColor)
        ? dataset.backgroundColor[0] : dataset.backgroundColor;
      const swatch = createElement("span", "dashboard-plan-legend-swatch");
      swatch.style.backgroundColor = color || "#596775";
      item.append(swatch, document.createTextNode(dataset.legendLabel || dataset.label));
      legend.appendChild(item);
    });
    return legend;
  }

  function createPlanTable(rows, planperiode) {
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
    const aktuellesJahr = relevantesPlanjahr(rows, planperiode);
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
        sollJahreswert(row, aktuellesJahr, planperiode),
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
    const aktuellesJahr = relevantesPlanjahr(dashboardRows, planperiode);
    console.groupCollapsed(`[Dashboard Soll Debug] ${groupName}`);
    dashboardRows.forEach((row) => console.debug({
      Planposition: row.planposition,
      Wildgruppe: row.wildgruppe || groupName,
      Planperiode: `${planperiode.startjahr}/${planperiode.endjahr}`,
      "Soll KJ": numberValue(row.soll_kj),
      "Soll Periode": numberValue(row.soll_kj),
      [`Soll ${planperiode.startjahr}`]: sollJahreswert(
        row, planperiode.startjahr, planperiode,
      ),
      [`Soll ${planperiode.endjahr}`]: sollJahreswert(
        row, planperiode.endjahr, planperiode,
      ),
      "aktuelles Jahr": aktuellesJahr,
      "Soll aktuelles Jahr": sollJahreswert(row, aktuellesJahr, planperiode),
      "Abschussplan Soll aktuelles Jahr":
        sollJahreswert(row, aktuellesJahr, planperiode),
      Quelle: "gemeinsame AbschussplanService-Jahressollwertfunktion",
    }));
    console.groupEnd();
    const chartWrap = createElement("div", "dashboard-plan-chart");
    const chartStage = createElement("div", "dashboard-plan-chart-stage");
    chartStage.style.minWidth = `${Math.max(
      key === "rotwild" ? 1100 : 620,
      dashboardRows.length * 165,
    )}px`;
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
      createPlanTable(
        dashboardRows.filter((row) => !row.nur_diagramm),
        planperiode,
      ),
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

  function createDashboardFilters(container, data, bereiche) {
    const section = createElement("section", "dashboard-analysis-filters");
    const periodeLabel = createElement("label", "", "Planperiode für Rotwild, Rehwild und Gamswild");
    const periodeSelect = document.createElement("select");
    (data.planperioden || []).forEach((periode) => {
      const option = document.createElement("option");
      option.value = periode.id;
      option.textContent = `${periode.bezeichnung || "Planperiode"} (${periode.startjahr} / ${periode.endjahr})${periode.status === "AKTIV" ? " – aktiv" : ""}`;
      option.selected = String(periode.id) === String(data.planperiode.id);
      periodeSelect.appendChild(option);
    });
    periodeSelect.addEventListener("change", () => {
      const periode = (data.planperioden || []).find((item) => String(item.id) === periodeSelect.value);
      dashboardAuswertungsJahre = new Set([periode?.startjahr, periode?.endjahr].map(Number));
      ladeDashboardDaten(periodeSelect.value);
    });
    periodeLabel.appendChild(periodeSelect);
    section.appendChild(periodeLabel);

    container.appendChild(section);
  }

  function createAuswertungsJahrFilter(container, data) {
    const section = createElement("section", "dashboard-analysis-year-filter dashboard-analysis-year-filter-section");
    section.appendChild(createElement("strong", "", "Jahre für Abschüsse nach Jäger und Wildfleisch"));
    const auswahl = document.createElement("details");
    auswahl.className = "abschuss-multifilter";
    const summary = document.createElement("summary");
    const optionen = createElement("div", "abschuss-multifilter-options");
    const aktualisieren = () => {
      const jahre = data.jahre || [];
      summary.textContent = !dashboardAuswertungsJahre.size ? "Jahre: Keine Auswahl" :
        dashboardAuswertungsJahre.size === jahre.length ? "Jahre: Alle" :
          `Jahre: ${[...dashboardAuswertungsJahre].sort((a, b) => b - a).join(", ")}`;
    };
    (data.jahre || []).forEach((jahr) => {
      const label = createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = dashboardAuswertungsJahre.has(Number(jahr));
      input.addEventListener("change", () => {
        if (input.checked) dashboardAuswertungsJahre.add(Number(jahr));
        else dashboardAuswertungsJahre.delete(Number(jahr));
        aktualisieren();
        renderDashboardContent();
      });
      label.append(input, document.createTextNode(String(jahr)));
      optionen.appendChild(label);
    });
    aktualisieren();
    auswahl.append(summary, optionen);
    section.appendChild(auswahl);
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
      input.checked = ["rotwild", "rehwild"].includes(String(gruppe.bezeichnung || "").trim().toLocaleLowerCase("de"));
      input.addEventListener("change", onChange);
      label.append(input, document.createTextNode(gruppe.bezeichnung));
      container.appendChild(label);
    });
  }

  function ausgewaehlteGruppen(container) {
    return [...container.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => input.value);
  }

  function heatmapPopup(punkt, jahr) {
    const container = createElement("div", "dashboard-heatmap-popup");
    container.appendChild(createElement("strong", "", punkt.ort_name));
    container.appendChild(createElement("div", "", `Jahr: ${jahr === "beide" ? "Alle Jahre" : jahr}`));
    container.appendChild(createElement("div", "", `${punkt.anzahl} Abschüsse`));
    punkt.wildgruppen.forEach((gruppe) => container.appendChild(
      createElement("div", "", `${gruppe.bezeichnung}: ${gruppe.anzahl}`),
    ));
    return container;
  }

  function heatmapFarbe(intensitaet) {
    const farben = [
      [0, [43, 131, 186]], [0.25, [102, 189, 99]], [0.5, [254, 224, 139]],
      [0.75, [244, 109, 67]], [1, [215, 25, 28]],
    ];
    const wert = Math.max(0, Math.min(1, Number(intensitaet) || 0));
    const ende = farben.find((eintrag) => wert <= eintrag[0]) || farben[farben.length - 1];
    const start = [...farben].reverse().find((eintrag) => eintrag[0] <= wert) || farben[0];
    const anteil = start[0] === ende[0] ? 0 : (wert - start[0]) / (ende[0] - start[0]);
    const rgb = start[1].map((kanal, index) => Math.round(kanal + (ende[1][index] - kanal) * anteil));
    return `rgb(${rgb.join(",")})`;
  }

  async function heatmapKarteRendern(container, daten, modus, ladeId, zahlenAnzeigen = false) {
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
      const popup = heatmapPopup(punkt, daten.jahr);
      if (zahlenAnzeigen) {
        const intensitaet = punkt.anzahl / Math.max(1, daten.maxAbschuesse || 0);
        const hintergrund = heatmapFarbe(intensitaet);
        const schriftfarbe = intensitaet >= 0.58 ? "#fff" : "#243342";
        L.marker(position, { icon: L.divIcon({ className: "dashboard-heatmap-count", html: `<span style="background:${hintergrund};color:${schriftfarbe}">${punkt.anzahl}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).bindPopup(popup).addTo(markerLayer);
      } else {
        L.circleMarker(position, { radius: 10, color: "#243342", weight: 1, fillColor: "#fff", fillOpacity: 0.08, opacity: 0.35 }).bindPopup(popup).addTo(markerLayer);
      }
    });
    let heatLayer;
    if (typeof L.heatLayer === "function") {
      const maximum = Math.max(1, daten.maxAbschuesse || 0);
      heatLayer = L.heatLayer(
        daten.punkte.map((punkt) => [punkt.latitude, punkt.longitude, punkt.anzahl / maximum]),
        { radius: 22, blur: 12, maxZoom: 17, max: 1, minOpacity: 0.35,
          gradient: { 0: "#2B83BA", 0.25: "#66BD63", 0.5: "#FEE08B", 0.75: "#F46D43", 1: "#D7191C" } },
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
    if (modus === "orte") markerLayer.addTo(heatmapKarte);
    else { heatLayer.addTo(heatmapKarte); markerLayer.addTo(heatmapKarte); }
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
    const klasseLabel = createElement("div", "dashboard-heatmap-filter");
    klasseLabel.appendChild(createElement("span", "dashboard-heatmap-filter-label", "Wildklassen"));
    const klasseAuswahl = document.createElement("details");
    klasseAuswahl.className = "abschuss-multifilter";
    const klasseText = document.createElement("summary");
    klasseText.textContent = "Wildklassen: Alle";
    const klasseOptionen = createElement("div", "abschuss-multifilter-options");
    klasseAuswahl.append(klasseText, klasseOptionen);
    klasseLabel.appendChild(klasseAuswahl);
    const modusLabel = createElement("label", "", "Darstellung");
    const modusSelect = document.createElement("select");
    modusSelect.innerHTML = '<option value="heatmap">Heatmap</option><option value="orte">Orte</option>';
    modusLabel.appendChild(modusSelect);
    const fallwildLabel = createElement("label", "dashboard-heatmap-fallwild");
    const fallwildInput = document.createElement("input");
    fallwildInput.type = "checkbox";
    fallwildInput.checked = false;
    fallwildLabel.append(fallwildInput, document.createTextNode("Fallwild einblenden"));
    const zahlenLabel = createElement("label", "dashboard-heatmap-fallwild");
    const zahlenInput = document.createElement("input");
    zahlenInput.type = "checkbox";
    zahlenInput.checked = true;
    zahlenLabel.append(zahlenInput, document.createTextNode("Abschusszahlen anzeigen"));
    controls.append(gruppeFeld, klasseLabel, modusLabel, fallwildLabel, zahlenLabel);
    section.appendChild(controls);
    const map = createElement("div", "dashboard-heatmap-map");
    map.setAttribute("aria-label", "Heatmap der Erlegungsorte");
    section.appendChild(map);
    const legend = createElement("div", "dashboard-heatmap-legend");
    legend.innerHTML = '<span>0</span><i aria-hidden="true"></i><span>0 Abschüsse</span>';
    section.appendChild(legend);
    const info = createElement("p", "dashboard-heatmap-info");
    section.appendChild(info);
    container.appendChild(section);

    let alleGruppen = [];
    let alleKlassen = [];
    let wildklasseIds = new Set();
    function klassenOptionenSetzen(klassen) {
      const erlaubt = new Set(klassen.map((klasse) => String(klasse.id)));
      wildklasseIds = new Set([...wildklasseIds].filter((id) => erlaubt.has(id)));
      klasseOptionen.innerHTML = "";
      klassen.forEach((klasse) => {
        const id = String(klasse.id);
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.dataset.wildklasseId = id;
        input.checked = wildklasseIds.has(id);
        label.append(input, document.createTextNode(klasse.bezeichnung));
        klasseOptionen.appendChild(label);
      });
      klasseText.textContent = !wildklasseIds.size ? "Wildklassen: Alle"
        : wildklasseIds.size === 1
          ? `Wildklasse: ${klassen.find((klasse) => wildklasseIds.has(String(klasse.id)))?.bezeichnung || ""}`
          : `Wildklassen: ${wildklasseIds.size} ausgewählt`;
    }
    async function laden(initial = false) {
      const ladeId = ++heatmapLadeId;
      section.setAttribute("aria-busy", "true");
      try {
        const ergebnis = await DashboardService.getAbschussHeatmapDaten({
          planperiode,
          jahr: dashboardJahr,
          wildgruppeIds: ausgewaehlteGruppen(gruppeAuswahl),
          wildklasseIds: [...wildklasseIds],
          inklusiveFallwild: fallwildInput.checked,
        });
        if (ladeId !== heatmapLadeId || !section.isConnected) return;
        if (initial) {
          alleGruppen = ergebnis.wildgruppen;
          alleKlassen = ergebnis.wildklassen;
          gruppenAuswahlRendern(gruppeAuswahl, alleGruppen, gruppenGeaendert);
          klassenOptionenSetzen(alleKlassen);
          return laden();
        }
        const maximum = ergebnis.maxAbschuesse || 0;
        legend.hidden = maximum === 0;
        legend.querySelector("span:first-child").textContent = "0";
        legend.querySelector("span:last-child").textContent = `${maximum} Abschüsse`;
        info.textContent = maximum
          ? `${ergebnis.ohneKoordinaten} Abschüsse ohne gespeicherte Koordinaten.`
          : `Keine Abschüsse mit Koordinaten für ${dashboardJahr === "beide" ? "alle Jahre" : `das Jahr ${dashboardJahr}`} vorhanden.`;
        if (maximum) await heatmapKarteRendern(map, ergebnis, modusSelect.value, ladeId, zahlenInput.checked);
        else if (heatmapKarte) { heatmapKarte.remove(); heatmapKarte = null; }
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
      klassenOptionenSetzen(klassen);
      laden();
    }
    klasseAuswahl.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-wildklasse-id]");
      if (!input) return;
      if (input.checked) wildklasseIds.add(input.dataset.wildklasseId);
      else wildklasseIds.delete(input.dataset.wildklasseId);
      klassenOptionenSetzen(alleKlassen.filter((klasse) => {
        const gruppenIds = ausgewaehlteGruppen(gruppeAuswahl);
        return !gruppenIds.length || gruppenIds.includes(String(klasse.wildgruppe_id));
      }));
      laden();
    });
    modusSelect.addEventListener("change", () => laden());
    fallwildInput.addEventListener("change", () => laden());
    zahlenInput.addEventListener("change", () => laden());
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
    if (bereiche.abschuss || bereiche.jaeger || bereiche.wildhaendler) {
      createDashboardFilters(content, data, bereiche);
    }
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
    if (bereiche.jaeger || bereiche.wildhaendler) {
      createAuswertungsJahrFilter(content, data);
    }
    const jaegerRows = data.jaeger.filter((row) =>
      dashboardAuswertungsJahre.has(Number(row.jahr)));
    if (bereiche.jaeger) createHunterCharts(content, jaegerRows, data.wildgruppen);
    if (bereiche.wildhaendler) {
      createDealerCharts(content, DashboardService.auswertungWildhaendler(
        data.wildhaendler || [], data.wildgruppen, [...dashboardAuswertungsJahre],
      ));
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

  async function ladeDashboardDaten(planperiodeId = null, initialSection = null) {
    const content = document.getElementById("dashboardContent");
    const period = document.getElementById("dashboardPeriod");
    const error = document.getElementById("dashboardError");
    if (!content || !period || !error || !dashboardBereiche) return;
    destroyCharts();
    content.innerHTML = "";
    error.hidden = true;
    try {
      const data = await DashboardService.loadDashboard(dashboardBereiche, planperiodeId);
      if (!data.planperiode) {
        period.textContent = "Keine aktive Planperiode";
        content.appendChild(createElement("div", "no-data",
          "Für das Dashboard ist eine aktive Planperiode erforderlich."));
        return;
      }
      period.textContent = `Planperiode: ${data.planperiode.startjahr} / ${data.planperiode.endjahr}`;
      dashboardData = data;
      if (!dashboardAuswertungsJahre.size) {
        dashboardAuswertungsJahre = new Set([
          Number(data.planperiode.startjahr), Number(data.planperiode.endjahr),
        ]);
      }
      renderDashboardContent();
      if (initialSection) requestAnimationFrame(() => scrollToSection(initialSection));
    } catch (loadError) {
      console.error("Dashboard konnte nicht geladen werden:", loadError);
      error.hidden = false;
    }
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
    dashboardAuswertungsJahre = new Set();
    content.innerHTML = "";
    error.hidden = true;

    try {
      const bereiche = {
        abschuss: BerechtigungService.darf("dashboard-abschuss", "Lesen"),
        jaeger: BerechtigungService.darf("dashboard-jaeger", "Lesen"),
        wildhaendler: BerechtigungService.darf("dashboard-wildhaendler", "Lesen"),
      };
      dashboardBereiche = bereiche;
      await ladeDashboardDaten(null, initialSection);
      return;
      /* legacy loading branch retained below */
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
