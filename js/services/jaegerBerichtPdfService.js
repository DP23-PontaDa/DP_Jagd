window.JaegerBerichtPdfService = (() => {
  const W = 1588, H = 2246;

  function pdfAusBildern(bilder) {
    const encoder = new TextEncoder(), teile = [], offsets = [0]; let laenge = 0;
    const add = (value) => { const bytes = typeof value === "string" ? encoder.encode(value) : value; teile.push(bytes); laenge += bytes.length; };
    const object = (id, value) => { offsets[id] = laenge; add(`${id} 0 obj\n${value}\nendobj\n`); };
    const pageIds = bilder.map((_, index) => 3 + index * 3);
    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${bilder.length} >>`);
    bilder.forEach((bild, index) => {
      const page = pageIds[index], image = page + 1, content = page + 2;
      object(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im${index} ${image} 0 R >> >> /Contents ${content} 0 R >>`);
      offsets[image] = laenge;
      add(`${image} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bild.length} >>\nstream\n`);
      add(bild); add("\nendstream\nendobj\n");
      const stream = `q\n595.28 0 0 841.89 0 0 cm\n/Im${index} Do\nQ\n`;
      object(content, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
    });
    const xref = laenge, max = 2 + bilder.length * 3;
    add(`xref\n0 ${max + 1}\n0000000000 65535 f \n`);
    for (let id = 1; id <= max; id += 1) add(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    add(`trailer\n<< /Size ${max + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(teile, { type: "application/pdf" });
  }

  function cssText() {
    let css = "";
    [...document.styleSheets].forEach((sheet) => {
      try { [...sheet.cssRules].forEach((rule) => { css += `${rule.cssText}\n`; }); } catch (_) { /* externe Styles ignorieren */ }
    });
    return css;
  }

  async function seiteAlsJpeg(seite) {
    const clone = seite.cloneNode(true);
    clone.style.margin = "0"; clone.style.boxShadow = "none";
    const styles = cssText().replace(/\]\]>/g, "] ]>");
    const xhtml = `<div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${styles}]]></style>${clone.outerHTML}</div>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 794 1123"><foreignObject width="794" height="1123">${xhtml}</foreignObject></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Eine Berichtsseite konnte nicht gerendert werden.")); image.src = url; });
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      const context = canvas.getContext("2d", { alpha: false }); context.fillStyle = "#fff"; context.fillRect(0, 0, W, H);
      context.drawImage(image, 0, 0, W, H);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PDF-Seite konnte nicht erzeugt werden.")), "image/jpeg", .94));
      return new Uint8Array(await blob.arrayBuffer());
    } finally { URL.revokeObjectURL(url); }
  }

  async function erstellen(container) {
    if (document.fonts?.ready) await document.fonts.ready;
    const seiten = [...container.querySelectorAll(".jaegerbericht-sheet")];
    if (!seiten.length) throw new Error("Bitte zuerst einen Bericht anzeigen.");
    const bilder = [];
    for (const seite of seiten) bilder.push(await seiteAlsJpeg(seite));
    return pdfAusBildern(bilder);
  }
  function speichern(blob, dateiname) {
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = dateiname; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { erstellen, speichern };
})();
