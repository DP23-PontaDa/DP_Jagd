window.MobileUI = (() => {
  function enhanceTable(table) {
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
      th.textContent.trim(),
    );
    table.querySelectorAll("tbody tr").forEach((row) => {
      Array.from(row.children).forEach((cell, index) => {
        if (cell.tagName === "TD" && !cell.dataset.label) {
          cell.dataset.label = headers[index] || "";
        }
      });
    });
  }

  function enhance(root = document) {
    root.querySelectorAll?.("table").forEach(enhanceTable);
    root.querySelectorAll?.(".action-bar .btn-primary").forEach((button) => {
      if (/^\s*\+\s*neu/i.test(button.textContent)) {
        button.classList.add("mobile-fab");
        button.setAttribute("aria-label", button.textContent.trim());
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    enhance();
    const content = document.getElementById("app-content");
    if (content) {
      new MutationObserver(() => enhance(content)).observe(content, {
        childList: true,
        subtree: true,
      });
    }

    document.addEventListener("click", (event) => {
      const tab = event.target.closest(".pers-tab-btn");
      if (tab && window.matchMedia("(max-width: 768px)").matches) {
        window.setTimeout(
          () => tab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }),
          0,
        );
      }
    });
  });

  return { enhance };
})();
