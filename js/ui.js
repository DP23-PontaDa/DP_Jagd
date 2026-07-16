(function (window) {
  "use strict";

  var Config = window.DPJagdConfig;
  var Auth = window.DPJagdAuth;

  function appEl() {
    return document.getElementById("app");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function loadPartial(path) {
    var response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Seite konnte nicht geladen werden: " + path);
    }
    return await response.text();
  }

  function setAppHtml(html) {
    appEl().innerHTML = html;
  }

  function setTitle(title) {
    document.title = title ? title + " | " + Config.appName : Config.appName;
  }

  function routeName() {
    var hash = window.location.hash || "#/login";
    return hash.replace(/^#\/?/, "").toLowerCase();
  }

  function go(route) {
    window.location.hash = "#/" + route;
  }

  function bindLoginPage() {
    var form = document.getElementById("loginForm");
    if (!form) return;

    var apiUrlInput = document.getElementById("apiUrl");
    var apiUrl = Config.getApiUrl();
    if (apiUrlInput && apiUrl) {
      apiUrlInput.value = apiUrl;
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      var status = document.getElementById("loginStatus");
      var submit = form.querySelector('button[type="submit"]');
      var apiUrlValue = document.getElementById("apiUrl").value.trim();
      var username = document.getElementById("username").value.trim();
      var password = document.getElementById("password").value;

      status.textContent = "";
      submit.disabled = true;
      submit.textContent = "Anmeldung läuft…";

      try {
        await Auth.login(apiUrlValue, username, password);
        go("dashboard");
      } catch (err) {
        status.textContent = err.message || "Anmeldung fehlgeschlagen.";
      } finally {
        submit.disabled = false;
        submit.textContent = "Anmelden";
      }
    });
  }

  function buildSidebar(session, activeRoute) {
    var user = session && session.user ? session.user : {};
    var userName = escapeHtml(user.name || user.username || "Benutzer");
    var userRole = escapeHtml(user.role || "ohne Rolle");
    var expiresAt = session && session.expiresAt ? new Date(session.expiresAt).toLocaleString("de-DE") : "unbekannt";

    function navLink(route, icon, label) {
      var active = activeRoute === route ? " active" : "";
      return (
        '<a class="nav-link' + active + '" href="#/' + route + '">' +
          '<span class="nav-icon">' + icon + "</span>" +
          "<span>" + escapeHtml(label) + "</span>" +
        "</a>"
      );
    }

    return (
      '<aside class="sidebar">' +
        '<div class="brand">' +
          '<div class="brand-mark">DJ</div>' +
          '<div>' +
            '<div class="brand-title">DP_Jagd V2</div>' +
            '<div class="brand-subtitle">Produktive Webanwendung</div>' +
          "</div>" +
        "</div>" +

        '<nav class="nav" aria-label="Hauptnavigation">' +
          '<div class="nav-title">Navigation</div>' +
          navLink("dashboard", "⌂", "Dashboard") +
          navLink("login", "↶", "Login") +
        "</nav>" +

        '<div class="user-box">' +
          '<div class="user-name">' + userName + "</div>" +
          '<div class="user-meta">Rolle: ' + userRole + "</div>" +
          '<div class="user-meta">Session bis: ' + escapeHtml(expiresAt) + "</div>" +
          '<button type="button" class="btn btn-danger" id="logoutBtn">Abmelden</button>' +
        "</div>" +
      "</aside>"
    );
  }

  async function renderDashboardPage() {
    var session = Auth.getSession();
    var user = session && session.user ? session.user : {};
    var html = await loadPartial("pages/dashboard.html");
    var sidebar = buildSidebar(session, "dashboard");
    setAppHtml(html.replace("{{SIDEBAR}}", sidebar));

    var userNameEl = document.getElementById("dashUserName");
    if (userNameEl) userNameEl.textContent = user.name || user.username || "Benutzer";

    var roleEl = document.getElementById("dashRole");
    if (roleEl) roleEl.textContent = user.role || "ohne Rolle";

    var tokenEl = document.getElementById("dashToken");
    if (tokenEl) tokenEl.textContent = session && session.token ? session.token.slice(0, 12) + "…" : "-";

    var expiresEl = document.getElementById("dashExpires");
    if (expiresEl) expiresEl.textContent = session && session.expiresAt ? new Date(session.expiresAt).toLocaleString("de-DE") : "-";

    var apiEl = document.getElementById("dashApi");
    if (apiEl) apiEl.textContent = Config.getApiUrl() || "-";

    var logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        logoutBtn.disabled = true;
        await Auth.logout();
        go("login");
      });
    }

    setTitle("Dashboard");
  }

  async function renderLoginPage() {
    var html = await loadPartial("pages/login.html");
    setAppHtml(html);

    var apiUrlInput = document.getElementById("apiUrl");
    if (apiUrlInput && Config.getApiUrl()) {
      apiUrlInput.value = Config.getApiUrl();
    }

    bindLoginPage();
    setTitle("Login");
  }

  async function renderCurrent() {
    var route = routeName();

    if (route !== "login" && !Auth.hasSession()) {
      go("login");
      return;
    }

    if (route === "login") {
      if (Auth.hasSession()) {
        go("dashboard");
        return;
      }
      await renderLoginPage();
      return;
    }

    await renderDashboardPage();
  }

  window.DPJagdUI = {
    renderCurrent: renderCurrent,
    renderLoginPage: renderLoginPage,
    renderDashboardPage: renderDashboardPage,
    escapeHtml: escapeHtml,
    setTitle: setTitle,
    go: go
  };
})(window);
