window.DetailMode = (() => {
  function controls(modal) {
    return Array.from(modal.querySelectorAll("input, select, textarea"));
  }

  function snapshot(modal) {
    modal._detailSnapshot = controls(modal).map((control) => ({
      control,
      value: control.value,
      checked: control.checked,
    }));

    modal.querySelectorAll(".search-dropdown").forEach((container) => {
      const dropdown = container.searchDropdown;
      if (!dropdown) return;
      modal._detailSnapshot.push({
        dropdown,
        value: dropdown.getValue(),
      });
    });
  }

  function restore(modal) {
    (modal._detailSnapshot || []).forEach((entry) => {
      if (entry.dropdown) {
        entry.dropdown.setValue(entry.value, false);
        return;
      }
      entry.control.value = entry.value;
      if (entry.control.type === "checkbox") {
        entry.control.checked = entry.checked;
      }
    });
  }

  function controlValue(group) {
    const dropdown = group.querySelector(".search-dropdown");
    if (dropdown?.searchDropdown) {
      return dropdown.searchDropdown.getLabel();
    }

    const control = group.querySelector("input, select, textarea");
    if (!control) return "";
    if (control.type === "checkbox") return control.checked ? "Ja" : "Nein";
    if (control.tagName === "SELECT") {
      return control.selectedOptions[0]?.textContent || "";
    }
    if (control.type === "date" && control.value) {
      const [jahr, monat, tag] = control.value.split("-");
      return `${tag}.${monat}.${jahr}`;
    }

    const raw = control.value || "";
    if (!raw) return "";
    if (group.dataset.readCurrency) {
      return Number(raw).toLocaleString("de-AT", {
        style: "currency",
        currency: group.dataset.readCurrency,
      });
    }
    if (control.type === "number") {
      return (
        Number(raw).toLocaleString("de-AT", {
          maximumFractionDigits: 2,
        }) + (group.dataset.readSuffix || "")
      );
    }
    return raw + (group.dataset.readSuffix || "");
  }

  function sync(modal) {
    modal.querySelectorAll(".form-group").forEach((group) => {
      group.dataset.detailHidden = String(
        group.hidden || group.style.display === "none",
      );
      let value = group.querySelector(":scope > .detail-read-value");
      if (!value) {
        value = document.createElement("div");
        value.className = "detail-read-value";
        group.appendChild(value);
      }
      value.textContent = controlValue(group) || "—";
    });
  }

  function setMode(modal, mode, options = {}) {
    if (!modal) return;
    if (mode === "edit" && options.capture) snapshot(modal);
    if (mode === "read") {
      if (options.capture !== false) snapshot(modal);
      sync(modal);
    }
    modal.classList.toggle("read-mode", mode === "read");
    modal.classList.toggle("edit-mode", mode === "edit");
    modal.dataset.detailMode = mode;
  }

  function cancel(modal) {
    restore(modal);
    setMode(modal, "read", { capture: false });
  }

  return { setMode, cancel, sync };
})();
