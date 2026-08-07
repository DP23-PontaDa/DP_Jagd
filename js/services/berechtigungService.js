const BerechtigungService = (() => {
  const db = window.db || window.supabase;
  const rechte = new Map();
  const seitenModule = {
    dashboard: "dashboard", personen: "personen", abschuss: "abschuss",
    "haar-federwild": "haar-federwild", rechnungen: "rechnungen",
    nachsuchen: "nachsuchen", fehlschuesse: "fehlschuesse",
    probeschuesse: "probeschuesse", abschussplan: "abschussplan",
    wildgruppen: "wildgruppen", stammdaten: "wildklassen",
    planpositionen: "planpositionen", wildhaendler: "wildhaendler",
    rechnungsvorlage: "rechnungsvorlage", "import-export": "import-export",
    benutzerverwaltung: "benutzerverwaltung",
  };
  let observer = null;

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

  function ersteLesbareSeite() {
    return Object.keys(seitenModule).find((seite) => darf(seite, "Lesen")) || null;
  }

  function sidebarAnwenden() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    sidebar.querySelectorAll("[data-page]").forEach((button) => {
      button.hidden = !darf(button.dataset.page, "Lesen");
    });
    sidebar.querySelectorAll(".sidebar-group").forEach((gruppe) => {
      const hatEintrag = [...gruppe.querySelectorAll(".sidebar-submenu [data-page]")]
        .some((button) => !button.hidden);
      gruppe.hidden = !hatEintrag;
    });
  }

  function aktionsrechteAnwenden(seite, container) {
    if (!container) return;
    const modul = modulFuerSeite(seite);
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
    laden, leeren, darf, modulFuerSeite, ersteLesbareSeite,
    sidebarAnwenden, aktionsrechteAnwenden, seiteBeobachten,
  };
})();
