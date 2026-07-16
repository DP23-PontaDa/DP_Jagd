// js/router.js
(function (window) {
  "use strict";

  var UI = window.DPJagdUI;
  var Auth = window.DPJagdAuth;

  function normalizeRoute(hash) {
    var route = (hash || "#/login").replace(/^#\/?/, "").trim().toLowerCase();
    return route || "login";
  }

  async function handleRoute() {
    var route = normalizeRoute(window.location.hash);

    if (route !== "login" && !Auth.hasSession()) {
      UI.go("login");
      return;
    }

    await UI.renderCurrent();
  }

  function start() {
    window.addEventListener("hashchange", handleRoute);
    handleRoute();
  }

  window.DPJagdRouter = {
    start: start,
    handleRoute: handleRoute
  };
})(window);
