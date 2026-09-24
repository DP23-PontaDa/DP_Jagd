window.PersonAutocomplete = class PersonAutocomplete {
  constructor(control, options = {}) {
    this.control = control;
    this.personen = [];
    this.eintraege = [];
    this.disabled = false;
    this.activeIndex = -1;
    this.placeholder = options.placeholder || "Person suchen...";
    control.hidden = true;
    this.wrapper = document.createElement("div");
    this.wrapper.className = "person-autocomplete";
    this.chips = document.createElement("div");
    this.chips.className = "person-autocomplete-chips";
    this.input = document.createElement("input");
    this.input.type = "text"; this.input.className = "person-autocomplete-input";
    this.input.placeholder = this.placeholder; this.input.autocomplete = "off";
    this.input.id = `${control.id}Search`;
    this.input.setAttribute("role", "combobox"); this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-expanded", "false");
    this.hinweis = document.createElement("small"); this.hinweis.className = "person-autocomplete-help";
    this.hinweis.textContent = "Person nicht vorhanden? Unter Personen anlegen. Freie historische Namen bleiben möglich.";
    this.liste = document.createElement("div"); this.liste.className = "person-autocomplete-suggestions";
    this.liste.hidden = true; this.liste.setAttribute("role", "listbox"); document.body.appendChild(this.liste);
    control.parentNode.insertBefore(this.wrapper, control);
    this.wrapper.append(this.chips, this.input, this.hinweis, control);
    control.closest(".form-group")?.querySelector(`label[for="${control.id}"]`)?.setAttribute("for", this.input.id);
    this.bind();
  }

  async laden() { this.personen = await PersonenAutocompleteService.laden(); return this.personen; }
  bind() {
    this.input.addEventListener("input", () => this.vorschlaegeRendern());
    this.input.addEventListener("focus", () => this.vorschlaegeRendern());
    this.input.addEventListener("keydown", (event) => this.taste(event));
    this.input.addEventListener("blur", () => setTimeout(() => this.schliessen(), 160));
    this.liste.addEventListener("mousedown", (event) => event.preventDefault());
    this.liste.addEventListener("click", (event) => { const button = event.target.closest("button[data-id]"); if (button) this.personHinzufuegen(button.dataset.id); });
    this.chips.addEventListener("click", (event) => { const button = event.target.closest("button[data-index]"); if (!button || this.disabled) return; this.eintraege.splice(Number(button.dataset.index), 1); this.renderChips(); this.input.focus(); });
    this.positionHandler = () => { if (!this.liste.hidden) this.positionieren(); };
    window.addEventListener("resize", this.positionHandler, { passive: true });
    window.addEventListener("scroll", this.positionHandler, true);
    window.visualViewport?.addEventListener("resize", this.positionHandler, { passive: true });
  }

  taste(event) {
    const buttons = [...this.liste.querySelectorAll("button[data-id]")];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); if (this.liste.hidden) this.vorschlaegeRendern();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      this.activeIndex = Math.max(0, Math.min(buttons.length - 1, this.activeIndex + delta)); this.aktivMarkieren(); return;
    }
    if (event.key === "Enter" || event.key === "," || event.key === ";") {
      if (!this.input.value.trim()) return;
      event.preventDefault();
      const aktiv = this.liste.querySelector("button.active[data-id]");
      if (aktiv) this.personHinzufuegen(aktiv.dataset.id);
      else {
        const treffer = this.treffer();
        if (event.key === "Enter" && treffer.length === 1) this.personHinzufuegen(treffer[0].id);
        else this.freitextHinzufuegen(this.input.value);
      }
      return;
    }
    if (event.key === "Backspace" && !this.input.value && this.eintraege.length && !this.disabled) { this.eintraege.pop(); this.renderChips(); }
    if (event.key === "Escape") this.schliessen();
  }

  treffer() {
    return PersonenAutocompleteService.suchen(this.personen, this.input.value,
      new Set(this.eintraege.filter((x) => x.id).map((x) => String(x.id))), 10);
  }
  vorschlaegeRendern() {
    if (this.disabled || !this.input.isConnected || this.input.value.trim().length < 2) return this.schliessen();
    const treffer = this.treffer(); this.liste.innerHTML = ""; this.activeIndex = -1;
    treffer.forEach((person, index) => {
      const button = document.createElement("button"); button.type = "button"; button.dataset.id = person.id; button.setAttribute("role", "option");
      const name = PersonenAutocompleteService.name(person); button.innerHTML = `<span></span>${person.name_kat ? "<small></small>" : ""}`;
      button.querySelector("span").textContent = name; if (person.name_kat) button.querySelector("small").textContent = person.name_kat;
      if (index === 0) { button.classList.add("active"); this.activeIndex = 0; } this.liste.appendChild(button);
    });
    if (!treffer.length) return this.schliessen();
    this.liste.hidden = false; this.input.setAttribute("aria-expanded", "true"); this.positionieren();
  }
  aktivMarkieren() { const buttons = [...this.liste.querySelectorAll("button[data-id]")]; buttons.forEach((button, index) => button.classList.toggle("active", index === this.activeIndex)); buttons[this.activeIndex]?.scrollIntoView({ block: "nearest" }); }
  personHinzufuegen(id) { const person = this.personen.find((x) => String(x.id) === String(id)); if (!person || this.eintraege.some((x) => String(x.id) === String(id))) return; this.eintraege.push({ id: person.id, name: PersonenAutocompleteService.name(person), frei: false }); this.input.value = ""; this.renderChips(); this.schliessen(); this.input.focus(); }
  freitextHinzufuegen(value) { const name = String(value || "").trim().replace(/\s+/g, " "); const norm = PersonenAutocompleteService.normalisieren(name); if (!name || this.eintraege.some((x) => PersonenAutocompleteService.normalisieren(x.name) === norm)) return; this.eintraege.push({ id: null, name, frei: true }); this.input.value = ""; this.renderChips(); this.schliessen(); }
  renderChips() { this.chips.innerHTML = ""; this.eintraege.forEach((item, index) => { const chip = document.createElement("span"); chip.className = `person-chip${item.frei ? " is-free" : ""}`; const text = document.createElement("span"); text.textContent = item.name; const remove = document.createElement("button"); remove.type = "button"; remove.dataset.index = index; remove.textContent = "×"; remove.title = remove.ariaLabel = `${item.name} entfernen`; remove.disabled = this.disabled; chip.append(text, remove); this.chips.appendChild(chip); }); this.control.value = this.getValue(); }
  setValue(value) { this.eintraege = []; String(value || "").split(/[,;\n|]+/).map((x) => x.trim()).filter(Boolean).forEach((name) => { const person = this.personen.find((x) => PersonenAutocompleteService.normalisieren(PersonenAutocompleteService.name(x)) === PersonenAutocompleteService.normalisieren(name)); if (person) this.eintraege.push({ id: person.id, name: PersonenAutocompleteService.name(person), frei: false }); else this.eintraege.push({ id: null, name, frei: true }); }); this.input.value = ""; this.renderChips(); }
  getValue() { const rest = this.input.value.trim(); const namen = this.eintraege.map((x) => x.name); if (rest && !namen.some((x) => PersonenAutocompleteService.normalisieren(x) === PersonenAutocompleteService.normalisieren(rest))) namen.push(rest); return namen.join(", "); }
  clear() { this.setValue(""); this.schliessen(); }
  setDisabled(value) { this.disabled = value === true; this.input.disabled = this.disabled; this.wrapper.classList.toggle("is-disabled", this.disabled); this.renderChips(); if (this.disabled) this.schliessen(); }
  schliessen() { this.liste.hidden = true; this.input.setAttribute("aria-expanded", "false"); this.activeIndex = -1; }
  positionieren() { const rect = this.wrapper.getBoundingClientRect(), viewport = window.visualViewport, vw = viewport?.width || window.innerWidth, vh = viewport?.height || window.innerHeight; const hoehe = Math.min(300, Math.max(52, this.liste.scrollHeight)); const unten = vh - rect.bottom - 8, oben = rect.top - 8, nachOben = unten < Math.min(hoehe, 180) && oben > unten; this.liste.classList.toggle("opens-up", nachOben); this.liste.style.left = `${Math.max(8, Math.min(rect.left, vw - Math.min(rect.width, vw - 16) - 8))}px`; this.liste.style.width = `${Math.min(rect.width, vw - 16)}px`; this.liste.style.maxHeight = `${Math.max(52, Math.min(300, (nachOben ? oben : unten) - 4))}px`; this.liste.style.top = nachOben ? "auto" : `${rect.bottom + 4}px`; this.liste.style.bottom = nachOben ? `${vh - rect.top + 4}px` : "auto"; }
};
