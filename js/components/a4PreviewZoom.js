window.A4PreviewZoom = (() => {
  const STUFEN = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  const instanzen = new Set();
  let resizeGebunden = false;

  function naechsteStufe(zoom, richtung) {
    if (richtung > 0) return STUFEN.find((stufe) => stufe > zoom + 0.001) || STUFEN.at(-1);
    return [...STUFEN].reverse().find((stufe) => stufe < zoom - 0.001) || STUFEN[0];
  }

  function toolbarErstellen() {
    const toolbar = document.createElement("div");
    toolbar.className = "a4-zoom-toolbar";
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Zoom der A4-Vorschau");
    toolbar.innerHTML = `
      <button class="btn btn-secondary a4-zoom-minus" type="button" aria-label="Vorschau verkleinern">−</button>
      <output class="a4-zoom-value" aria-live="polite">100%</output>
      <button class="btn btn-secondary a4-zoom-plus" type="button" aria-label="Vorschau vergrößern">+</button>
      <button class="btn btn-outline a4-zoom-fit" type="button" title="An Seite anpassen" aria-label="An Seite anpassen">Fit</button>`;
    return toolbar;
  }

  function create({ scroll, pages, sheetSelector }) {
    if (!scroll || !pages) return null;
    const vorhanden = scroll.__a4PreviewZoom;
    if (vorhanden) return vorhanden;

    const stage = document.createElement("div");
    stage.className = "a4-zoom-stage";
    scroll.insertBefore(stage, pages);
    stage.appendChild(pages);
    scroll.classList.add("a4-preview-container");
    pages.classList.add("a4-zoom-canvas");

    const toolbar = toolbarErstellen();
    const controls = scroll.closest(".jagdjahr-page, .key-dates-page")
      ?.querySelector(".jagdjahr-controls, .key-dates-controls");
    const pdfButton = controls?.querySelector('[id$="Pdf"]');
    if (controls) controls.insertBefore(toolbar, pdfButton || null);
    else scroll.before(toolbar);
    const minus = toolbar.querySelector(".a4-zoom-minus");
    const plus = toolbar.querySelector(".a4-zoom-plus");
    const wert = toolbar.querySelector(".a4-zoom-value");
    const fitButton = toolbar.querySelector(".a4-zoom-fit");
    const state = { zoom: 1, fitZoom: 1, fitAktiv: true, frame: 0 };

    function seite() {
      return pages.querySelector(sheetSelector || ".jagdjahr-sheet, .key-dates-sheet");
    }

    function naturmasse() {
      const vorher = pages.style.transform;
      pages.style.transform = "none";
      const ersteSeite = seite();
      const breite = Math.max(1, pages.scrollWidth, ersteSeite?.offsetWidth || 0);
      const hoehe = Math.max(1, pages.scrollHeight, pages.offsetHeight);
      const seitenBreite = Math.max(1, ersteSeite?.offsetWidth || breite);
      const seitenHoehe = Math.max(1, ersteSeite?.offsetHeight || hoehe);
      pages.style.transform = vorher;
      return { breite, hoehe, seitenBreite, seitenHoehe };
    }

    function verfuegbareHoehe() {
      const oben = scroll.getBoundingClientRect().top;
      return Math.max(300, window.innerHeight - Math.max(0, oben) - 20);
    }

    function anwenden(neuBerechnen = false) {
      if (!scroll.isConnected || !seite()) return;
      const masse = naturmasse();
      const innenBreite = Math.max(1, scroll.clientWidth - 24);
      const innenHoehe = Math.max(1, verfuegbareHoehe() - 24);
      scroll.style.setProperty("--a4-preview-height", `${verfuegbareHoehe()}px`);
      state.fitZoom = Math.min(1, innenBreite / masse.seitenBreite, innenHoehe / masse.seitenHoehe);
      if (state.fitAktiv || neuBerechnen) state.zoom = state.fitZoom;
      pages.style.setProperty("--a4-preview-zoom", String(state.zoom));
      stage.style.width = `${Math.ceil(masse.breite * state.zoom)}px`;
      stage.style.height = `${Math.ceil(masse.hoehe * state.zoom)}px`;
      wert.value = `${Math.round(state.zoom * 100)}%`;
      wert.textContent = wert.value;
      fitButton.classList.toggle("active", state.fitAktiv);
      fitButton.setAttribute("aria-pressed", String(state.fitAktiv));
      minus.disabled = state.zoom <= Math.min(STUFEN[0], state.fitZoom) + 0.001;
      plus.disabled = state.zoom >= STUFEN.at(-1) - 0.001;
    }

    function planen(neuBerechnen = false) {
      cancelAnimationFrame(state.frame);
      state.frame = requestAnimationFrame(() => anwenden(neuBerechnen));
    }

    minus.addEventListener("click", () => {
      const ziel = naechsteStufe(state.zoom, -1);
      state.zoom = state.fitZoom < STUFEN[0] && state.zoom <= STUFEN[0] ? state.fitZoom : ziel;
      state.fitAktiv = Math.abs(state.zoom - state.fitZoom) < 0.001;
      planen();
    });
    plus.addEventListener("click", () => {
      state.zoom = naechsteStufe(state.zoom, 1);
      state.fitAktiv = false;
      planen();
    });
    fitButton.addEventListener("click", () => {
      state.fitAktiv = true;
      scroll.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      planen(true);
    });

    const observer = new MutationObserver(() => planen(false));
    observer.observe(pages, { childList: true, subtree: false });
    const instanz = { scroll, planen, observer };
    scroll.__a4PreviewZoom = instanz;
    instanzen.add(instanz);
    planen(true);

    if (!resizeGebunden) {
      resizeGebunden = true;
      window.addEventListener("resize", () => {
        instanzen.forEach((item) => {
          if (!item.scroll.isConnected) {
            item.observer.disconnect();
            instanzen.delete(item);
          } else item.planen(false);
        });
      }, { passive: true });
    }
    return instanz;
  }

  return { create };
})();
