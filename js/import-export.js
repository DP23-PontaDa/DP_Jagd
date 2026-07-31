/* ==========================================
   DP_Jagd V2
   import-export.js
========================================== */

window.ImportExport = (() => {
  const ABSCHUSS_SPALTEN = [
    "Nr", "Datum", "Jäger", "Wildgruppe", "Wildklasse", "Gewicht",
    "Preis/kg", "Gesamtpreis", "Wildhändler", "Zahlungseingang",
    "Fallwild", "Zusatzinfo", "Bemerkung", "Untersuchungsprotokoll",
  ];
  const MITGLIED_SPALTEN = [
    "Mitgliedsnummer", "Vorname", "Nachname", "KJ-Nr", "Adresse", "PLZ",
    "Ort", "Aktiv",
  ];
  let importTyp = "abschuesse";
  let datei = null;
  let zeilen = [];
  let validierung = null;

  const element = (id) => document.getElementById(id);
  const aktiveSpalten = () =>
    importTyp === "mitglieder" ? MITGLIED_SPALTEN : ABSCHUSS_SPALTEN;

  function setStep(nummer) {
    document.querySelectorAll(".ie-step-list [data-step]").forEach((schritt) => {
      schritt.classList.toggle(
        "is-active",
        Number(schritt.dataset.step) === Number(nummer),
      );
      schritt.classList.toggle(
        "is-done",
        Number(schritt.dataset.step) < Number(nummer),
      );
    });
  }

  function xlsxPruefen() {
    if (!window.XLSX) {
      throw new Error("SheetJS konnte nicht geladen werden.");
    }
  }

  async function init() {
    element("ieDateiAuswaehlen").addEventListener("click", () =>
      element("ieDatei").click());
    element("ieDatei").addEventListener("change", dateiAusgewaehlt);
    element("ieVorlage").addEventListener("click", vorlageHerunterladen);
    element("ieExportExcel").addEventListener("click", () => exportieren("xlsx"));
    element("ieExportCsv").addEventListener("click", () => exportieren("csv"));
    element("ieImportAbbrechen").addEventListener("click", importZuruecksetzen);
    element("ieImportBestaetigen").addEventListener("click", importBestaetigen);
    element("ieMitgliederDateiAuswaehlen").addEventListener("click", () =>
      element("ieMitgliederDatei").click());
    element("ieMitgliederDatei").addEventListener("change", (event) =>
      dateiAusgewaehlt(event, "mitglieder"));
    element("ieMitgliederVorlage").addEventListener(
      "click", mitgliederVorlageHerunterladen,
    );
    element("ieMitgliederVorlageCsv").addEventListener(
      "click", mitgliederCsvVorlageHerunterladen,
    );
    element("ieMitgliederExportExcel").addEventListener(
      "click", () => mitgliederExportieren("xlsx"),
    );
    element("ieMitgliederExportCsv").addEventListener(
      "click", () => mitgliederExportieren("csv"),
    );
    element("ieMitgliederBenutzerdefiniert").addEventListener("change", (event) => {
      element("ieMitgliederFilterDetails").hidden = !event.target.checked;
      mitgliederAlleFilterAktualisieren();
    });
    element("ieMitgliederAlle").addEventListener("change", (event) => {
      if (!event.target.checked) return;
      document.querySelectorAll(".ie-member-filter").forEach(
        (input) => { input.checked = false; },
      );
      element("ieMitgliederBenutzerdefiniert").checked = false;
      element("ieMitgliederFilterDetails").hidden = true;
    });
    document.querySelectorAll(".ie-member-filter").forEach(
      (input) => input.addEventListener("change", mitgliederAlleFilterAktualisieren),
    );
    element("ieDubletteClose").addEventListener("click", dublettenDialogAbbrechen);
    element("ieDubletteAbbrechen").addEventListener("click", dublettenDialogAbbrechen);
  }

  function download(blob, dateiname) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = dateiname;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvWert(value) {
    const text = String(value ?? "");
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function alsCsv(daten, spalten = aktiveSpalten()) {
    return [spalten, ...daten.map((zeile) => spalten.map((spalte) => zeile[spalte]))]
      .map((werte) => werte.map(csvWert).join(";"))
      .join("\r\n");
  }

  async function exportieren(format) {
    const status = element("ieExportStatus");
    const buttons = [element("ieExportExcel"), element("ieExportCsv")];
    buttons.forEach((button) => { button.disabled = true; });
    status.textContent = "Export wird vorbereitet …";
    try {
      const filter =
        window.Abschuss &&
        typeof window.Abschuss.getAktuelleFilter === "function"
          ? window.Abschuss.getAktuelleFilter()
          : null;
      const abschuesse =
        await ImportExportService.getExportAbschuesse(filter);
      const daten = ImportExportService.exportZeilen(abschuesse);
      const datum = new Date().toISOString().slice(0, 10);

      if (format === "xlsx") {
        xlsxPruefen();
        const arbeitsmappe = XLSX.utils.book_new();
        const arbeitsblatt = XLSX.utils.json_to_sheet(daten, {
          header: ABSCHUSS_SPALTEN,
        });
        XLSX.utils.book_append_sheet(arbeitsmappe, arbeitsblatt, "Abschüsse");
        XLSX.writeFile(arbeitsmappe, `abschuesse-${datum}.xlsx`);
      } else {
        download(
          new Blob(["\uFEFF", alsCsv(daten, ABSCHUSS_SPALTEN)], {
            type: "text/csv;charset=utf-8",
          }),
          `abschuesse-${datum}.csv`,
        );
      }
      status.textContent = `${daten.length} gefilterte Abschüsse exportiert.`;
    } catch (error) {
      console.error("Export fehlgeschlagen:", error);
      status.textContent = error.message || "Export fehlgeschlagen.";
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function vorlageHerunterladen() {
    try {
      xlsxPruefen();
      const beispiel = {
        Nr: 1,
        Datum: `${new Date().getFullYear()}-01-15`,
        "Jäger": "Max Mustermann",
        Wildgruppe: "Rehwild",
        Wildklasse: "Bock I",
        Gewicht: 18.5,
        "Preis/kg": 4.5,
        Gesamtpreis: 83.25,
        "Wildhändler": "Muster Wildhändler",
        Zahlungseingang: "",
        Fallwild: "Nein",
        Zusatzinfo: "",
        Bemerkung: "Beispielzeile vor Import entfernen oder anpassen",
        Untersuchungsprotokoll: "",
      };
      const arbeitsmappe = XLSX.utils.book_new();
      const arbeitsblatt = XLSX.utils.json_to_sheet([beispiel], {
        header: ABSCHUSS_SPALTEN,
      });
      XLSX.utils.book_append_sheet(arbeitsmappe, arbeitsblatt, "Abschüsse");
      XLSX.writeFile(arbeitsmappe, "vorlage-abschuesse.xlsx");
    } catch (error) {
      alert(error.message);
    }
  }

  function mitgliederFilterLesen() {
    const werte = new Set(
      Array.from(document.querySelectorAll(".ie-member-filter:checked"))
        .map((input) => input.value),
    );
    const benutzerdefiniert = element("ieMitgliederBenutzerdefiniert").checked;
    return {
      aktiv: werte.has("aktiv") && !werte.has("inaktiv")
        ? true
        : werte.has("inaktiv") && !werte.has("aktiv") ? false : undefined,
      suche: benutzerdefiniert ? element("ieMitgliederSuche").value : "",
      mitgliedsnummer:
        benutzerdefiniert ? element("ieMitgliederNummer").value : "",
      ort: benutzerdefiniert ? element("ieMitgliederOrt").value : "",
    };
  }

  function mitgliederAlleFilterAktualisieren() {
    const hatFilter = document.querySelector(
      ".ie-member-filter:checked",
    ) || element("ieMitgliederBenutzerdefiniert").checked;
    element("ieMitgliederAlle").checked = !hatFilter;
  }

  async function mitgliederExportieren(format) {
    const status = element("ieMitgliederExportStatus");
    const buttons = [
      element("ieMitgliederExportExcel"),
      element("ieMitgliederExportCsv"),
    ];
    buttons.forEach((button) => { button.disabled = true; });
    status.textContent = "Export wird vorbereitet …";
    try {
      const mitglieder = await ImportExportService.getExportMitglieder(
        mitgliederFilterLesen(),
      );
      const daten = ImportExportService.exportMitgliederZeilen(mitglieder);
      const datum = new Date().toISOString().slice(0, 10);
      if (format === "xlsx") {
        xlsxPruefen();
        const mappe = XLSX.utils.book_new();
        const blatt = XLSX.utils.json_to_sheet(daten, {
          header: MITGLIED_SPALTEN,
        });
        XLSX.utils.book_append_sheet(mappe, blatt, "Mitglieder");
        XLSX.writeFile(mappe, `mitglieder-${datum}.xlsx`);
      } else {
        download(
          new Blob(["\uFEFF", alsCsv(daten, MITGLIED_SPALTEN)], {
            type: "text/csv;charset=utf-8",
          }),
          `mitglieder-${datum}.csv`,
        );
      }
      status.textContent = `${daten.length} Mitglieder exportiert.`;
    } catch (error) {
      console.error("Mitgliederexport fehlgeschlagen:", error);
      status.textContent = error.message || "Export fehlgeschlagen.";
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function mitgliederVorlageHerunterladen() {
    try {
      xlsxPruefen();
      const beispiel = {
        Mitgliedsnummer: 105,
        Vorname: "Max",
        Nachname: "Mustermann",
        "KJ-Nr": 25,
        Adresse: "Musterstraße 1",
        PLZ: "8010",
        Ort: "Graz",
        Aktiv: "Ja",
      };
      const hinweise = [
        { Feld: "Mitgliedsnummer", Hinweis: "Optional; falls angegeben positive ganze Zahl." },
        { Feld: "Vorname / Nachname", Hinweis: "Pflichtfelder." },
        { Feld: "KJ-Nr", Hinweis: "Optional; falls angegeben positive ganze Zahl." },
        { Feld: "Aktiv", Hinweis: "Optional; zulässige Werte: Ja oder Nein. Leer bedeutet Ja." },
        { Feld: "Dubletten", Hinweis: "Erkennung über Mitgliedsnummer oder Vorname und Nachname." },
      ];
      const mappe = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        mappe,
        XLSX.utils.json_to_sheet([beispiel], { header: MITGLIED_SPALTEN }),
        "Mitglieder",
      );
      XLSX.utils.book_append_sheet(
        mappe,
        XLSX.utils.json_to_sheet(hinweise),
        "Hinweise",
      );
      XLSX.writeFile(mappe, "vorlage-mitglieder.xlsx");
    } catch (error) {
      alert(error.message);
    }
  }

  function mitgliederCsvVorlageHerunterladen() {
    const beispiel = {
      Mitgliedsnummer: 105,
      Vorname: "Max",
      Nachname: "Mustermann",
      "KJ-Nr": 25,
      Adresse: "Musterstraße 1",
      PLZ: "8010",
      Ort: "Graz",
      Aktiv: "Ja",
    };
    download(
      new Blob(["\uFEFF", alsCsv([beispiel], MITGLIED_SPALTEN)], {
        type: "text/csv;charset=utf-8",
      }),
      "vorlage-mitglieder.csv",
    );
  }

  function trennzeichenErmitteln(text) {
    const ersteZeile = String(text || "").split(/\r?\n/, 1)[0] || "";
    const kandidaten = [";", ",", "\t"];
    return kandidaten
      .map((zeichen) => ({
        zeichen,
        anzahl: (ersteZeile.match(
          new RegExp(zeichen === "\t" ? "\\t" : `\\${zeichen}`, "g"),
        ) || []).length,
      }))
      .sort((a, b) => b.anzahl - a.anzahl)[0].zeichen;
  }

  function csvEinlesen(text) {
    const trennzeichen = trennzeichenErmitteln(text);
    const matrix = [];
    let zeile = [];
    let wert = "";
    let inAnfuehrung = false;

    for (let index = 0; index < text.length; index += 1) {
      const zeichen = text[index];
      const naechstes = text[index + 1];
      if (zeichen === '"' && inAnfuehrung && naechstes === '"') {
        wert += '"';
        index += 1;
      } else if (zeichen === '"') {
        inAnfuehrung = !inAnfuehrung;
      } else if (zeichen === trennzeichen && !inAnfuehrung) {
        zeile.push(wert);
        wert = "";
      } else if ((zeichen === "\n" || zeichen === "\r") && !inAnfuehrung) {
        if (zeichen === "\r" && naechstes === "\n") index += 1;
        zeile.push(wert);
        if (zeile.some((eintrag) => String(eintrag).trim())) matrix.push(zeile);
        zeile = [];
        wert = "";
      } else {
        wert += zeichen;
      }
    }
    zeile.push(wert);
    if (zeile.some((eintrag) => String(eintrag).trim())) matrix.push(zeile);
    if (!matrix.length) return [];

    const kopf = matrix[0].map((spalte, index) =>
      String(spalte).replace(index === 0 ? /^\uFEFF/ : /$^/, "").trim());
    return matrix.slice(1).map((werte) =>
      Object.fromEntries(kopf.map((spalte, index) => [spalte, werte[index] ?? ""])));
  }

  function datumNormalisieren(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime()))
      return value.toISOString().slice(0, 10);
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const deutsch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (deutsch) {
      return `${deutsch[3]}-${deutsch[2].padStart(2, "0")}-${deutsch[1].padStart(2, "0")}`;
    }
    return text;
  }

  function nummerNormalisieren(value) {
    if (typeof value === "number") return value;
    const text = String(value ?? "").trim().replace(/\s/g, "");
    if (!text) return "";
    const normalisiert =
      text.includes(",") && !text.includes(".")
        ? text.replace(",", ".")
        : text.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    const nummer = Number(normalisiert);
    return Number.isFinite(nummer) ? nummer : value;
  }

  function zeilenNormalisieren(rohdaten) {
    return rohdaten.map((roh) => {
      const zeile = {};
      aktiveSpalten().forEach((spalte) => { zeile[spalte] = roh[spalte] ?? ""; });
      if (importTyp === "mitglieder") {
        zeile.Mitgliedsnummer = nummerNormalisieren(zeile.Mitgliedsnummer);
        zeile["KJ-Nr"] = nummerNormalisieren(zeile["KJ-Nr"]);
      } else {
        zeile.Datum = datumNormalisieren(zeile.Datum);
        zeile.Zahlungseingang = datumNormalisieren(zeile.Zahlungseingang);
        ["Nr", "Gewicht", "Preis/kg", "Gesamtpreis"].forEach((spalte) => {
          zeile[spalte] = nummerNormalisieren(zeile[spalte]);
        });
      }
      return zeile;
    });
  }

  function pflichtspaltenPruefen(rohdaten) {
    const vorhanden = new Set(
      rohdaten.length ? Object.keys(rohdaten[0]) : [],
    );
    return aktiveSpalten()
      .filter((spalte) => !vorhanden.has(spalte))
      .map((spalte) => ({
        zeile: 1,
        spalte,
        beschreibung: "Erforderliche Spalte fehlt.",
      }));
  }

  async function dateiAusgewaehlt(event, typ = "abschuesse") {
    importTyp = typ;
    datei = event.target.files?.[0] || null;
    if (!datei) return;
    importZuruecksetzen(false);
    element("ieAssistent").hidden = false;
    element("ieImportInfo").textContent = `${datei.name} wird eingelesen …`;
    setStep(2);

    try {
      let rohdaten;
      if (datei.name.toLocaleLowerCase("de").endsWith(".csv")) {
        rohdaten = csvEinlesen(await datei.text());
      } else if (datei.name.toLocaleLowerCase("de").endsWith(".xlsx")) {
        xlsxPruefen();
        const arbeitsmappe = XLSX.read(await datei.arrayBuffer(), {
          type: "array",
          cellDates: true,
        });
        const arbeitsblatt = arbeitsmappe.Sheets[arbeitsmappe.SheetNames[0]];
        rohdaten = XLSX.utils.sheet_to_json(arbeitsblatt, {
          defval: "",
          raw: false,
          dateNF: "yyyy-mm-dd",
        });
      } else {
        throw new Error("Unterstützt werden ausschließlich .xlsx und .csv.");
      }

      const spaltenFehler = pflichtspaltenPruefen(rohdaten);
      zeilen = zeilenNormalisieren(rohdaten);
      vorschauAnzeigen();
      setStep(3);
      const referenzen = importTyp === "mitglieder"
        ? await ImportExportService.getMitgliederImportReferenzen()
        : await ImportExportService.getImportReferenzen();
      validierung = importTyp === "mitglieder"
        ? ImportExportService.validiereMitgliederImportZeilen(zeilen, referenzen)
        : ImportExportService.validiereImportZeilen(zeilen, referenzen);
      validierung.fehler.unshift(...spaltenFehler);
      validierungAnzeigen();
      setStep(4);
    } catch (error) {
      console.error("Importdatei konnte nicht gelesen werden:", error);
      element("ieImportFehler").hidden = false;
      element("ieImportFehler").textContent =
        error.message || "Datei konnte nicht gelesen werden.";
    }
  }

  function vorschauAnzeigen() {
    element("ieVorschau").hidden = false;
    element("ieVorschauKopf").innerHTML =
      `<tr>${aktiveSpalten().map((spalte) => `<th>${spalte}</th>`).join("")}</tr>`;
    element("ieVorschauBody").innerHTML = zeilen
      .slice(0, 100)
      .map((zeile) =>
        `<tr>${aktiveSpalten().map((spalte) =>
          `<td>${htmlSicher(zeile[spalte])}</td>`).join("")}</tr>`)
      .join("");
    element("ieImportInfo").textContent =
      `${datei.name}: ${zeilen.length} Datenzeilen gelesen` +
      (zeilen.length > 100 ? " · Vorschau zeigt die ersten 100 Zeilen" : "");
  }

  function htmlSicher(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function fehlerTabelle(body, fehler) {
    body.innerHTML = (fehler || []).map((eintrag) => `
      <tr>
        <td>${eintrag.zeile}</td>
        <td>${htmlSicher(eintrag.spalte)}</td>
        <td>${htmlSicher(eintrag.beschreibung)}</td>
      </tr>`).join("");
  }

  function validierungAnzeigen() {
    const fehler = validierung?.fehler || [];
    const warnungen = validierung?.warnungen || [];
    element("ieValidierung").hidden = false;
    element("ieValidierungStatus").textContent = fehler.length
      ? `${fehler.length} Fehler gefunden. Es wurden keine Daten importiert.`
      : `${zeilen.length} Zeilen sind gültig. Import kann bestätigt werden.` +
        (warnungen.length ? ` ${warnungen.length} Warnungen.` : "");
    fehlerTabelle(element("ieFehlerBody"), fehler);
    element("ieImportBestaetigen").hidden =
      Boolean(fehler.length || !zeilen.length);
    if (!fehler.length && zeilen.length) setStep(5);
  }

  function dublettenDialogAbbrechen() {
    const modal = element("ieDubletteModal");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    if (modal._resolve) modal._resolve(null);
    modal._resolve = null;
  }

  function dublettenEntscheidung(dublette) {
    const modal = element("ieDubletteModal");
    const istMitglied = importTyp === "mitglieder";
    element("ieDubletteTitel").textContent = istMitglied
      ? "Mitglied gefunden"
      : "Abschuss bereits vorhanden";
    element("ieDubletteNeuText").textContent = istMitglied
      ? "Neues Mitglied anlegen"
      : "Trotzdem neu anlegen";
    element("ieDubletteName").textContent = istMitglied
      ? `${dublette.bestehend.vorname || ""} ${dublette.bestehend.nachname || ""}`.trim()
      : dublette.anzeige?.name || `Abschuss in Zeile ${dublette.zeile}`;
    element("ieDubletteNummer").textContent = istMitglied
      ? dublette.bestehend.personen_nr
        ? `Mitgliedsnummer ${dublette.bestehend.personen_nr}`
        : "Keine Mitgliedsnummer vorhanden"
      : dublette.anzeige?.nummer || "";
    element("ieDubletteGrund").textContent =
      `Erkannt über: ${dublette.grund}`;
    element("ieDubletteAenderungen").innerHTML = dublette.aenderungen.length
      ? dublette.aenderungen.map((aenderung) => `
        <tr><td>${htmlSicher(aenderung.spalte)}</td>
        <td>${htmlSicher(aenderung.alt)}</td>
        <td>${htmlSicher(aenderung.neu)}</td></tr>`).join("")
      : '<tr><td colspan="3">Keine Feldänderungen gefunden.</td></tr>';
    element("ieDubletteAlle").checked = false;
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    return new Promise((resolve) => {
      modal._resolve = resolve;
      element("ieDubletteUebernehmen").onclick = () => {
        const entscheidung = document.querySelector(
          'input[name="ieDubletteEntscheidung"]:checked',
        )?.value || "ueberspringen";
        const alle = element("ieDubletteAlle").checked;
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
        modal._resolve = null;
        resolve({ entscheidung, alle });
      };
    });
  }

  async function dublettenEntscheiden() {
    let entscheidungFuerAlle = null;
    for (const dublette of validierung.dubletten || []) {
      const entscheidung = entscheidungFuerAlle ||
        await dublettenEntscheidung(dublette);
      if (!entscheidung) return false;
      dublette.entscheidung = entscheidung.entscheidung;
      if (entscheidung.alle) entscheidungFuerAlle = entscheidung;
    }
    validierung.payloads.forEach((eintrag) => {
      if (!eintrag.bestehend) eintrag.entscheidung = "neu";
    });
    return true;
  }

  async function importBestaetigen() {
    if (!validierung || validierung.fehler.length || !zeilen.length) return;
    if (
      !await dublettenEntscheiden()
    ) return;
    const bestaetigt = window.confirm(
      `${zeilen.length} validierte ${
        importTyp === "mitglieder" ? "Mitglieder" : "Abschüsse"
      } jetzt verbindlich importieren?`,
    );
    if (!bestaetigt) return;

    const button = element("ieImportBestaetigen");
    button.disabled = true;
    try {
      if (importTyp === "mitglieder") {
        const bericht = await ImportExportService.importMitglieder(
          validierung.payloads,
        );
        validierung.warnungen = [
          ...(validierung.warnungen || []),
          ...(bericht.warnungen || []),
        ];
        berichtAnzeigen(
          bericht.neu + bericht.aktualisiert,
          bericht.fehler,
          bericht,
        );
        AppFeedback.success(
          `${bericht.neu} neue und ${bericht.aktualisiert} aktualisierte Mitglieder.`,
        );
      } else {
        const bericht =
          await ImportExportService.importAbschuesse(validierung.payloads);
        validierung.warnungen = [
          ...(validierung.warnungen || []),
          ...(bericht.warnungen || []),
        ];
        berichtAnzeigen(
          bericht.neu + bericht.aktualisiert,
          bericht.fehler,
          bericht,
        );
        AppFeedback.success(
          `${bericht.neu} neue und ${bericht.aktualisiert} aktualisierte Abschüsse.`,
        );
      }
      setStep(6);
    } catch (error) {
      console.error("Import fehlgeschlagen:", error);
      const importFehler = [{
        zeile: "–",
        spalte: "Datenbank",
        beschreibung: error.message || "Import fehlgeschlagen.",
      }];
      berichtAnzeigen(0, importFehler);
      setStep(6);
    } finally {
      button.disabled = false;
      button.hidden = true;
    }
  }

  function berichtAnzeigen(importiert, importFehler, mitgliederBericht = null) {
    const fehler = [...(validierung?.fehler || []), ...(importFehler || [])];
    element("ieVorschau").hidden = true;
    element("ieValidierung").hidden = true;
    element("ieBericht").hidden = false;
    element("ieBerichtDatei").textContent = datei?.name || "–";
    element("ieBerichtGelesen").textContent = zeilen.length;
    element("ieBerichtImportiert").textContent = importiert;
    element("ieBerichtFehler").textContent = fehler.length;
    element("ieBerichtWarnungen").textContent =
      validierung?.warnungen?.length || 0;
    element("ieDetailBerichtSummen").hidden = !mitgliederBericht;
    if (mitgliederBericht) {
      const istMitglied = importTyp === "mitglieder";
      element("ieBerichtNeuLabel").textContent = istMitglied
        ? "Neue Mitglieder"
        : "Neue Abschüsse";
      element("ieBerichtAktualisiertLabel").textContent = istMitglied
        ? "Aktualisierte Mitglieder"
        : "Aktualisierte Abschüsse";
      element("ieBerichtUebersprungenLabel").textContent = istMitglied
        ? "Übersprungene Mitglieder"
        : "Übersprungene Dubletten";
      element("ieBerichtNeu").textContent = mitgliederBericht.neu;
      element("ieBerichtAktualisiert").textContent =
        mitgliederBericht.aktualisiert;
      element("ieBerichtUebersprungen").textContent =
        mitgliederBericht.uebersprungen;
    }
    fehlerTabelle(element("ieBerichtFehlerBody"), fehler);
  }

  function importZuruecksetzen(dateiLeeren = true) {
    zeilen = [];
    validierung = null;
    if (dateiLeeren) {
      datei = null;
      element("ieDatei").value = "";
      element("ieMitgliederDatei").value = "";
      element("ieAssistent").hidden = true;
    }
    element("ieImportFehler").hidden = true;
    element("ieImportFehler").textContent = "";
    element("ieVorschau").hidden = true;
    element("ieValidierung").hidden = true;
    element("ieBericht").hidden = true;
    element("ieDetailBerichtSummen").hidden = true;
    element("ieImportBestaetigen").hidden = true;
    element("ieVorschauKopf").innerHTML = "";
    element("ieVorschauBody").innerHTML = "";
    element("ieFehlerBody").innerHTML = "";
    setStep(1);
  }

  return { init };
})();
