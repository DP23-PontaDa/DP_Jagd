window.Rechnungsvorlage = (() => {
  const el = (id) => document.getElementById(id);
  const felder = {
    rvVereinsname: "vereinsname",
    rvStrasse: "strasse",
    rvPlz: "plz",
    rvOrt: "ort",
    rvObmann: "obmann",
    rvKassier: "kassier",
    rvTelefonObmann: "telefon_obmann",
    rvTelefonKassier: "telefon_kassier",
    rvEmail: "email",
    rvBankName: "bank_name",
    rvIban: "iban",
    rvBic: "bic",
  };
  let aktiveExcelVorlage = null;
  let vorlage = null;

  function formatiereIban(value) {
    return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase()
      .replace(/(.{4})(?=.)/g, "$1 ");
  }

  function excelDateiPruefen(datei) {
    if (!datei || !/\.(xlsx|xlsm)$/i.test(datei.name)) {
      throw new Error("Bitte eine Excel-Datei im Format .xlsx oder .xlsm auswählen.");
    }
    if (datei.size > 15 * 1024 * 1024) {
      throw new Error("Die Excel-Vorlage darf höchstens 15 MB groß sein.");
    }
    if (!window.XLSX) throw new Error("SheetJS ist nicht verfügbar.");
  }

  async function validiereExcelInhalt(datei) {
    excelDateiPruefen(datei);
    const arbeitsmappe = XLSX.read(await datei.arrayBuffer(), {
      type: "array", bookVBA: true, cellStyles: true,
    });
    if (!arbeitsmappe.SheetNames.includes("Tabelle1")) {
      throw new Error('Die Excel-Vorlage enthält kein Tabellenblatt "Tabelle1".');
    }
    const texte = XLSX.utils.sheet_to_json(arbeitsmappe.Sheets.Tabelle1, {
      header: 1, raw: false, defval: "",
    }).flat().map((value) => String(value).trim());
    const erforderlicheAnker = [
      "Rechnung Wildfleisch", "Rechnungsnummer:", "Pos.",
      "Rechnungsbetrag:", "Mit Waidmannsheil",
    ];
    const fehlend = erforderlicheAnker.filter((anker) => !texte.includes(anker));
    if (fehlend.length) {
      throw new Error(`In Tabelle1 fehlen erforderliche Layout-Anker: ${fehlend.join(", ")}`);
    }
  }

  async function init() {
    el("rvSpeichern").onclick = speichern;
    el("rvExcelHochladen").onclick = excelHochladen;
    el("rvExcelHerunterladen").onclick = excelHerunterladen;
    el("rvIban").oninput = (event) => { event.target.value = formatiereIban(event.target.value); };
    try {
      [vorlage, aktiveExcelVorlage] = await Promise.all([
        RechnungsvorlageService.getVorlage(),
        RechnungsvorlageService.getAktiveExcelVorlage(),
      ]);
      Object.entries(felder).forEach(([id, spalte]) => {
        el(id).value = id === "rvIban" ? formatiereIban(vorlage[spalte]) : vorlage[spalte] || "";
      });
      el("rvLogoStatus").textContent = vorlage.logo_storage_path
        ? "Ein eigenes Logo ist gespeichert. Eine neue Datei ersetzt es."
        : "Standardlogo wird verwendet.";
      excelStatusAktualisieren();
    } catch (error) {
      fehler(error.message || "Die Rechnungsvorlage konnte nicht geladen werden.");
    }
  }

  function excelStatusAktualisieren() {
    el("rvExcelStatus").textContent = aktiveExcelVorlage
      ? `Aktiv: ${aktiveExcelVorlage.dateiname} · ${new Intl.DateTimeFormat("de-AT").format(new Date(aktiveExcelVorlage.erstellt_am))}`
      : "Noch keine aktive Excel-Vorlage gespeichert.";
    el("rvExcelHerunterladen").disabled = !aktiveExcelVorlage;
  }

  async function speichern() {
    const required = ["rvVereinsname", "rvStrasse", "rvPlz", "rvOrt", "rvObmann", "rvKassier", "rvIban"];
    if (required.some((id) => !el(id).value.trim())) {
      fehler("Bitte Vereinsname, Straße, PLZ, Ort, Obmann, Kassier und IBAN ausfüllen.");
      return;
    }
    const daten = {};
    Object.entries(felder).forEach(([id, spalte]) => { daten[spalte] = el(id).value.trim(); });
    daten.iban = formatiereIban(daten.iban);
    daten.bic = daten.bic.replace(/\s/g, "").toUpperCase();
    daten.adresse = [daten.strasse, `${daten.plz} ${daten.ort}`.trim(), "Österreich"].join("\n");
    const logo = el("rvLogoDatei").files[0];
    try {
      el("rvSpeichern").disabled = true;
      if (logo) {
        if (!/^image\/(png|jpeg|svg\+xml)$/.test(logo.type) || logo.size > 3 * 1024 * 1024) {
          throw new Error("Das Logo muss PNG, JPG oder SVG und höchstens 3 MB groß sein.");
        }
        daten.logo_storage_path = await RechnungsvorlageService.uploadLogo(logo);
      }
      vorlage = await RechnungsvorlageService.saveVorlage(daten);
      el("rvLogoDatei").value = "";
      el("rvLogoStatus").textContent = vorlage.logo_storage_path
        ? "Ein eigenes Logo ist gespeichert. Eine neue Datei ersetzt es."
        : "Standardlogo wird verwendet.";
      el("rvFehler").hidden = true;
      AppFeedback.success("Rechnungsstammdaten wurden gespeichert.");
    } catch (error) {
      fehler(error.message || "Die Rechnungsstammdaten konnten nicht gespeichert werden.");
    } finally { el("rvSpeichern").disabled = false; }
  }

  async function excelHochladen() {
    const datei = el("rvExcelDatei").files[0];
    try {
      el("rvExcelHochladen").disabled = true;
      await validiereExcelInhalt(datei);
      await RechnungsvorlageService.uploadExcelVorlage(datei);
      aktiveExcelVorlage = await RechnungsvorlageService.getAktiveExcelVorlage();
      el("rvExcelDatei").value = "";
      excelStatusAktualisieren();
      el("rvFehler").hidden = true;
      AppFeedback.success("Die neue Excel-Rechnungsvorlage ist aktiv.");
    } catch (error) {
      fehler(error.message || "Die Excel-Vorlage konnte nicht hochgeladen werden.");
    } finally { el("rvExcelHochladen").disabled = false; }
  }

  async function excelHerunterladen() {
    if (!aktiveExcelVorlage) return;
    try {
      const blob = await RechnungsvorlageService.downloadStorageDatei(aktiveExcelVorlage.storage_path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = aktiveExcelVorlage.dateiname;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { fehler(error.message || "Die Excel-Vorlage konnte nicht geladen werden."); }
  }

  function fehler(text) {
    el("rvFehler").textContent = text;
    el("rvFehler").hidden = false;
  }

  return { init };
})();
