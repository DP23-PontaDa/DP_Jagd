const BerechtigungService = (() => {
  const db = window.db || window.supabase;
  const rechte = new Map();
  const seitenModule = {
    dashboard: "dashboard", personen: "personen", abschuss: "abschuss",
    "haar-federwild": "haar-federwild", rechnungen: "rechnungen",
    nachsuchen: "nachsuchen", fehlschuesse: "fehlschuesse",
    probeschuesse: "probeschuesse", abschussplan: "abschussplan",
    wildgruppen: "wildgruppen", orte: "wildgruppen", stammdaten: "wildklassen",
    "tagebuch-dp": "tagebuch-dp", tagebucharten: "tagebucharten",
    "st-peter-mitterberg": "st-peter-mitterberg", "journal-kategorien": "journal-kategorien",
    planpositionen: "planpositionen", wildhaendler: "wildhaendler",
    rechnungsvorlage: "rechnungsvorlage", "import-export": "import-export",
    benutzerverwaltung: "benutzerverwaltung",
  };
  let observer = null;

  const dashboardBereiche = {
    "dashboard-abschuss": "dashboard-abschuss",
    "dashboard-jaeger": "dashboard-jaeger",
    "dashboard-wildhaendler": "dashboard-wildhaendler",
  };
  const abschussplanBereiche = {
    "ap-overview": "abschussplan-uebersicht",
    "ap-rotwild": "abschussplan-rotwild",
    "ap-rehwild": "abschussplan-rehwild",
    "ap-gamswild": "abschussplan-gamswild",
    "ap-jahre": "abschussplan-jahre",
  };

  function modulFuerSeite(seite) { return seitenModule[seite] || seite; }

  async function laden() {
    rechte.clear();
    const { data, error } = await db.rpc("app_meine_rechte");
    if (error) throw error;
    (data || []).forEach((eintrag) => rechte.set(eintrag.modul_code, {
      Lesen: eintrag.lesen === true,
      Bearbeiten: eintrag.bearbeiten === true,
      Löschen: eintrag.loeschen === true,
    }));
    sidebarAnwenden();
  }

  function leeren() {
    rechte.clear();
    if (observer) observer.disconnect();
    observer = null;
  }

  function darf(modulOderSeite, recht) {
    return rechte.get(modulFuerSeite(modulOderSeite))?.[recht] === true;
  }

  function schluesselFuerBereich(seite, bereich) {
    if (seite === "dashboard") return dashboardBereiche[bereich] || "dashboard-abschuss";
    if (seite === "abschussplan") return abschussplanBereiche[bereich] || "abschussplan-uebersicht";
    return modulFuerSeite(seite);
  }

  function darfBereich(seite, bereich, recht = "Lesen") {
    return darf(schluesselFuerBereich(seite, bereich), recht);
  }

  function ersterBereich(seite) {
    const bereiche = seite === "dashboard" ? Object.keys(dashboardBereiche)
      : seite === "abschussplan" ? Object.keys(abschussplanBereiche) : [];
    return bereiche.find((bereich) => darfBereich(seite, bereich, "Lesen")) || null;
  }

  function darfSeite(seite, recht = "Lesen") {
    if (seite === "dashboard" || seite === "abschussplan") {
      return Boolean(ersterBereich(seite)) && (recht === "Lesen" ||
        Object.keys(seite === "dashboard" ? dashboardBereiche : abschussplanBereiche)
          .some((bereich) => darfBereich(seite, bereich, recht)));
    }
    return darf(seite, recht);
  }

  function ersteLesbareSeite() {
    return Object.keys(seitenModule).find((seite) => darfSeite(seite, "Lesen")) || null;
  }

  function sidebarAnwenden() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    sidebar.querySelectorAll("[data-page]").forEach((button) => {
      const schluessel = button.dataset.rechtCode;
      button.hidden = schluessel
        ? !darf(schluessel, "Lesen")
        : !darfSeite(button.dataset.page, "Lesen");
    });
    sidebar.querySelectorAll(".sidebar-group").forEach((gruppe) => {
      const hatEintrag = [...gruppe.querySelectorAll(".sidebar-submenu [data-page]")]
        .some((button) => !button.hidden);
      gruppe.hidden = !hatEintrag;
    });
  }

  function aktionsrechteAnwenden(seite, container) {
    if (!container) return;
    const bereich = seite === "dashboard" ? Router?.currentDashboardSection
      : seite === "abschussplan" ? Router?.currentPanel : null;
    const modul = schluesselFuerBereich(seite, bereich);
    const bearbeiten = darf(modul, "Bearbeiten");
    const loeschen = darf(modul, "Löschen");
    const bearbeitenSelektoren = [
      ".edit-btn", "[data-aktion='bearbeiten']", "[data-action='edit']",
      "button[id$='Neu']", "button[id$='Speichern']", "[data-aktion='rechnung']",
    ].join(",");
    const loeschenSelektoren = [
      ".delete-btn", "[data-aktion='loeschen']", "[data-action='delete']",
    ].join(",");
    container.querySelectorAll(bearbeitenSelektoren).forEach((element) => {
      element.hidden = !bearbeiten;
    });
    container.querySelectorAll(loeschenSelektoren).forEach((element) => {
      element.hidden = !loeschen;
    });
    container.querySelectorAll("button").forEach((button) => {
      const beschreibung = [button.textContent, button.title, button.getAttribute("aria-label")]
        .filter(Boolean).join(" ").toLocaleLowerCase("de");
      if (!bearbeiten && /(bearbeiten|speichern|\bneu\b|\bneue\b|\bneuer\b|anlegen|erstellen|übernehmen|aktualisieren|aktivieren|zuordnung|\bimport|hochladen)/.test(beschreibung)) {
        button.hidden = true;
      }
      if (!loeschen && /(löschen|entfernen)/.test(beschreibung)) button.hidden = true;
    });
  }

  function seiteBeobachten(seite, container) {
    if (observer) observer.disconnect();
    aktionsrechteAnwenden(seite, container);
    observer = new MutationObserver(() => aktionsrechteAnwenden(seite, container));
    observer.observe(container, { childList: true, subtree: true });
  }

  return {
    laden, leeren, darf, darfSeite, darfBereich, ersterBereich,
    schluesselFuerBereich, modulFuerSeite, ersteLesbareSeite,
    sidebarAnwenden, aktionsrechteAnwenden, seiteBeobachten,
  };
})();
