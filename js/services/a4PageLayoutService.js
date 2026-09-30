window.A4PageLayout = (() => {
  const config = Object.freeze({
    breiteMm: 210, hoeheMm: 297,
    randObenMm: 34, randUntenMm: 20, randLinksMm: 24, randRechtsMm: 24,
    kopfObenMm: 9.5, fussUntenMm: 7.5,
    kopfInhaltHoeheMm: 18, fussInhaltHoeheMm: 8,
  });

  function cssVariablenSetzen() {
    const root = document.documentElement.style;
    root.setProperty("--a4-width", `${config.breiteMm}mm`);
    root.setProperty("--a4-height", `${config.hoeheMm}mm`);
    root.setProperty("--a4-content-top", `${config.randObenMm}mm`);
    root.setProperty("--a4-content-bottom", `${config.randUntenMm}mm`);
    root.setProperty("--a4-content-left", `${config.randLinksMm}mm`);
    root.setProperty("--a4-content-right", `${config.randRechtsMm}mm`);
    root.setProperty("--a4-header-top", `${config.kopfObenMm}mm`);
    root.setProperty("--a4-footer-bottom", `${config.fussUntenMm}mm`);
    root.setProperty("--a4-header-content-height", `${config.kopfInhaltHoeheMm}mm`);
    root.setProperty("--a4-footer-content-height", `${config.fussInhaltHoeheMm}mm`);
    root.setProperty("--a4-content-height", `calc(${config.hoeheMm}mm - ${config.randObenMm}mm - ${config.randUntenMm}mm)`);
    root.setProperty("--a4-calendar-available-height", `calc(var(--a4-content-height) - var(--a4-header-content-height) - var(--a4-footer-content-height))`);
  }

  function headerFooterHoehenAnpassen(kopf, fuss) {
    if (!kopf || !fuss) return;
    const pxProMm = 96 / 25.4;
    const headerMm = Math.max(0, kopf.offsetHeight / pxProMm);
    const footerMm = Math.max(0, fuss.offsetHeight / pxProMm);
    document.documentElement.style.setProperty("--a4-header-content-height", `${headerMm.toFixed(2)}mm`);
    document.documentElement.style.setProperty("--a4-footer-content-height", `${footerMm.toFixed(2)}mm`);
    document.documentElement.style.setProperty("--a4-calendar-available-height", `calc(var(--a4-content-height) - var(--a4-header-content-height) - var(--a4-footer-content-height))`);
  }

  function titelMitJahr(titel, jahr) {
    return jahr == null || String(titel).includes(String(jahr)) ? titel : `${titel} ${jahr}`;
  }

  function rahmen(seite, { titel, jahr, seiteNr, seitenGesamt } = {}) {
    if (!seite) return;
    cssVariablenSetzen();
    seite.classList.add("a4-report-sheet");
    const kopf = seite.querySelector(":scope > .a4-report-header") || document.createElement("header");
    kopf.className = "a4-report-header";
    kopf.innerHTML = `<div class="a4-header-title"><strong></strong></div><img src="assets/rechnung-logo.png" alt="Jagdverein St. Peter/Mitterberg">`;
    kopf.querySelector("strong").textContent = titelMitJahr(titel || "DP Jagd", jahr);
    if (!kopf.parentElement) seite.prepend(kopf);

    const fuss = seite.querySelector(":scope > .a4-report-footer, :scope > .jaegerbericht-foot") || document.createElement("footer");
    fuss.className = "a4-report-footer";
    fuss.innerHTML = `<span>Jagdverein St. Peter/Mitterberg</span><span></span><span>Daniel Pontasch</span>`;
    fuss.children[1].textContent = seiteNr && seitenGesamt ? `Seite ${seiteNr} / ${seitenGesamt}` : "";
    if (!fuss.parentElement) seite.append(fuss);

    requestAnimationFrame(() => headerFooterHoehenAnpassen(kopf, fuss));
  }

  function rahmenAktualisieren(container, optionen) {
    const seiten = [...container.children].filter((element) => element.matches(".jagdjahr-sheet, .key-dates-sheet, .jaegerbericht-sheet"));
    seiten.forEach((seite, index) => rahmen(seite, { ...optionen, seiteNr: index + 1, seitenGesamt: seiten.length }));
  }

  cssVariablenSetzen();
  return { config, cssVariablenSetzen, rahmen, rahmenAktualisieren, titelMitJahr };
})();
