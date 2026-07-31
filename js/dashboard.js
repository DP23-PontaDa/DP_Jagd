const Dashboard = (() => {
  const GROUP_KEYS = {
    rotwild: "rotwild",
    rehwild: "rehwild",
    gamswild: "gamswild",
  };
  let charts = [];

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
            label: `Soll ${aktuellesJahr}`,
            data: rows.map((row) => numberValue(row.soll_aktuelles_jahr)),
            backgroundColor: classColors,
            stack: "soll-aktuell",
          },
          {
            label: "Ist KJ",
            data: rows.map((row) => numberValue(row.ist_kj)),
            backgroundColor: classColors.map((color) =>
              withAlpha(color, 0.78)),
            stack: "ist-kj",
          },
          {
            label: `Ist ${planperiode.startjahr}`,
            data: rows.map((row) => numberValue(row.ist_startjahr)),
            backgroundColor: classColors.map((color) =>
              withAlpha(color, 0.56)),
            stack: "ist-startjahr",
          },
          {
            label: `Ist ${planperiode.endjahr}`,
            data: rows.map((row) => numberValue(row.ist_endjahr)),
            backgroundColor: classColors.map((color) =>
              withAlpha(color, 0.36)),
            stack: "ist-endjahr",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom" },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
    charts.push(chart);
  }

  function createPlanTable(rows) {
    const wrapper = createElement("div", "dashboard-table-wrap");
    const table = createElement("table", "ap-table dashboard-plan-table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const aktuellesJahr =
      rows[0]?.aktuelles_jahr || new Date().getFullYear();
    const columns = [
      "Planposition",
      `Soll ${aktuellesJahr}`,
      "Ist KJ",
      "Rest",
      "%",
      "Fallwild",
    ];
    columns.forEach((label, index) => {
        const th = createElement("th", index ? "ap-number-column" : "", label);
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
          index ? "ap-number-column" : "",
          String(value ?? 0),
        );
        cell.dataset.label = columns[index];
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
    table.append(head, body);
    wrapper.appendChild(table);
    return wrapper;
  }

  function createGroupCard(groupName, rows, planperiode) {
    const key = GROUP_KEYS[groupName.toLocaleLowerCase("de")] || "";
    const card = createElement(
      "section",
      `dashboard-card dashboard-group-card dashboard-group-${key}`,
    );
    card.appendChild(createElement("h2", "", groupName));

    const chartWrap = createElement("div", "dashboard-plan-chart");
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      `Soll- und Ist-Werte für ${groupName}`,
    );
    chartWrap.appendChild(canvas);
    card.append(chartWrap, createPlanTable(rows));
    createPlanChart(canvas, rows, planperiode);
    return card;
  }

  function createJaegerChart(container, rows) {
    const card = createElement("section", "dashboard-card");
    card.appendChild(createElement("h2", "", "Abschüsse nach Jäger"));
    const chartWrap = createElement("div", "dashboard-hunter-chart");
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Reguläre Abschüsse nach Jäger und Wildgruppe",
    );
    chartWrap.appendChild(canvas);
    card.appendChild(chartWrap);
    container.appendChild(card);

    const hunters = [];
    const hunterIds = new Set();
    const classes = [];
    const classIds = new Set();
    rows.forEach((row) => {
      if (!hunterIds.has(row.jaeger_id)) {
        hunterIds.add(row.jaeger_id);
        hunters.push({ id: row.jaeger_id, name: row.jaeger });
      }
      if (!classIds.has(row.wildklasse_id)) {
        classIds.add(row.wildklasse_id);
        classes.push(row);
      }
    });

    charts.push(new Chart(canvas, {
      type: "bar",
      data: {
        labels: hunters.map((hunter) => hunter.name),
        datasets: classes.map((wildklasse) => ({
          label: `${wildklasse.wildgruppe} – ${wildklasse.wildklasse}`,
          data: hunters.map((hunter) => {
            const value = rows.find(
              (row) =>
                row.jaeger_id === hunter.id &&
                row.wildklasse_id === wildklasse.wildklasse_id,
            );
            return numberValue(value?.anzahl);
          }),
          backgroundColor: WildklasseColors.get(
            wildklasse.wildgruppe,
            wildklasse.wildklasse,
          ),
        })),
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
          y: { stacked: true, grid: { display: false } },
        },
      },
    }));
  }

  async function init() {
    const content = document.getElementById("dashboardContent");
    const period = document.getElementById("dashboardPeriod");
    const error = document.getElementById("dashboardError");
    if (!content || !period || !error) return;

    destroyCharts();
    content.innerHTML = "";
    error.hidden = true;

    try {
      const data = await DashboardService.loadDashboard();
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
      const groupNames = ["Rotwild", "Rehwild", "Gamswild"];
      groupNames.forEach((groupName) => {
        const rows = data.planpositionen.filter(
          (row) => row.wildgruppe === groupName,
        );
        content.appendChild(createGroupCard(
          groupName,
          rows,
          data.planperiode,
        ));
      });

      createJaegerChart(content, data.jaeger);
    } catch (loadError) {
      console.error("Dashboard konnte nicht geladen werden:", loadError);
      error.hidden = false;
    }
  }

  return { init };
})();

window.Dashboard = Dashboard;
