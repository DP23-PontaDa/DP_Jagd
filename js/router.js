/* ==========================================
   DP_Jagd V2
   router.js
========================================== */

const Router = {
  currentPage: null,
  pendingPanel: null,

  routes: {
    login: "pages/login.html",
    dashboard: "pages/dashboard.html",
    personen: "pages/personen.html",
    abschuss: "pages/abschuss.html",
    abschussplan: "pages/abschussplan.html",
    stammdaten: "pages/stammdaten.html",
  },

  async open(page) {
    const requestedPage = this.routes[page] ? page : "login";
    const authenticated = Auth.isAuthenticated();

    if (requestedPage === "login" && authenticated) {
      return this.open("dashboard");
    }

    if (requestedPage !== "login" && !authenticated) {
      return this.open("login");
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

      this.initializePage(requestedPage);
      if (requestedPage === "abschussplan" && this.pendingPanel) {
        if (
          window.Abschussplan &&
          typeof window.Abschussplan.activateTab === "function"
        ) {
          window.Abschussplan.activateTab(this.pendingPanel);
        }
        this.pendingPanel = null;
      }
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

  initializePage(page) {
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
      window.Abschussplan.init();
    }

    if (
      page === "stammdaten" &&
      window.Stammdaten &&
      typeof window.Stammdaten.init === "function"
    ) {
      window.Stammdaten.init();
    }
  },

  updateMenu(page) {
    const sidebarButtons = document.querySelectorAll("#sidebar [data-page]");
    sidebarButtons.forEach(function (button) {
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
      pageButton.dataset.page === "abschussplan" &&
      pageButton.dataset.panel
    ) {
      Router.pendingPanel = pageButton.dataset.panel;
    }
    Router.open(pageButton.dataset.page);
    return;
  }

  if (event.target.closest("#logoutButton")) {
    Auth.logout();
  }
});
