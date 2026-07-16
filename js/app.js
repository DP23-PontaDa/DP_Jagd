// js/app.js
(function (window) {
  "use strict";

  async function boot() {
    try {
      await window.DPJagdAuth.bootstrap();
    } catch (err) {
      window.DPJagdAuth.clearSession();
    }

    if (!window.location.hash) {
      window.location.hash = "#/login";
    }

    window.DPJagdRouter.start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
