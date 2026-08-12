class OrteAuswahl {
  constructor(container, infoContainer = null, options = {}) {
    this.infoContainer = infoContainer;
    this.dropdown = new SearchDropdown(container, {
      placeholder: options.placeholder || "Ort suchen",
      onChange: (option) => this.infoAnzeigen(option?.data || null),
    });
    this.orte = [];
  }

  async laden() {
    this.orte = await OrteService.auswahlLaden();
    this.dropdown.setOptions(this.orte.map((ort) => ({
      value: ort.id,
      label: OrteAuswahl.bezeichnung(ort),
      data: ort,
    })));
    return this.orte;
  }

  getValue() { return this.dropdown.getValue() || null; }

  static bezeichnung(ort) {
    if (!ort) return "";
    if (ort.reviereinrichtung === true) {
      return [ort.name, ort.art].filter(Boolean).join(" - ");
    }
    return ort.name || "";
  }

  setValue(value, trigger = true) {
    this.dropdown.setValue(value || "", trigger);
    if (!trigger) {
      const ort = this.orte.find((item) => String(item.id) === String(value));
      this.infoAnzeigen(ort || null);
    }
  }

  clear() {
    this.dropdown.clear(false);
    this.infoAnzeigen(null);
  }

  infoAnzeigen(ort) {
    if (!this.infoContainer) return;
    this.infoContainer.innerHTML = "";
    if (!ort) {
      this.infoContainer.hidden = true;
      return;
    }
    const teile = [ort.art, ort.latitude != null && ort.longitude != null
      ? `${Number(ort.latitude).toFixed(6)}, ${Number(ort.longitude).toFixed(6)}` : ""]
      .filter(Boolean);
    const text = document.createElement("span");
    text.textContent = teile.join(" · ");
    this.infoContainer.appendChild(text);
    if (ort.latitude != null && ort.longitude != null) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "orte-position-link";
      button.textContent = "Karte öffnen";
      button.addEventListener("click", () => OrteKarte.ortAnzeigen(ort));
      this.infoContainer.append(" · ", button);
    }
    this.infoContainer.hidden = false;
  }
}

window.OrteAuswahl = OrteAuswahl;
