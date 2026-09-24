/* Wiederverwendbares, suchbares Dropdown ohne Drittanbieter-Bibliothek. */
window.SearchDropdown = class SearchDropdown {
  constructor(container, options = {}) {
    this.container =
      typeof container === "string" ? document.querySelector(container) : container;
    this.options = [];
    this.filteredOptions = [];
    this.value = "";
    this.disabled = Boolean(options.disabled);
    this.placeholder = options.placeholder || "Auswählen oder suchen";
    this.minChars = Math.max(0, Number(options.minChars) || 0);
    this.maxResults = Math.max(0, Number(options.maxResults) || 0);
    this.prioritizeMatches = Boolean(options.prioritizeMatches);
    this.onChange =
      typeof options.onChange === "function" ? options.onChange : () => {};

    if (!this.container) {
      throw new Error("Container für Such-Dropdown wurde nicht gefunden.");
    }

    this.container.searchDropdown = this;
    this.render();
    this.bind();
    this.setOptions(options.options || []);
    this.setDisabled(this.disabled);
  }

  render() {
    this.container.classList.add("search-dropdown");
    this.container.innerHTML = "";

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "form-control search-dropdown-input";
    this.input.placeholder = this.placeholder;
    this.input.autocomplete = "off";
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-expanded", "false");

    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.className = "search-dropdown-toggle";
    this.toggle.tabIndex = -1;
    this.toggle.setAttribute("aria-label", "Auswahlliste öffnen");
    this.toggle.textContent = "▾";

    this.list = document.createElement("ul");
    this.list.className = "search-dropdown-list";
    this.list.hidden = true;
    this.list.setAttribute("role", "listbox");

    this.container.append(this.input, this.toggle, this.list);
  }

  bind() {
    this.input.addEventListener("focus", () => this.open());
    this.input.addEventListener("input", () => {
      if (this.value) {
        this.value = "";
        this.onChange(null);
      }
      this.filter(this.input.value);
      this.open();
    });
    this.input.addEventListener("keydown", (event) => this.onKeydown(event));
    this.input.addEventListener("blur", () => {
      window.setTimeout(() => {
        this.close();
        const selected = this.options.find(
          (option) => String(option.value) === String(this.value),
        );
        this.input.value = selected ? selected.label : "";
      }, 120);
    });
    this.toggle.addEventListener("mousedown", (event) => event.preventDefault());
    this.toggle.addEventListener("click", () => {
      if (this.list.hidden) {
        this.open();
        this.input.focus();
      } else {
        this.close();
        this.input.blur();
      }
    });
    this.list.addEventListener("mousedown", (event) => event.preventDefault());
    this.list.addEventListener("click", (event) => {
      const item = event.target.closest("[data-value]");
      if (item) this.select(item.dataset.value);
    });
  }

  setOptions(options) {
    this.options = options.map((option) => ({
      value: String(option.value ?? option.id ?? ""),
      label: String(option.label ?? option.bezeichnung ?? ""),
      group: String(option.group || ""),
      data: option.data ?? option,
    }));
    this.filter("");
    if (
      this.value &&
      !this.options.some((option) => option.value === String(this.value))
    ) {
      this.clear(false);
    } else {
      this.setValue(this.value, false);
    }
  }

  filter(term) {
    const needle = String(term || "").trim().toLocaleLowerCase("de");
    if (needle.length < this.minChars) {
      this.filteredOptions = [];
      this.renderOptions(needle);
      return;
    }
    this.filteredOptions = this.options.filter((option) =>
      option.label.toLocaleLowerCase("de").includes(needle),
    );
    if (this.prioritizeMatches && needle) {
      const score = (option) => {
        const label = option.label.toLocaleLowerCase("de");
        if (label === needle) return 0;
        if (label.startsWith(needle)) return 1;
        if (label.split(/\s+/).some((teil) => teil.startsWith(needle))) return 2;
        return 3;
      };
      this.filteredOptions.sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label, "de"));
    }
    if (this.maxResults) this.filteredOptions = this.filteredOptions.slice(0, this.maxResults);
    this.renderOptions(needle);
  }

  renderOptions(needle = String(this.input?.value || "").trim()) {
    this.list.innerHTML = "";
    if (!this.filteredOptions.length) {
      const empty = document.createElement("li");
      empty.className = "search-dropdown-empty";
      empty.textContent = needle.length < this.minChars
        ? `Mindestens ${this.minChars} Zeichen eingeben`
        : "Keine passenden Einträge";
      this.list.appendChild(empty);
      return;
    }

    let letzteGruppe = null;
    this.filteredOptions.forEach((option) => {
      if (option.group && option.group !== letzteGruppe) {
        const gruppe = document.createElement("li");
        gruppe.className = "search-dropdown-group";
        gruppe.textContent = option.group;
        gruppe.setAttribute("role", "presentation");
        this.list.appendChild(gruppe);
        letzteGruppe = option.group;
      }
      const item = document.createElement("li");
      item.className = "search-dropdown-option";
      item.dataset.value = option.value;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === this.value));
      item.textContent = option.label;
      this.list.appendChild(item);
    });
  }

  open() {
    if (this.disabled) return;
    this.filter(this.input.value === this.getLabel() ? "" : this.input.value);
    this.list.hidden = false;
    this.container.classList.add("is-open");
    this.input.setAttribute("aria-expanded", "true");
  }

  close() {
    this.list.hidden = true;
    this.container.classList.remove("is-open");
    this.input.setAttribute("aria-expanded", "false");
  }

  onKeydown(event) {
    if (event.key === "Escape") {
      this.close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (this.list.hidden) this.open();
      const active = this.list.querySelector(".active");
      let next = active ? active.nextElementSibling : this.list.firstElementChild;
      while (next && !next.dataset.value) next = next.nextElementSibling;
      if (active) active.classList.remove("active");
      if (next && next.dataset.value) next.classList.add("active");
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const active = this.list.querySelector(".active");
      let previous = active && active.previousElementSibling;
      while (previous && !previous.dataset.value) previous = previous.previousElementSibling;
      if (active) active.classList.remove("active");
      if (previous && previous.dataset.value) previous.classList.add("active");
      return;
    }
    if (event.key === "Enter") {
      const active = this.list.querySelector(".active") ||
        (this.filteredOptions.length === 1 ? this.list.querySelector("[data-value]") : null);
      if (active && active.dataset.value) {
        event.preventDefault();
        this.select(active.dataset.value);
      }
    }
  }

  select(value, notify = true) {
    const selected = this.options.find(
      (option) => option.value === String(value),
    );
    if (!selected) return;
    this.value = selected.value;
    this.input.value = selected.label;
    this.close();
    this.renderOptions();
    if (notify) this.onChange(selected);
  }

  setValue(value, notify = false) {
    if (value === null || value === undefined || value === "") {
      this.clear(notify);
      return;
    }
    this.select(String(value), notify);
  }

  getValue() {
    return this.value || null;
  }

  getSelected() {
    return (
      this.options.find((option) => option.value === String(this.value)) || null
    );
  }

  getLabel() {
    const selected = this.getSelected();
    return selected ? selected.label : "";
  }

  clear(notify = true) {
    this.value = "";
    this.input.value = "";
    this.filter("");
    if (notify) this.onChange(null);
  }

  setDisabled(disabled) {
    this.disabled = Boolean(disabled);
    this.input.disabled = this.disabled;
    this.toggle.disabled = this.disabled;
    this.container.classList.toggle("is-disabled", this.disabled);
    if (this.disabled) this.close();
  }
};
