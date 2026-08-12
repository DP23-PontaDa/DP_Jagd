window.HashtagInput = class HashtagInput {
  constructor(input, options = {}) {
    this.input = input;
    this.tags = [];
    this.vorschlaege = [];
    this.disabled = false;
    this.input.placeholder = options.placeholder || "Hashtag eingeben";
    this.input.autocomplete = "off";
    this.wrapper = document.createElement("div");
    this.wrapper.className = "hashtag-input";
    this.chips = document.createElement("div");
    this.chips.className = "hashtag-input-chips";
    input.parentNode.insertBefore(this.wrapper, input);
    this.wrapper.append(this.chips, input);
    this.liste = document.createElement("div");
    this.liste.className = "hashtag-suggestions";
    this.liste.hidden = true;
    document.body.appendChild(this.liste);
    input.addEventListener("input", () => this.vorschlaegeRendern());
    input.addEventListener("focus", () => this.vorschlaegeRendern());
    input.addEventListener("blur", () => setTimeout(() => this.schliessen(), 180));
    input.addEventListener("keydown", (event) => this.taste(event));
    this.liste.addEventListener("mousedown", (event) => event.preventDefault());
    this.liste.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-tag]");
      if (button) this.hinzufuegen(button.dataset.tag);
    });
    this.chips.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-index]");
      if (!button || this.disabled) return;
      this.tags.splice(Number(button.dataset.index), 1);
      this.chipsRendern();
      this.input.focus();
    });
  }

  async laden() {
    this.vorschlaege = await HashtagService.vorschlaegeLaden();
  }

  normalisieren(value) {
    return String(value || "").replace(/^#+/, "").trim().replace(/\s+/g, " ");
  }

  hinzufuegen(value) {
    const tag = this.normalisieren(value);
    if (!tag || this.tags.some((item) => HashtagService.normalisieren(item) === HashtagService.normalisieren(tag))) return;
    this.tags.push(tag);
    this.input.value = "";
    this.chipsRendern();
    this.vorschlaegeRendern();
  }

  taste(event) {
    if ((event.key === "Enter" || event.key === "," || event.key === ";") && this.input.value.trim()) {
      event.preventDefault();
      this.hinzufuegen(this.input.value);
    } else if (event.key === "Backspace" && !this.input.value && this.tags.length && !this.disabled) {
      this.tags.pop(); this.chipsRendern();
    } else if (event.key === "Escape") this.schliessen();
  }

  chipsRendern() {
    this.chips.innerHTML = "";
    this.tags.forEach((tag, index) => {
      const chip = document.createElement("span"); chip.className = "hashtag-chip";
      const text = document.createElement("span"); text.textContent = `#${tag.replace(/\s+/g, "")}`; text.title = tag;
      const remove = document.createElement("button"); remove.type = "button"; remove.dataset.index = index;
      remove.textContent = "×"; remove.title = remove.ariaLabel = `${tag} entfernen`; remove.disabled = this.disabled;
      chip.append(text, remove); this.chips.appendChild(chip);
    });
  }

  vorschlaegeRendern() {
    if (this.disabled || !this.input.isConnected) return this.schliessen();
    const query = HashtagService.normalisieren(this.input.value);
    if (!query) return this.schliessen();
    const ausgewaehlt = new Set(this.tags.map(HashtagService.normalisieren));
    const treffer = this.vorschlaege.filter((tag) => !ausgewaehlt.has(HashtagService.normalisieren(tag)) &&
      HashtagService.normalisieren(tag).includes(query)).slice(0, 8);
    this.liste.innerHTML = "";
    treffer.forEach((tag) => {
      const button = document.createElement("button"); button.type = "button";
      button.dataset.tag = tag; button.textContent = tag; this.liste.appendChild(button);
    });
    if (!treffer.length) return this.schliessen();
    const rect = this.wrapper.getBoundingClientRect();
    const breite = Math.min(rect.width, window.innerWidth - 16);
    const links = Math.min(Math.max(8, rect.left), window.innerWidth - breite - 8);
    const platzUnten = window.innerHeight - rect.bottom - 12;
    const platzOben = rect.top - 12;
    const nachUnten = platzUnten >= 150 || platzUnten >= platzOben;
    const maxHoehe = Math.max(80, Math.min(260, nachUnten ? platzUnten : platzOben));
    const oben = nachUnten ? rect.bottom + 4 : Math.max(8, rect.top - maxHoehe - 4);
    this.liste.style.left = `${links}px`;
    this.liste.style.top = `${oben}px`;
    this.liste.style.width = `${breite}px`;
    this.liste.style.maxHeight = `${maxHoehe}px`;
    this.liste.hidden = false;
  }

  schliessen() { this.liste.hidden = true; }
  getTags() { const rest = this.normalisieren(this.input.value); return rest ? [...this.tags, rest] : [...this.tags]; }
  setTags(tags) { this.tags = []; (tags || []).forEach((tag) => { const wert = this.normalisieren(tag); if (wert && !this.tags.some((x) => HashtagService.normalisieren(x) === HashtagService.normalisieren(wert))) this.tags.push(wert); }); this.input.value = ""; this.chipsRendern(); }
  clear() { this.setTags([]); this.schliessen(); }
  setDisabled(value) { this.disabled = value === true; this.input.disabled = this.disabled; this.chipsRendern(); if (this.disabled) this.schliessen(); }
};
