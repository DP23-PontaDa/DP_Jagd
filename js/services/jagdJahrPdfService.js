const JagdJahrPdfService = (() => {
  const A4_BREITE = 1240;
  const A4_HOEHE = 1754;

  function jpegPdf(bilder) {
    const encoder = new TextEncoder();
    const teile = []; const offsets = [0]; let laenge = 0;
    const add = (wert) => { const bytes = typeof wert === "string" ? encoder.encode(wert) : wert; teile.push(bytes); laenge += bytes.length; };
    const objekt = (nr, inhalt) => { offsets[nr] = laenge; add(`${nr} 0 obj\n${inhalt}\nendobj\n`); };
    const pageIds = bilder.map((_, index) => 3 + index * 3);
    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    objekt(1, "<< /Type /Catalog /Pages 2 0 R >>");
    objekt(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${bilder.length} >>`);
    bilder.forEach((bild, index) => {
      const pageId = pageIds[index], imageId = pageId + 1, contentId = pageId + 2;
      objekt(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      offsets[imageId] = laenge;
      add(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${A4_BREITE} /Height ${A4_HOEHE} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bild.length} >>\nstream\n`);
      add(bild); add("\nendstream\nendobj\n");
      const content = `q\n595.28 0 0 841.89 0 0 cm\n/Im${index} Do\nQ\n`;
      objekt(contentId, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
    });
    const xref = laenge; const maxId = 2 + bilder.length * 3;
    add(`xref\n0 ${maxId + 1}\n0000000000 65535 f \n`);
    for (let id = 1; id <= maxId; id += 1) add(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    add(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(teile, { type: "application/pdf" });
  }

  function seiteZeichnen(jahr, untertitel, monate, eintraege, optionen = {}) {
    const canvas = document.createElement("canvas"); canvas.width = A4_BREITE; canvas.height = A4_HOEHE;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center"; ctx.fillStyle = "#243342"; ctx.font = "bold 38px Arial"; ctx.fillText(optionen.titel || "JAGD JAHR", 620, 55);
    ctx.font = "bold 26px Arial"; ctx.fillText(String(jahr), 620, 91);
    ctx.font = "20px Arial"; ctx.fillText(untertitel, 620, 122);
    const links = 35, oben = 150, rechts = 35, unten = 38;
    const breite = (canvas.width - links - rechts) / monate.length;
    const kopf = 38, hoehe = (canvas.height - oben - unten - kopf) / 31;
    ctx.strokeStyle = "#7b8790"; ctx.lineWidth = 1;
    monate.forEach((monat, spalte) => {
      const x = links + spalte * breite;
      ctx.fillStyle = "#243342"; ctx.fillRect(x, oben, breite, kopf);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 17px Arial"; ctx.fillText(monat.name, x + breite / 2, oben + 25);
      for (let tag = 1; tag <= 31; tag += 1) {
        const y = oben + kopf + (tag - 1) * hoehe;
        const gueltig = tag <= new Date(monat.jahr, monat.monat + 1, 0).getDate();
        ctx.fillStyle = gueltig ? "#fff" : "#f2f3f4"; ctx.fillRect(x, y, breite, hoehe);
        ctx.strokeRect(x, y, breite, hoehe);
        if (!gueltig) continue;
        ctx.textAlign = "left"; ctx.fillStyle = "#c1c7cb"; ctx.font = "12px Arial"; ctx.fillText(String(tag), x + 4, y + 13);
        const liste = eintraege.get(`${monat.jahr}-${monat.monat + 1}-${tag}`) || [];
        if (liste.length) {
          const max = 9, sichtbar = liste.slice(0, max);
          const zeilen = Math.ceil(sichtbar.length / 3), zeilenHoehe = Math.max(10, (hoehe - 4) / zeilen);
          const hatNamen = sichtbar.some((eintrag) => eintrag.vorname);
          const namenAnzahl = sichtbar.filter((eintrag) => eintrag.vorname).length;
          const kuerzelGroesse = hatNamen ? (namenAnzahl>=2?10:(zeilen>1?10:12)) : (zeilen > 2 ? 11 : 14);
          const namenGroesse = namenAnzahl>=2?8:(zeilen>1?7:9);
          const rasterHoehe = zeilen * zeilenHoehe;
          ctx.textAlign = "center";
          for(let start=0;start<sichtbar.length;start+=3){
            const rasterZeile=Math.floor(start/3),zeilenItems=sichtbar.slice(start,start+3),verfuegbar=breite-4;
            const wuensche=zeilenItems.map((eintrag)=>eintrag.vorname
              ?Math.max(30,Math.min(58,eintrag.vorname.length*namenGroesse*.58+5))
              :eintrag.lang?Math.max(30,Math.min(80,String(eintrag.anzeige||eintrag.kuerzel||"").length*6+5)):18);
            const gesamtWunsch=wuensche.reduce((summe,wert)=>summe+wert,0)+Math.max(0,zeilenItems.length-1)*2;
            const faktor=Math.min(1,verfuegbar/gesamtWunsch),gesamtBreite=gesamtWunsch*faktor;
            let entryX=x+(breite-gesamtBreite)/2;
            zeilenItems.forEach((eintrag,index)=>{
              const aktuelleBreite=wuensche[index]*faktor;
              const mitteX=entryX+aktuelleBreite/2;
              const entryY=y+(hoehe-rasterHoehe)/2+rasterZeile*zeilenHoehe;
              ctx.fillStyle=eintrag.fallwild?"#d97706":"#111";
              const anzeige=eintrag.anzeige||eintrag.kuerzel.slice(0,4),schrift=eintrag.lang?Math.min(10,Math.max(8,kuerzelGroesse)):eintrag.vorname?kuerzelGroesse:Math.max(13,kuerzelGroesse);
              ctx.font=`bold ${schrift}px Arial`;
              ctx.fillText(anzeige,mitteX,entryY+(eintrag.vorname?zeilenHoehe*.45:zeilenHoehe*.65),Math.max(12,aktuelleBreite-2));
              if(eintrag.vorname){ctx.font=`${namenGroesse}px Arial`;ctx.fillText(eintrag.vorname,mitteX,entryY+zeilenHoehe*.82,Math.max(18,aktuelleBreite-2));}
              entryX+=aktuelleBreite+2*faktor;
            });
          }
          if (liste.length > max) {
            ctx.textAlign = "right"; ctx.fillStyle = "#777"; ctx.font = "9px Arial";
            ctx.fillText(`+${liste.length - max}`, x + breite - 3, y + hoehe - 3);
          }
        }
      }
    });
    return new Promise((resolve, reject) => canvas.toBlob(async (blob) => blob
      ? resolve(new Uint8Array(await blob.arrayBuffer()))
      : reject(new Error("PDF-Seite konnte nicht erzeugt werden.")), "image/jpeg", 0.94));
  }

  function hirschSeiteZeichnen(seite) {
    const canvas=document.createElement("canvas");canvas.width=A4_BREITE;canvas.height=A4_HOEHE;
    const ctx=canvas.getContext("2d",{alpha:false});ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign="center";ctx.fillStyle="#243342";ctx.font="bold 38px Arial";ctx.fillText(seite.titel||"HIRSCHABSCHÜSSE",620,58);
    ctx.font="bold 27px Arial";ctx.fillText(String(seite.jahr),620,96);ctx.font="19px Arial";ctx.fillText(seite.untertitel||"",620,128);
    const anzahl=(seite.a||[]).length+(seite.b||[]).length+(seite.weitere||[]).length;
    if(!anzahl){ctx.fillStyle="#65737b";ctx.font="24px Arial";ctx.fillText(seite.leertext||"Keine Hirschabschüsse vorhanden.",620,300);return canvasBlob(canvas);}
    const links=55,abstand=45,spaltenBreite=(A4_BREITE-links*2-abstand)/2,oben=175;
    const maxHaupt=Math.max((seite.a||[]).length,(seite.b||[]).length,1);
    const hatWeitere=(seite.weitere||[]).length>0;
    const hauptHoehe=hatWeitere?Math.min(760,Math.max(360,maxHaupt*31+100)):A4_HOEHE-oben-65;
    const zeilenHoehe=Math.max(20,Math.min(31,(hauptHoehe-80)/maxHaupt));
    function text(text,x,y,maxBreite,align="left",font="18px Arial",farbe="#18232a"){
      ctx.textAlign=align;ctx.font=font;ctx.fillStyle=farbe;ctx.fillText(String(text??""),x,y,maxBreite);
    }
    function bereich(titel,liste,x,y,breite,maxHoehe){
      text(titel,x,y,breite,"left","bold 27px Arial","#243342");ctx.strokeStyle="#5e6b74";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+12);ctx.lineTo(x+breite,y+12);ctx.stroke();
      const c1=x+8,c2=x+82,c3=x+190,c4=x+breite-60,c5=x+breite-15;
      text("Klasse",c1,y+42,65,"left","bold 13px Arial","#71808a");text("Datum",c2,y+42,90,"left","bold 13px Arial","#71808a");text("Jäger",c3,y+42,breite-270,"left","bold 13px Arial","#71808a");text("Alter",c4,y+42,55,"right","bold 13px Arial","#71808a");
      const rowH=Math.max(18,Math.min(zeilenHoehe,(maxHoehe-65)/Math.max(liste.length,1)));
      liste.forEach((item,index)=>{const ry=y+67+index*rowH,farbe=item.fallwild?"#b96100":"#18232a";ctx.strokeStyle="#d9dddf";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,ry+6);ctx.lineTo(x+breite,ry+6);ctx.stroke();
        const dat=item.datum?`${item.datum.slice(8,10)}.${item.datum.slice(5,7)}.`:"–";
        text(item.klasse,c1,ry,60,"left","bold 18px Arial","#243342");text(dat,c2,ry,95,"left","17px Arial",farbe);text(item.jaeger,c3,ry,breite-285,"left","17px Arial",farbe);text(item.alter==null?"–":`${item.alter} J.`,c4,ry,60,"right","bold 17px Arial",farbe);
        const status=[item.sonderabschuss?"S":"",item.fallwild?"F":""].filter(Boolean).join("/");if(status)text(status,c5,ry,35,"center","bold 13px Arial","#8a5b18");});
      if(liste.length)text(`${liste.length} Stk.`,x+breite,y+Math.min(maxHoehe-4,72+liste.length*rowH),100,"right","14px Arial","#596770");
      else text("Keine Einträge vorhanden.",x+8,y+78,breite-16,"left","16px Arial","#65737b");
    }
    bereich(seite.linksTitel||"HIRSCH A",seite.a||[],links,oben,spaltenBreite,hauptHoehe);
    bereich(seite.rechtsTitel||"HIRSCH B",seite.b||[],links+spaltenBreite+abstand,oben,spaltenBreite,hauptHoehe);
    if(hatWeitere){const y=oben+hauptHoehe+35;bereich("WEITERE HIRSCHE",seite.weitere||[],links,y,A4_BREITE-links*2,A4_HOEHE-y-45);}
    return canvasBlob(canvas);
  }

  function canvasBlob(canvas) {
    return new Promise((resolve,reject)=>canvas.toBlob(async(blob)=>blob
      ?resolve(new Uint8Array(await blob.arrayBuffer()))
      :reject(new Error("PDF-Seite konnte nicht erzeugt werden.")),"image/jpeg",.94));
  }

  async function erstellen(jahr, seiten, optionen = {}) {
    const bilder = [];
    for (const seite of seiten) bilder.push(seite.typ==="hirsche"
      ?await hirschSeiteZeichnen(seite)
      :await seiteZeichnen(jahr, seite.untertitel, seite.monate, seite.eintraege, optionen));
    return jpegPdf(bilder);
  }

  function speichern(blob, dateiname) {
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = dateiname; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function oeffnen(blob) {
    const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  return { erstellen, speichern, oeffnen };
})();
