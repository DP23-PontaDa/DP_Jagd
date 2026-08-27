/* ==========================================
   DP_Jagd V2
   router.js
========================================== */

const Router = {
  currentPage: null,
  pendingPanel: null,
  pendingDashboardSection: null,
  currentDashboardSection: "dashboard-abschuss",
  currentPanel: "ap-overview",
  pendingRechnungAbschussId: null,

  routes: {
    login: "pages/login.html",
    dashboard: "pages/dashboard.html",
    "dashboard-orte-heatmap": "pages/dashboard-orte-heatmap.html",
    "dashboard-haar-federwild": "pages/dashboard-haar-federwild.html",
    personen: "pages/personen.html",
    abschuss: "pages/abschuss.html",
    "haar-federwild": "pages/abschuss.html",
    rechnungen: "pages/rechnungen.html",
    nachsuchen: "pages/nachsuchen.html",
    fehlschuesse: "pages/nachsuchen.html",
    probeschuesse: "pages/nachsuchen.html",
    "import-export": "pages/import-export.html",
    abschussplan: "pages/abschussplan.html",
    freigaben: "pages/freigaben.html",
    wildgruppen: "pages/wildgruppen.html",
    orte: "pages/orte.html",
    "tagebuch-dp": "pages/tagebuch-dp.html",
    "tagebuch-zusammenfassung": "pages/tagebuch-zusammenfassung.html",
    tagebucharten: "pages/tagebucharten.html",
    "st-peter-mitterberg": "pages/st-peter-mitterberg.html",
    "journal-kategorien": "pages/journal-kategorien.html",
    stammdaten: "pages/stammdaten.html",
    wildhaendler: "pages/wildhaendler.html",
    planpositionen: "pages/planpositionen.html",
    rechnungsvorlage: "pages/rechnungsvorlage.html",
    abschussregeln: "pages/abschussregeln.html",
    "allgemeine-abschussregeln": "pages/allgemeine-abschussregeln.html",
    benutzerverwaltung: "pages/benutzerverwaltung.html",
  },

  async open(page) {
    let requestedPage = this.routes[page] ? page : "login";
    const authenticated = Auth.isAuthenticated();

    if (requestedPage === "login" && authenticated) {
      return this.open("dashboard");
    }

    if (requestedPage !== "login" && !authenticated) {
      return this.open("login");
    }

    if (requestedPage === "dashboard") {
      const gewuenschterBereich = this.pendingDashboardSection || this.currentDashboardSection;
      if (!BerechtigungService.darfBereich("dashboard", gewuenschterBereich, "Lesen")) {
        this.pendingDashboardSection = BerechtigungService.ersterBereich("dashboard");
        this.currentDashboardSection = this.pendingDashboardSection;
      }
    }
    if (requestedPage === "abschussplan") {
      const gewuenschtesPanel = this.pendingPanel || this.currentPanel;
      if (!BerechtigungService.darfBereich("abschussplan", gewuenschtesPanel, "Lesen")) {
        this.pendingPanel = BerechtigungService.ersterBereich("abschussplan");
      }
    }

    if (requestedPage !== "login" && !BerechtigungService.darfSeite(requestedPage, "Lesen")) {
      const ersteSeite = BerechtigungService.ersteLesbareSeite();
      if (ersteSeite && ersteSeite !== requestedPage) return this.open(ersteSeite);
      return Auth.logout();
    }

    const content = document.getElementById("app-content");

    if (!content) {
      return;
    }

    try {
      const response = await fetch(this.routes[requestedPage], {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Die Seite konnte nicht geladen werden.");
      }

      content.innerHTML = await response.text();
      this.currentPage = requestedPage;
      this.updateMenu(requestedPage);
      this.updateLayout(requestedPage);

      if (requestedPage === "login") {
        this.bindLoginForm();
      } else {
        Auth.updateHeader();
      }

      const initialPanel =
        requestedPage === "abschussplan"
          ? this.pendingPanel || BerechtigungService.ersterBereich("abschussplan")
          : null;
      if (initialPanel) this.currentPanel = initialPanel;
      this.pendingPanel = null;
      this.initializePage(requestedPage, initialPanel);
      BerechtigungService.seiteBeobachten(requestedPage, content);
    } catch (error) {
      console.error("Seite konnte nicht geladen werden:", error);
      content.textContent =
        "Die Seite konnte nicht geladen werden. Bitte laden Sie die Anwendung erneut.";
    }
  },

  bindLoginForm() {
    const form = document.getElementById("loginForm");

    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        Auth.login();
      });
    }
  },

  initializePage(page, initialPanel = null) {
    if (
      page === "dashboard" &&
      window.Dashboard &&
      typeof window.Dashboard.init === "function"
    ) {
      const section = this.pendingDashboardSection;
      this.pendingDashboardSection = null;
      if (section) this.currentDashboardSection = section;
      window.Dashboard.init(section);
    }

    if (page === "dashboard-haar-federwild" && window.HaarFederwildDashboard &&
        typeof window.HaarFederwildDashboard.init === "function") {
      window.HaarFederwildDashboard.init();
    }

    if (page === "dashboard-orte-heatmap" && window.Dashboard &&
        typeof window.Dashboard.initHeatmapPage === "function") {
      window.Dashboard.initHeatmapPage();
    }

    if (
      page === "personen" &&
      window.Personen &&
      typeof window.Personen.init === "function"
    ) {
      window.Personen.init();
    }

    if (
      page === "abschussplan" &&
      window.Abschussplan &&
      typeof window.Abschussplan.init === "function"
    ) {
      window.Abschussplan.init(initialPanel);
    }

    if (page === "freigaben" && window.Freigaben &&
        typeof window.Freigaben.init === "function") {
      window.Freigaben.init();
    }

    if (
      page === "wildgruppen" &&
      window.Wildgruppen &&
      typeof window.Wildgruppen.init === "function"
    ) {
      window.Wildgruppen.init();
    }

    if (page === "orte" && window.Orte && typeof window.Orte.init === "function") {
      window.Orte.init();
    }

    if (page === "tagebuch-dp" && window.TagebuchDp && typeof window.TagebuchDp.init === "function") {
      window.TagebuchDp.init();
    }

    if (page === "tagebuch-zusammenfassung" && window.TagebuchZusammenfassung &&
        typeof window.TagebuchZusammenfassung.init === "function") {
      window.TagebuchZusammenfassung.init();
    }

    if (page === "tagebucharten" && window.Tagebucharten && typeof window.Tagebucharten.init === "function") {
      window.Tagebucharten.init();
    }

    if (page === "st-peter-mitterberg" && window.StPeterMitterberg && typeof window.StPeterMitterberg.init === "function") {
      window.StPeterMitterberg.init();
    }

    if (page === "journal-kategorien" && window.JournalKategorien && typeof window.JournalKategorien.init === "function") {
      window.JournalKategorien.init();
    }

    if (
      page === "stammdaten" &&
      window.Stammdaten &&
      typeof window.Stammdaten.init === "function"
    ) {
      window.Stammdaten.init();
    }

    if (
      page === "wildhaendler" &&
      window.Wildhaendler &&
      typeof window.Wildhaendler.init === "function"
    ) {
      window.Wildhaendler.init();
    }

    if (
      page === "planpositionen" &&
      window.Planpositionen &&
      typeof window.Planpositionen.init === "function"
    ) {
      window.Planpositionen.init();
    }

    if (page === "abschussregeln" && window.Abschussregeln &&
        typeof window.Abschussregeln.init === "function") {
      window.Abschussregeln.init();
    }

    if (page === "allgemeine-abschussregeln" && window.AllgemeineAbschussregeln &&
        typeof window.AllgemeineAbschussregeln.init === "function") {
      window.AllgemeineAbschussregeln.init();
    }

    if (
      page === "import-export" &&
      window.ImportExport &&
      typeof window.ImportExport.init === "function"
    ) {
      window.ImportExport.init();
    }

    if (
      page === "abschuss" &&
      window.Abschuss &&
      typeof window.Abschuss.init === "function"
    ) {
      window.Abschuss.init();
    }

    if (
      page === "haar-federwild" &&
      window.Abschuss &&
      typeof window.Abschuss.init === "function"
    ) {
      window.Abschuss.init("ausserhalb-plan");
    }

    if (page === "rechnungen" && window.Rechnungen &&
        typeof window.Rechnungen.init === "function") {
      window.Rechnungen.init();
    }

    if (page === "rechnungsvorlage" && window.Rechnungsvorlage &&
        typeof window.Rechnungsvorlage.init === "function") {
      window.Rechnungsvorlage.init();
    }

    if (page === "benutzerverwaltung" && window.Benutzerverwaltung &&
        typeof window.Benutzerverwaltung.init === "function") {
      window.Benutzerverwaltung.init();
    }

    if (
      page === "nachsuchen" &&
      window.Nachsuchen &&
      typeof window.Nachsuchen.init === "function"
    ) {
      window.Nachsuchen.init();
    }

    if (
      (page === "fehlschuesse" || page === "probeschuesse") &&
      window.Nachsuchen && typeof window.Nachsuchen.init === "function"
    ) {
      window.Nachsuchen.init(page);
    }
  },

  updateMenu(page) {
    const sidebarButtons = document.querySelectorAll("#sidebar [data-page]");
    sidebarButtons.forEach(function (button) {
      if (page === "dashboard") {
        if (button.dataset.page !== "dashboard") {
          button.classList.remove("active");
          return;
        }
        button.classList.toggle(
          "active",
          button.dataset.dashboardSection === Router.currentDashboardSection,
        );
        return;
      }

      if (page !== "abschussplan") {
        button.classList.toggle("active", button.dataset.page === page);
        return;
      }

      if (button.dataset.page !== "abschussplan") {
        button.classList.remove("active");
        return;
      }

      if (!button.dataset.panel) {
        button.classList.add("active");
        return;
      }

      button.classList.toggle(
        "active",
        button.dataset.panel === Router.pendingPanel,
      );
    });
  },

  updateLayout(page) {
    const sidebar = document.getElementById("sidebar");
    const header = document.querySelector("header");

    const isLogin = page === "login";
    sidebar.hidden = isLogin;
    header.hidden = isLogin;
  },
};

document.addEventListener("click", function (event) {
  const pageButton = event.target.closest("[data-page]");

  if (pageButton) {
    if (
      pageButton.dataset.page === "dashboard" &&
      pageButton.dataset.dashboardSection
    ) {
      const section = pageButton.dataset.dashboardSection;
      if (!BerechtigungService.darfBereich("dashboard", section, "Lesen")) return;
      if (
        Router.currentPage === "dashboard" &&
        window.Dashboard &&
        typeof window.Dashboard.scrollToSection === "function"
      ) {
        Router.currentDashboardSection = section;
        Router.updateMenu("dashboard");
        window.Dashboard.scrollToSection(section);
        return;
      }
      Router.pendingDashboardSection = section;
      Router.currentDashboardSection = section;
    }
    if (
      pageButton.dataset.page === "abschussplan" &&
      pageButton.dataset.panel
    ) {
      if (!BerechtigungService.darfBereich("abschussplan", pageButton.dataset.panel, "Lesen")) return;
      Router.pendingPanel = pageButton.dataset.panel;
    }
    Router.open(pageButton.dataset.page);
    return;
  }

  if (event.target.closest("#logoutButton")) {
    Auth.logout(event);
  }
});
