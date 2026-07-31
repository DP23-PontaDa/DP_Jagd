window.AppFeedback = (() => {
  let confirmResolver = null;

  function ensureUi() {
    if (!document.getElementById("appToastRegion")) {
      const region = document.createElement("div");
      region.id = "appToastRegion";
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "false");
      document.body.appendChild(region);
    }

    if (!document.getElementById("appConfirmModal")) {
      const modal = document.createElement("div");
      modal.id = "appConfirmModal";
      modal.className = "modal app-confirm-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="modal-content app-confirm-content" role="alertdialog" aria-modal="true"
             aria-labelledby="appConfirmTitle" aria-describedby="appConfirmText">
          <div class="modal-header">
            <h2 id="appConfirmTitle">Datensatz löschen?</h2>
          </div>
          <p id="appConfirmText">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <div class="modal-footer">
            <button id="appConfirmCancel" class="btn btn-outline" type="button">Abbrechen</button>
            <button id="appConfirmDelete" class="btn btn-danger" type="button">Löschen</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector("#appConfirmCancel")
        .addEventListener("click", () => resolveConfirm(false));
      modal.querySelector("#appConfirmDelete")
        .addEventListener("click", () => resolveConfirm(true));
      modal.addEventListener("click", (event) => {
        if (event.target === modal) resolveConfirm(false);
      });
    }
  }

  function toast(message, type = "success", duration = 2100) {
    ensureUi();
    const item = document.createElement("div");
    item.className = `app-toast app-toast-${type}`;
    item.setAttribute("role", type === "error" ? "alert" : "status");
    item.textContent = message;
    document.getElementById("appToastRegion").appendChild(item);
    requestAnimationFrame(() => item.classList.add("is-visible"));
    window.setTimeout(() => {
      item.classList.remove("is-visible");
      item.addEventListener("transitionend", () => item.remove(), { once: true });
      window.setTimeout(() => item.remove(), 300);
    }, duration);
  }

  function resolveConfirm(value) {
    const modal = document.getElementById("appConfirmModal");
    if (modal) {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      window.setTimeout(() => { modal.style.display = "none"; }, 220);
    }
    if (confirmResolver) {
      confirmResolver(value);
      confirmResolver = null;
    }
  }

  function confirmDelete(title, text) {
    ensureUi();
    const modal = document.getElementById("appConfirmModal");
    document.getElementById("appConfirmTitle").textContent =
      title || "Datensatz löschen?";
    document.getElementById("appConfirmText").textContent =
      text || "Diese Aktion kann nicht rückgängig gemacht werden.";
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    modal.querySelector("#appConfirmCancel").focus();
    return new Promise((resolve) => { confirmResolver = resolve; });
  }

  function focusRow(selector) {
    requestAnimationFrame(() => {
      const row = document.querySelector(selector);
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      row.classList.remove("row-saved");
      void row.offsetWidth;
      row.classList.add("row-saved");
      window.setTimeout(() => row.classList.remove("row-saved"), 2200);
    });
  }

  return {
    success: (message) => toast(message, "success"),
    error: (message) => toast(message, "error", 3000),
    info: (message) => toast(message, "info"),
    warning: (message) => toast(message, "warning", 2800),
    confirmDelete,
    focusRow,
  };
})();
