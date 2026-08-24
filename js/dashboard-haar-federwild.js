window.HaarFederwildDashboard = (() => {
  let daten = null; let jahrFilter = "beide"; const charts = [];
  const el = (id) => document.getElementById(id);
  const zahl = (wert) => Number(wert) || 0;

  function element(tag, klasse, text) {
    const node = document.createElement(tag);
    if (klasse) node.className = klasse;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function chartsLoeschen() { charts.splice(0).forEach((chart) => chart.destroy()); }
  function ausgewaehlteJahre() {
    return jahrFilter === "beide"
      ? new Set([Number(daten.planperiode.startjahr), Number(daten.planperiode.endjahr)])
      : new Set([Number(jahrFilter)]);
  }

  function jahresfilter(container) {
    const filter = element("section", "dashboard-year-filter");
    filter.appendChild(element("strong", "", "Jahr:"));
    const gruppe = element("div", "dashboard-year-filter-buttons");
    [String(daten.planperiode.startjahr), String(daten.planperiode.endjahr), "beide"]
      .forEach((wert) => {
        const button = element("button", "btn btn-outline", wert === "beide" ? "Beide" : wert);
        button.type = "button"; button.classList.toggle("active", jahrFilter === wert);
        button.setAttribute("aria-pressed", String(jahrFilter === wert));
        button.onclick = () => { if (jahrFilter !== wert) { jahrFilter = wert; rendern(); } };
        gruppe.appendChild(button);
      });
    filter.appendChild(gruppe); container.appendChild(filter);
  }

  const wertLabels = {
    id: "haarFederwildWertLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart; ctx.save(); ctx.fillStyle = "#243342";
      ctx.font = "600 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      chart.getDatasetMeta(0).data.forEach((bar, index) =>
        ctx.fillText(String(zahl(chart.data.datasets[0].data[index])), bar.x, Math.max(12, bar.y - 7)));
      ctx.restore();
    },
  };

  const jaegerLabels = {
    id: "haarFederwildJaegerLabels",
    afterDatasetsDraw(chart) {
      const { ctx, scales } = chart; ctx.save(); ctx.fillStyle = "#243342";
      ctx.font = "600 12px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      chart.getDatasetMeta(0).data.forEach((bar, index) => {
        const wert = zahl(chart.data.datasets[0].data[index]);
        ctx.fillText(String(wert), scales.x.getPixelForValue(wert) + 6, bar.y);
      });
      ctx.restore();
    },
  };

  function klassenAggregieren(rows) {
    const gruppiert = new Map();
    rows.forEach((row) => {
      const aktuell = gruppiert.get(String(row.wildklasse_id)) || { ...row, anzahl: 0 };
      aktuell.anzahl += zahl(row.anzahl); gruppiert.set(String(row.wildklasse_id), aktuell);
    });
    return [...gruppiert.values()].filter((row) => row.anzahl > 0).sort((a, b) =>
      zahl(a.wildgruppe_reihenfolge) - zahl(b.wildgruppe_reihenfolge) ||
      zahl(a.wildklasse_reihenfolge) - zahl(b.wildklasse_reihenfolge));
  }

  function jaegerAggregieren(rows) {
    const gruppiert = new Map();
    rows.forEach((row) => {
      const aktuell = gruppiert.get(String(row.jaeger_id)) || { ...row, anzahl: 0 };
      aktuell.anzahl += zahl(row.anzahl); gruppiert.set(String(row.jaeger_id), aktuell);
    });
    return [...gruppiert.values()].filter((row) => row.anzahl > 0).sort((a, b) =>
      b.anzahl - a.anzahl || nummer(a.jaeger_nr) - nummer(b.jaeger_nr) ||
      String(a.jaeger).localeCompare(String(b.jaeger), "de"));
  }

  function nummer(wert) {
    const result = Number(wert); return Number.isFinite(result) ? result : Number.MAX_SAFE_INTEGER;
  }

  function leereKarte(container, titel) {
    const card = element("section", "dashboard-card haar-federwild-dashboard-card");
    card.append(element("h2", "", titel), element("div", "dashboard-chart-empty", "Keine Abschüsse vorhanden."));
    container.appendChild(card);
  }

  function klassenChart(container, rows) {
    if (!rows.length) return leereKarte(container, "Haar- und Federwild");
    const card = element("section", "dashboard-card haar-federwild-dashboard-card");
    card.appendChild(element("h2", "", "Haar- und Federwild"));
    const scroll = element("div", "haar-federwild-chart-scroll");
    const stage = element("div", "haar-federwild-class-chart");
    stage.style.width = "100%";
    stage.style.minWidth = `${Math.max(320, rows.length * 76)}px`;
    const canvas = document.createElement("canvas"); stage.appendChild(canvas); scroll.appendChild(stage); card.appendChild(scroll);
    charts.push(new Chart(canvas, { type: "bar", data: {
      labels: rows.map((row) => row.wildklasse), datasets: [{ label: "Abschüsse",
        data: rows.map((row) => row.anzahl), backgroundColor: rows.map((row) =>
          WildklasseColors.get(row.wildgruppe, row.wildklasse)) }],
    }, plugins: [wertLabels], options: DashboardChartOptions.withTooltip({ responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 28 } }, plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } },
        y: { beginAtZero: true, grace: "15%", ticks: { precision: 0 }, title: { display: true, text: "Anzahl Abschüsse" } } } }) }));
    container.appendChild(card);
  }

  function jaegerChart(container, rows) {
    if (!rows.length) return leereKarte(container, "Haar- und Federwild Jäger");
    const card = element("section", "dashboard-card haar-federwild-dashboard-card");
    card.appendChild(element("h2", "", "Haar- und Federwild Jäger"));
    const stage = element("div", "haar-federwild-hunter-chart");
    stage.style.minHeight = `${Math.min(800, Math.max(320, rows.length * 38 + 100))}px`;
    const canvas = document.createElement("canvas"); stage.appendChild(canvas); card.appendChild(stage);
    charts.push(new Chart(canvas, { type: "bar", data: { labels: rows.map((row) => row.jaeger),
      datasets: [{ label: "Abschüsse", data: rows.map((row) => row.anzahl), backgroundColor: "#596f3c" }] },
      plugins: [jaegerLabels], options: DashboardChartOptions.withTooltip({ indexAxis: "y", responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 40 } }, plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grace: "15%", ticks: { precision: 0 }, title: { display: true, text: "Anzahl Abschüsse" } },
          y: { grid: { display: false } } } }) }));
    container.appendChild(card);
  }

  function rendern() {
    chartsLoeschen(); const content = el("hfDashboardContent"); content.innerHTML = "";
    jahresfilter(content); const jahre = ausgewaehlteJahre();
    klassenChart(content, klassenAggregieren(daten.klassen.filter((row) => jahre.has(Number(row.jahr)))));
    jaegerChart(content, jaegerAggregieren(daten.jaeger.filter((row) => jahre.has(Number(row.jahr)))));
  }

  async function init() {
    try {
      daten = await HaarFederwildDashboardService.laden();
      if (!daten.planperiode) throw new Error("Für das Dashboard ist eine aktive Planperiode erforderlich.");
      el("hfDashboardPeriode").textContent = `Aktive Planperiode: ${daten.planperiode.startjahr} / ${daten.planperiode.endjahr}`;
      jahrFilter = "beide"; rendern();
    } catch (error) {
      console.error("Haar- und Federwild-Dashboard:", error);
      el("hfDashboardFehler").hidden = false; el("hfDashboardFehlerText").textContent = error.message;
    }
  }

  return { init };
})();
