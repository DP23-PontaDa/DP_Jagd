window.JaegerBericht = (() => {
  const el = (id) => document.getElementById(id);
  const relation = (value) => Array.isArray(value) ? value[0] : value;
  const esc = (value) => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; };
  const datum = (value) => value ? new Intl.DateTimeFormat("de-AT").format(new Date(`${value}T12:00:00`)) : "–";
  const norm = (value) => String(value || "").trim().toLocaleLowerCase("de");
  let daten = null;

  function zeitraumText(){return daten.vonJahr===daten.bisJahr?String(daten.vonJahr):`${daten.vonJahr} – ${daten.bisJahr}`;}

  function kopf(titel) {
    return `<header class="jaegerbericht-head"><div class="jb-headline"><b>DP JAGD</b><em>|</em><span>JÄGERDATENBLATT</span><em>|</em><strong>${esc(daten.jaeger.vorname)} ${esc(daten.jaeger.nachname)}</strong></div><span>Berichtszeitraum: ${esc(zeitraumText())}</span></header>${titel?`<h2>${esc(titel)}</h2>`:""}`;
  }
  function fuss() { return `<footer class="jaegerbericht-foot"><span>Erstellt am ${new Intl.DateTimeFormat("de-AT").format(daten.erstelltAm)}</span><span class="jb-page-number"></span></footer>`; }
  function seite(titel, html, klasse = "") {
    const section = document.createElement("section"); section.className = `jaegerbericht-sheet ${klasse}`;
    section.innerHTML = `${kopf(titel)}<div class="jaegerbericht-content">${html}</div>${fuss()}`;
    return section;
  }
  function tabelle(spalten, rows, leertext = "Keine Einträge im Berichtszeitraum.") {
    if (!rows.length) return `<p class="jb-empty">${esc(leertext)}</p>`;
    return `<table class="jb-table"><thead><tr>${spalten.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((x) => `<td>${x ?? "–"}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  function wildklasse(row) { return relation(row.wildklassen || row.wildklasse)?.bezeichnung || "–"; }
  function wildgruppe(row) { return relation(row.wildgruppen)?.bezeichnung || "–"; }
  function ort(row) { return daten.ortName(row); }
  function abschnitt(titel, inhalt) { return `<section class="jb-section"><h3>${esc(titel)}</h3>${inhalt}</section>`; }
  function fortsetzungsSeiten(seitenTitel, abschnittTitel, spalten, rows, start, chunk = 24) {
    const seiten = [];
    for (let index = start; index < rows.length; index += chunk) {
      seiten.push(seite(`${seitenTitel} – FORTSETZUNG`, abschnitt(abschnittTitel,
        tabelle(spalten, rows.slice(index, index + chunk)))));
    }
    return seiten;
  }

  function profilSeite() {
    const k = daten.kennzahlen;
    const hirschA = daten.freigaben.find((row) => norm(row.wildklasse.bezeichnung)==="hirsch a"&&row.status==="FREI");
    const kw = daten.kahlwildStatus;
    const gruppen=daten.wildgruppenStatistik.map((gruppe)=>`<section class="jb-wildgruppe"><header><strong>${esc(gruppe.wildgruppe)}</strong><b>${gruppe.anzahl}</b></header><div>${gruppe.wildklassen.map((klasse)=>`<span>${esc(klasse.wildklasse)} <b>${klasse.anzahl}</b></span>`).join("")}</div></section>`).join("");
    return seite("", `
      <div class="jb-profile"><h3>${esc(daten.jaeger.vorname)} ${esc(daten.jaeger.nachname)}</h3><p>Berichtszeitraum ${esc(zeitraumText())}</p></div>
      <div class="jb-kpis">${[["Abschüsse",k.abschuesse],["Kahlwild",k.kahlwild],["Hirsche",k.hirsche],["Nachsuchen",k.nachsuchen]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong><small>Stk.</small></div>`).join("")}</div>
      ${gruppen?abschnitt("Abschüsse nach Wildgruppen",`<div class="jb-wildgruppen">${gruppen}</div>`):""}
      <div class="jb-status-grid">
        ${hirschA?`<section class="jb-highlight"><h3>AKTUELLE FREIGABE</h3><strong>Hirsch A</strong><b>${esc(hirschA.freigabejahr || "–")}</b></section>`:""}
        ${Number(kw?.offen||0)>0?`<section class="jb-highlight"><h3>KAHLWILDPFLICHT</h3><dl><dt>Pflicht</dt><dd>${Number(kw?.pflicht || 0) + Number(kw?.uebertrag || 0)} Stk.</dd><dt>Erlegt/angerechnet</dt><dd>${Number(kw?.angerechnet || 0)} Stk.</dd><dt>Noch offen</dt><dd class="offen">${Number(kw.offen)} Stk.</dd></dl></section>`:""}
      </div>
      ${k.sonderabschuesse ? abschnitt("Sonderabschüsse", `<p><strong>${k.sonderabschuesse} Stk.</strong> – ohne personenbezogene Wirkung auf Freigabe und Kahlwildpflicht.</p>`) : ""}
    `, "jb-cover");
  }

  function abschussSeite() {
    const statistik = tabelle(jahresSpalten(), jahresStatistikRows().slice(0,8));
    const details=tabelle(abschussDetailSpalten(),abschussDetailRows().slice(0,14),"Keine Abschüsse im Berichtszeitraum.");
    return seite("ABSCHÜSSE", `${abschnitt("Abschüsse pro Jahr",statistik)}${abschnitt("Detaillierte Abschüsse",details)}`);
  }
  function jahresGruppen(){return daten.wildgruppenStatistik.map((row)=>row.wildgruppe);}
  function jahresSpalten(){return["Jahr","Kahlwild","Hirsch A","Hirsch B/B1",...jahresGruppen(),"Fallwild"];}
  function jahresStatistikRows(){return daten.jahresWildgruppen.map((row)=>[row.jahr,row.kahlwild,row.hirschA,row.hirschB,...jahresGruppen().map((gruppe)=>row.gruppen[gruppe]||0),row.fallwild]);}
  function hatAltersWildklasse(){return daten.abschuesse.some((row)=>AbschussAlter.istRelevant(row));}
  function abschussDetailSpalten(){return["Datum","Wildgruppe","Wildklasse",...(hatAltersWildklasse()?["Alter"]:[]),"Ort","Gewicht","Status"];}
  function abschussDetailRows(){const mitAlter=hatAltersWildklasse();return daten.abschuesse.map((row)=>[datum(row.datum),esc(wildgruppe(row)),esc(wildklasse(row)),...(mitAlter?[AbschussAlter.istRelevant(row)&&row.alter!=null?`${Number(row.alter)} Jahre`:"–"]:[]),esc(ort(row)),row.gewicht!=null?`${Number(row.gewicht).toLocaleString("de-AT")} kg`:"–",row.sonderabschuss?'<span class="jb-badge">Sonderabschuss</span>':row.fallwild?'<span class="jb-badge">Fallwild</span>':"normal"]);}
  function abschussFortsetzungen() {
    return [...fortsetzungsSeiten("ABSCHÜSSE","Abschüsse pro Jahr",jahresSpalten(),jahresStatistikRows(),8),
      ...fortsetzungsSeiten("ABSCHÜSSE","Detaillierte Abschüsse",abschussDetailSpalten(),abschussDetailRows(),14)];
  }

  function freigabenSeite() {
    const regeln = tabelle(["Wildklasse","Regulär","Vorgezogen / individuell","Status","Nächste Freigabe"], daten.freigaben
      .filter((row)=>norm(row.wildklasse.bezeichnung).startsWith("hirsch"))
      .map((row)=>{
        const erfuellt=row.erfuellte_vorziehungen?.[0];
        const individuell=row.ausnahme ? `${row.ausnahme.freigabejahr || "–"}${row.ausnahme.bemerkung ? ` – ${row.ausnahme.bemerkung}` : ""}`
          : erfuellt ? `erfüllt (${String(erfuellt.abschuss?.datum || "").slice(0,4) || "–"})` : "–";
        return [esc(row.wildklasse.bezeichnung),esc(row.regulaeres_freigabejahr || "–"),esc(individuell),`<span class="${row.status === "FREI" ? "ok" : "offen"}">${esc(row.status)}</span>`,esc(row.freigabejahr || "–")];
      }));
    const kwRows=kahlwildDetailRows();const kw=kwRows.length?tabelle(["Jahr","Pflicht","Erlegt","Offen","Status"],kwRows.slice(0,18)):"";
    return seite("ABSCHUSSREGELN & FREIGABEN", `${abschnitt("Aktuelle Abschussregeln",regeln)}${kw?abschnitt("Kahlwildpflicht Detail",kw):""}`);
  }
  function kahlwildDetailRows(){return daten.kahlwildJahre.filter((row)=>Number(row.offen||0)>0).map((row)=>[
    row.jahr,Number(row.pflicht||0)+Number(row.uebertrag||0),Number(row.angerechnet||0),Number(row.offen||0),row.freigegeben?'<span class="ok">✓ Erfüllt</span>':'<span class="offen">Offen</span>']);}
  function freigabenFortsetzungen(){return fortsetzungsSeiten("ABSCHUSSREGELN & FREIGABEN","Kahlwildpflicht Detail",["Jahr","Pflicht","Erlegt","Offen","Status"],kahlwildDetailRows(),18);}

  function aktivitaetenSeite() {
    const nachsuchen = tabelle(["Datum","Ort","Wild","Ergebnis","Bemerkung"],aktivitaetsRows().nachsuchen.slice(0,7),"Keine Nachsuchen.");
    const probe = tabelle(["Datum","Ort","Art","Bemerkung"],aktivitaetsRows().probe.slice(0,7),"Keine Probeschüsse.");
    const fehl = tabelle(["Datum","Ort","Wild","Bemerkung"],aktivitaetsRows().fehl.slice(0,7),"Keine Fehlschüsse.");
    return seite("NACHSUCHEN & SCHÜSSE",`${abschnitt("Nachsuchen",nachsuchen)}${abschnitt("Probeschüsse",probe)}${abschnitt("Fehlschüsse",fehl)}`);
  }
  function aktivitaetsRows(){return{
    nachsuchen:daten.nachsuchen.map((row)=>[datum(row.datum),esc(ort(row)),esc(wildklasse(row)),row.wild_gefunden?"gefunden":"nicht gefunden",esc(row.info||"–")]),
    probe:daten.probeschuesse.map((row)=>[datum(row.datum),esc(ort(row)),"Probeschuss",esc(row.info||"–")]),
    fehl:daten.fehlschuesse.map((row)=>[datum(row.datum),esc(ort(row)),esc([wildgruppe(row),wildklasse(row)].filter((x)=>x!=="–").join(" – ")||"–"),esc(row.info||"–")])};}
  function aktivitaetsFortsetzungen(){const rows=aktivitaetsRows();return[
    ...fortsetzungsSeiten("NACHSUCHEN & SCHÜSSE","Nachsuchen",["Datum","Ort","Wild","Ergebnis","Bemerkung"],rows.nachsuchen,7),
    ...fortsetzungsSeiten("NACHSUCHEN & SCHÜSSE","Probeschüsse",["Datum","Ort","Art","Bemerkung"],rows.probe,7),
    ...fortsetzungsSeiten("NACHSUCHEN & SCHÜSSE","Fehlschüsse",["Datum","Ort","Wild","Bemerkung"],rows.fehl,7)];}

  function journalSeite() {
    const stp = tabelle(["Datum","Kategorie","Titel","Personen"],journalRows().slice(0,20),"Keine Einträge aus St. Peter/Mitterberg.");
    return seite("WEITERE AKTIVITÄTEN",abschnitt("St. Peter/Mitterberg",stp));
  }
  function journalRows(){return daten.stPeter.map((row)=>[datum(row.datum),esc(relation(row.kategorie)?.bezeichnung||"–"),esc(row.titel||"–"),esc(row.weitere_personen||"–")]);}
  function journalFortsetzungen(){return fortsetzungsSeiten("WEITERE AKTIVITÄTEN","St. Peter/Mitterberg",["Datum","Kategorie","Titel","Personen"],journalRows(),20);}

  function rendern() {
    const container = el("jbSeiten"); container.innerHTML = "";
    const seiten=[profilSeite(),abschussSeite(),...abschussFortsetzungen(),freigabenSeite(),...freigabenFortsetzungen()];
    if(daten.nachsuchen.length||daten.probeschuesse.length||daten.fehlschuesse.length)seiten.push(aktivitaetenSeite(),...aktivitaetsFortsetzungen());
    if(daten.stPeter.length)seiten.push(journalSeite(),...journalFortsetzungen());
    container.append(...seiten);
    [...container.children].forEach((page,index,list)=>{page.querySelector(".jb-page-number").textContent=`Seite ${index+1} / ${list.length}`;});
  }
  function dateiname() { const clean=(value)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,""); const zeitraum=daten.vonJahr===daten.bisJahr?daten.vonJahr:`${daten.vonJahr}-${daten.bisJahr}`;return `DP_Jagd_Jaegerdatenblatt_${clean(daten.jaeger.nachname)}_${clean(daten.jaeger.vorname)}_${zeitraum}.pdf`; }
  async function anzeigen() {
    const jaegerId=el("jbJaeger").value; if(!jaegerId){AppFeedback.error("Bitte einen Jäger auswählen.");return;}
    const von=Number(el("jbVonJahr").value),bis=Number(el("jbBisJahr").value);if(von>bis){AppFeedback.error("Das Startjahr darf nicht größer als das Endjahr sein.");return;}
    const button=el("jbAnzeigen"); button.disabled=true; el("jbStatus").hidden=false;el("jbStatus").textContent="Jägerdatenblatt wird geladen …";
    try { daten=await JaegerBerichtService.laden(jaegerId,von,bis);rendern();el("jbStatus").textContent="";el("jbStatus").hidden=true;el("jbPdf").disabled=false;el("jbDrucken").disabled=false; }
    catch(error){console.error("Jägerdatenblatt:",error);el("jbStatus").hidden=false;el("jbStatus").textContent=error.message;AppFeedback.error(error.message);} finally{button.disabled=false;}
  }
  async function pdf() { const button=el("jbPdf"),text=button.textContent;button.disabled=true;button.textContent="Erstellt …";try{const blob=await JaegerBerichtPdfService.erstellen(el("jbSeiten"));JaegerBerichtPdfService.speichern(blob,dateiname());}catch(error){console.error("Jägerdatenblatt PDF:",error);AppFeedback.error(error.message);}finally{button.disabled=false;button.textContent=text;} }
  async function init() {
    A4PreviewZoom.create({scroll:document.querySelector(".jaegerbericht-scroll"),pages:el("jbSeiten"),sheetSelector:".jaegerbericht-sheet"});
    const [jaeger,jahre]=await Promise.all([JaegerBerichtService.jaegerLaden(),JaegerBerichtService.jahreLaden()]);
    el("jbJaeger").innerHTML='<option value="">Jäger auswählen</option>'+jaeger.map((row)=>`<option value="${row.id}">${esc(`${row.vorname||""} ${row.nachname||""}`.trim())}</option>`).join("");
    const optionen=jahre.map((jahr)=>`<option value="${jahr}">${jahr}</option>`).join("");el("jbVonJahr").innerHTML=optionen;el("jbBisJahr").innerHTML=optionen;
    const aktuell=new Date().getFullYear();el("jbVonJahr").value=String(aktuell);el("jbBisJahr").value=String(aktuell);
    const auswahlGeaendert=()=>{el("jbPdf").disabled=true;el("jbDrucken").disabled=true;daten=null;if(el("jbSeiten").children.length){el("jbStatus").hidden=false;el("jbStatus").textContent="Auswahl geändert – bitte Bericht erneut anzeigen.";}};
    const zeitraumAktualisieren=()=>{const von=Number(el("jbVonJahr").value),bis=Number(el("jbBisJahr").value);el("jbZeitraum").textContent=`Berichtszeitraum: ${von===bis?von:`${von} – ${bis}`}`;auswahlGeaendert();};
    el("jbVonJahr").addEventListener("change",zeitraumAktualisieren);el("jbBisJahr").addEventListener("change",zeitraumAktualisieren);el("jbJaeger").addEventListener("change",auswahlGeaendert);zeitraumAktualisieren();
    el("jbAnzeigen").addEventListener("click",anzeigen);el("jbPdf").addEventListener("click",pdf);el("jbDrucken").addEventListener("click",()=>window.print());
  }
  return {init};
})();
