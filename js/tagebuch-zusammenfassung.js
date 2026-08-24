window.TagebuchZusammenfassung = (() => {
  const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const CHART_FARBE = "#365f77";
  let daten = null;
  let charts = [];
  let karte = null;
  let ortModus = "alle";
  let kartenModus = "heatmap";

  const el = (id) => document.getElementById(id);

  const wertLabels = {
    id: "tagebuchSummaryValueLabels",
    afterDatasetsDraw(chart) {
      const horizontal = chart.options.indexAxis === "y";
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = "#263f50";
      ctx.font = "600 11px sans-serif";
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        chart.getDatasetMeta(datasetIndex).data.forEach((bar, index) => {
          const wert = Number(dataset.data[index] || 0);
          ctx.textAlign = horizontal ? "left" : "center";
          ctx.textBaseline = horizontal ? "middle" : "bottom";
          ctx.fillText(String(wert), horizontal ? bar.x + 6 : bar.x, horizontal ? bar.y : bar.y - 6);
        });
      });
      ctx.restore();
    },
  };

  function chartLoeschen() {
    charts.forEach((chart) => chart.destroy());
    charts = [];
  }

  function chartErzeugen(canvas, labels, values, optionen = {}) {
    const horizontal = optionen.horizontal === true;
    const chart = new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: optionen.farben || CHART_FARBE, borderRadius: 4 }] },
      plugins: [wertLabels],
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x",
        layout: { padding: horizontal ? { right: 35 } : { top: 22 } },
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 }, grid: { display: horizontal } },
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { display: !horizontal } },
        },
      },
    });
    charts.push(chart);
  }

  function kennzahlenRendern() {
    const werte = [
      ["Jagdtage", daten.kennzahlen.jagdtage], ["Ansitze", daten.kennzahlen.ansitze],
      ["Kamera", daten.kennzahlen.kamera], ["Revierarbeit", daten.kennzahlen.revierarbeit],
      ["Abschüsse", daten.kennzahlen.abschuesse], ["Verschiedene Orte", daten.kennzahlen.orte],
    ];
    el("tzKennzahlen").replaceChildren(...werte.map(([name, wert]) => {
      const card = document.createElement("div");
      card.className = "summary-kpi";
      const label = document.createElement("span"); label.textContent = name;
      const strong = document.createElement("strong"); strong.textContent = String(wert);
      card.append(label, strong);
      return card;
    }));
  }

  function orteChartRendern() {
    const orte = daten.orte.map((ort) => ({ ...ort, wert: ortModus === "ansitze" ? ort.ansitze : ort.anzahl }))
      .filter((ort) => ort.wert > 0)
      .sort((a, b) => b.wert - a.wert || a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
    const alt = Chart.getChart(el("tzOrteChart"));
    if (alt) { alt.destroy(); charts = charts.filter((chart) => chart !== alt); }
    chartErzeugen(el("tzOrteChart"), orte.map((ort) => ort.name), orte.map((ort) => ort.wert), { horizontal: true });
  }

  function karteRendern() {
    if (karte) { karte.remove(); karte = null; }
    const mitPosition = daten.orte.filter(({ ort }) => Number.isFinite(Number(ort.latitude)) && Number.isFinite(Number(ort.longitude)));
    el("tzKarteLeer").hidden = mitPosition.length > 0;
    const start = mitPosition.length ? { lat: Number(mitPosition[0].ort.latitude), lng: Number(mitPosition[0].ort.longitude), zoom: 14 }
      : { lat: 47.3, lng: 13.7, zoom: 8 };
    karte = OrteKarte.karteAnlegen(el("tzKarte"), start);
    const grenzen = [];
    const markerLayer = L.layerGroup();
    mitPosition.forEach((wert) => {
      const position = [Number(wert.ort.latitude), Number(wert.ort.longitude)];
      grenzen.push(position);
      const popup = document.createElement("div");
      const titel = document.createElement("strong"); titel.textContent = wert.name;
      const details = document.createElement("div");
      details.textContent = `${wert.anzahl} Tagebucheinträge · ${wert.ansitze} Ansitze · ${wert.kamera} Kamera-Einträge · ${wert.abschuesse} Abschüsse`;
      popup.append(titel, document.createElement("br"), details);
      L.marker(position).bindPopup(popup).addTo(markerLayer);
    });
    let heatLayer;
    if (typeof L.heatLayer === "function") {
      const maximum = Math.max(1, ...mitPosition.map((wert) => wert.anzahl));
      heatLayer = L.heatLayer(mitPosition.map((wert) => [
        Number(wert.ort.latitude), Number(wert.ort.longitude), wert.anzahl,
      ]), { radius: 30, blur: 22, maxZoom: 17, max: maximum, minOpacity: 0.3 });
    } else {
      const maximum = Math.max(1, ...mitPosition.map((wert) => wert.anzahl));
      heatLayer = L.layerGroup(mitPosition.map((wert) => L.circleMarker(
        [Number(wert.ort.latitude), Number(wert.ort.longitude)], {
          radius: 10 + 20 * (wert.anzahl / maximum), stroke: false,
          fillColor: "#d73027", fillOpacity: 0.25 + 0.55 * (wert.anzahl / maximum),
        },
      )));
    }
    (kartenModus === "orte" ? markerLayer : heatLayer).addTo(karte);
    el("tzHeatmapLegende").hidden = kartenModus !== "heatmap";
    if (grenzen.length > 1) karte.fitBounds(grenzen, { padding: [30, 30], maxZoom: 16 });
    else if (grenzen.length === 1) karte.setView(grenzen[0], 16);
    setTimeout(() => karte?.invalidateSize(), 100);
  }

  function listenRendern() {
    el("tzHashtags").replaceChildren(...(daten.hashtags.length ? daten.hashtags : [{ name: "Keine Hashtags", anzahl: 0 }]).map((tag) => {
      const li = document.createElement("li");
      li.append(`#${tag.name}`);
      const count = document.createElement("span"); count.textContent = String(tag.anzahl);
      li.appendChild(count); return li;
    }));
    const abschussWerte = [{ name: "Gesamt", anzahl: daten.abschuesse.gesamt }, ...daten.abschuesse.gruppen,
      { name: "Haarwild / Federwild", anzahl: daten.abschuesse.haarFeder }];
    el("tzAbschuesse").replaceChildren(...abschussWerte.map((wert) => {
      const div = document.createElement("div"); div.append(wert.name);
      const count = document.createElement("span"); count.textContent = String(wert.anzahl);
      div.appendChild(count); return div;
    }));
  }

  function rendern() {
    chartLoeschen();
    kennzahlenRendern();
    chartErzeugen(el("tzAnsitzeChart"), MONATE, daten.ansitzeMonat);
    orteChartRendern();
    chartErzeugen(el("tzArtenChart"), daten.aktivitaeten.map((art) => art.name), daten.aktivitaeten.map((art) => art.anzahl));
    listenRendern();
    karteRendern();
  }

  async function laden() {
    el("tzFehler").hidden = true;
    el("tzInhalt").setAttribute("aria-busy", "true");
    try {
      daten = await TagebuchZusammenfassungService.laden(el("tzZeitraum").value);
      rendern();
    } catch (error) {
      console.error("Tagebuch-Zusammenfassung:", error);
      el("tzFehler").textContent = error.message;
      el("tzFehler").hidden = false;
    } finally {
      el("tzInhalt").removeAttribute("aria-busy");
    }
  }

  function init() {
    ortModus = "alle";
    kartenModus = "heatmap";
    el("tzKartenModus").value = kartenModus;
    el("tzZeitraum").addEventListener("change", laden);
    el("tzKartenModus").addEventListener("change", (event) => {
      kartenModus = event.target.value;
      if (daten) karteRendern();
    });
    document.querySelectorAll("[data-ortmodus]").forEach((button) => button.addEventListener("click", () => {
      ortModus = button.dataset.ortmodus;
      document.querySelectorAll("[data-ortmodus]").forEach((item) => item.classList.toggle("active", item === button));
      if (daten) orteChartRendern();
    }));
    laden();
  }

  return { init };
})();
