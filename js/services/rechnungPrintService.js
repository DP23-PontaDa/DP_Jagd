const RechnungPrintService = (() => {
  function datum(value) {
    return value ? new Intl.DateTimeFormat("de-AT").format(new Date(`${value}T00:00:00`)) : "";
  }

  function geld(value) {
    return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function iban(value) {
    return String(value || "")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .replace(/(.{4})(?=.)/g, "$1 ");
  }

  function vorlagenText(value, daten) {
    return String(value || "").replace(/\{\{(\w+)\}\}/g, (treffer, name) =>
      Object.prototype.hasOwnProperty.call(daten, name) ? daten[name] : treffer);
  }

  function zeilen(element, values) {
    element.textContent = "";
    values.filter(Boolean).forEach((value, index) => {
      if (index) element.appendChild(element.ownerDocument.createElement("br"));
      element.appendChild(element.ownerDocument.createTextNode(String(value)));
    });
  }

  function kontaktZeilen(element, values) {
    element.textContent = "";
    values.forEach(([label, value]) => {
      const row = element.ownerDocument.createElement("div");
      row.className = "print-footer-contact-row";
      const labelElement = element.ownerDocument.createElement("span");
      labelElement.className = "print-footer-contact-label";
      labelElement.textContent = label;
      const valueElement = element.ownerDocument.createElement("span");
      valueElement.textContent = value || "";
      row.append(labelElement, valueElement);
      element.appendChild(row);
    });
  }

  function excelLayout(buffer) {
    if (!buffer || !window.XLSX) return null;
    const workbook = XLSX.read(buffer, { type: "array", bookVBA: true, cellStyles: true });
    const sheet = workbook.Sheets.Tabelle1;
    if (!sheet) throw new Error('Die aktive Excel-Vorlage enthält kein Tabellenblatt "Tabelle1".');
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const cells = [];
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (cell?.v !== undefined && cell?.v !== null && String(cell.v).trim()) {
          cells.push({ row: row + 1, col: col + 1, text: String(cell.w ?? cell.v).trim() });
        }
      }
    }
    const find = (matcher) => cells.find((cell) => matcher(cell.text));
    const rowTop = (row) => {
      let points = 0;
      for (let index = 0; index < row - 1; index += 1) {
        points += Number(sheet["!rows"]?.[index]?.hpt || 15);
      }
      return 25 + points * 0.352778;
    };
    const textAbZeile = (row, count = 1) => cells
      .filter((cell) => cell.row >= row && cell.row < row + count)
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((cell) => cell.text).join(" ");
    return { sheet, cells, find, rowTop, textAbZeile };
  }

  function wendeExcelLayoutAn(documentNode, excel) {
    if (!excel) return;
    const byId = (id) => documentNode.getElementById(id);
    const setTop = (selector, cell, offset = 0) => {
      if (cell) documentNode.querySelector(selector).style.top = `${excel.rowTop(cell.row) + offset}mm`;
    };
    const titel = excel.find((text) => /^Rechnung\s+Wildfleisch/i.test(text));
    const nummer = excel.find((text) => /^Rechnungsnummer:/i.test(text));
    const anrede = excel.find((text) => /^Guten\s+Tag/i.test(text));
    const intro = excel.find((text) => /wir bedanken uns/i.test(text));
    const tabelle = excel.find((text) => /^Pos\.?$/i.test(text));
    const summe = excel.find((text) => /^Rechnungsbetrag:/i.test(text));
    const zahlung = excel.find((text) => /^Die Rechnung ist/i.test(text));
    const schluss = excel.find((text) => /^Mit Waidmannsheil/i.test(text));
    const datumFeld = excel.find((text) => /^Datum:/i.test(text));

    if (titel) byId("printTitle").textContent = titel.text;
    if (intro) byId("printIntro").textContent = excel.textAbZeile(intro.row, 2);
    if (schluss) byId("printClosingText").textContent = schluss.text;
    if (zahlung) {
      const paymentElement = byId("printPaymentText");
      const purposeElement = paymentElement.querySelector(".print-purpose");
      const fixedText = excel.cells
        .filter((cell) => cell.col === zahlung.col && cell.row >= zahlung.row && cell.row <= zahlung.row + 1)
        .sort((a, b) => a.row - b.row).map((cell) => cell.text).join(" ");
      paymentElement.textContent = fixedText ? `${fixedText} ` : "";
      if (purposeElement) paymentElement.appendChild(purposeElement);
    }
    setTop(".print-title", titel);
    setTop(".print-number", nummer);
    setTop(".print-salutation", anrede);
    setTop(".print-intro", intro);
    setTop(".print-table-frame", tabelle);
    setTop(".print-total", summe);
    setTop(".print-payment-text", zahlung);
    setTop(".print-closing", schluss);
    if (datumFeld) {
      const addressTop = Number.parseFloat(documentNode.querySelector(".print-address-area").style.top || "51.5");
      documentNode.querySelector(".print-date-row").style.top = `${Math.max(0, excel.rowTop(datumFeld.row) - addressTop)}mm`;
    }

    const cols = excel.sheet["!cols"] || [];
    const widths = Array.from({ length: 7 }, (_, index) => Number(cols[index]?.wpx || cols[index]?.wch || 10));
    const total = widths.reduce((sumValue, value) => sumValue + value, 0);
    documentNode.querySelectorAll(".print-table col").forEach((col, index) => {
      if (widths[index]) col.style.width = `${(widths[index] / total) * 100}%`;
    });
    if (tabelle) {
      const headers = excel.cells.filter((cell) => cell.row === tabelle.row)
        .sort((a, b) => a.col - b.col).map((cell) => cell.text);
      documentNode.querySelectorAll(".print-table th").forEach((element, index) => {
        if (headers[index]) element.textContent = headers[index];
      });
    }
  }

  async function render({ rechnung, logoDataUrl, qrSvg, excelVorlage = null }) {
    const response = await fetch("pages/rechnung-print.html", { cache: "no-store" });
    if (!response.ok) throw new Error("Die Druckvorlage konnte nicht geladen werden.");
    const documentNode = new DOMParser().parseFromString(await response.text(), "text/html");
    const byId = (id) => documentNode.getElementById(id);
    const v = rechnung.vorlage_snapshot || {};
    const person = rechnung.person || {};
    const vereinsname = v.vereinsname || v.absender_name || "";
    const adresse = (v.adresse || [v.absender_adresse, v.absender_plz_ort].filter(Boolean).join("\n"))
      .split(/\r?\n/).filter(Boolean);
    const nummern = (rechnung.positionen || []).map((position) => position.abschuss_nr).join("_");
    if ((rechnung.positionen || []).length > 2) {
      documentNode.body.classList.add("print-multipage");
      byId("printPage").classList.add("print-multipage");
    }

    byId("printDocumentTitle").textContent = `RE_JV_Wildfleisch_${rechnung.rechnungsjahr}_${nummern}`;
    byId("printLogo").src = logoDataUrl;
    byId("printSenderLine").textContent = `${vereinsname} - ${adresse.slice(0, 2).join(" - ")}`;
    zeilen(byId("printRecipient"), ["Herr", `${person.vorname || ""} ${person.nachname || ""}`.trim(), person.adresse, `${person.plz || ""} ${person.ort || ""}`.trim(), "Österreich"]);
    byId("printClubName").textContent = vereinsname;
    byId("printObmann").textContent = v.obmann || "";
    byId("printTelefonObmann").textContent = v.telefon_obmann || "";
    byId("printEmail").textContent = v.email || "";
    byId("printKassier").textContent = v.kassier || "";
    byId("printDate").textContent = datum(rechnung.rechnungsdatum);
    byId("printTitle").textContent = v.rechnungsueberschrift || "Rechnung Wildfleisch";
    byId("printInvoiceNumber").textContent = rechnung.rechnungsnummer;
    byId("printSalutation").textContent = vorlagenText(v.anrede || "Guten Tag Herr {{Nachname}},", { Nachname: person.nachname || "" });
    byId("printIntro").textContent = v.einleitung || "";

    const body = byId("printPositions");
    (rechnung.positionen || []).forEach((position, index) => {
      const row = documentNode.createElement("tr");
      const values = [
        `${index + 1}.`, position.beschreibung,
        Number(position.menge || 0).toLocaleString("de-AT"), "kg",
        `${Number(position.einzelpreis || 0).toLocaleString("de-AT", { minimumFractionDigits: 2 })} €`,
        geld(position.gesamtpreis),
      ];
      values.forEach((value, column) => {
        const cell = documentNode.createElement("td");
        if ([2, 4, 5].includes(column)) cell.className = "number";
        cell.textContent = value;
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    byId("printTotal").textContent = geld(rechnung.gesamtbetrag);
    const zahlung = String(v.zahlungshinweis || "");
    const teile = zahlung.split("{{Verwendungszweck}}");
    const zahlungsfeld = byId("printPaymentText");
    zahlungsfeld.textContent = teile[0] || "";
    const verwendungszweck = documentNode.createElement("span");
    verwendungszweck.className = "print-purpose";
    verwendungszweck.textContent = rechnung.verwendungszweck || "";
    zahlungsfeld.appendChild(verwendungszweck);
    if (teile.length > 1) zahlungsfeld.appendChild(documentNode.createTextNode(teile.slice(1).join("")));
    byId("printQr").innerHTML = qrSvg;
    byId("printClosingText").textContent = v.schlusstext || "";
    byId("printSignature").textContent = v.obmann || "";
    byId("printSigners").textContent = `${v.obmann || ""} und ${v.kassier || ""}`;
    zeilen(byId("printFooterClub"), [vereinsname, ...adresse]);
    zeilen(byId("printFooterBank"), ["Bank:", v.bank_name, "IBAN:", iban(v.iban), ...(v.bic ? ["BIC:", v.bic] : [])]);
    kontaktZeilen(byId("printFooterContacts"), [
      ["Obmann:", v.obmann],
      ["Telefon:", v.telefon_obmann],
      ["Kassier:", v.kassier],
      ["Telefon:", v.telefon_kassier],
    ]);
    if (v.fusszeile) { byId("printFooterExtra").hidden = false; byId("printFooterExtra").textContent = v.fusszeile; }

    wendeExcelLayoutAn(documentNode, excelLayout(excelVorlage));
    return `<!doctype html>\n${documentNode.documentElement.outerHTML}`;
  }

  return { render };
})();
