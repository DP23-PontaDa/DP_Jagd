window.JagdJahr = (() => {
  const el = (id) => document.getElementById(id);
  const MONATE_1 = [[4,"MAI"],[5,"JUN"],[6,"JUL"],[7,"AUG"],[8,"SEP"],[9,"OKT"],[10,"NOV"],[11,"DEZ"]];
  const MONATE_2 = [[0,"JÄN"],[1,"FEB"],[2,"MÄR"],[3,"APR"]];
  const MIT_VORNAME = new Set(["bock a", "bock b", "hirsch a", "hirsch b", "hirsch b1"]);
  const HIRSCH_CODES = new Set(["HIRSCH_I","HIRSCH_II","HIRSCH_III","HIRSCH_A","HIRSCH_B","HIRSCH_B1"]);
  const HIRSCH_NAMEN = new Set(["hirsch i","hirsch ii","hirsch iii","hirsch a","hirsch b","hirsch b1"]);
  const REHBOCK_CODES = new Set(["REHBOCK_A","REHBOCK_B","BOCK_A","BOCK_B"]);
  const REHBOCK_NAMEN = new Set(["rehbock a","rehbock b","bock a","bock b"]);
  let jahr; const filter = new Set(); let daten = [];

  const relation = (wert) => Array.isArray(wert) ? wert[0] : wert;
  const normal = (wert) => String(wert || "").trim().toLocaleLowerCase("de");
  const codeNormal = (wert) => String(wert || "").trim().toLocaleUpperCase("de").replace(/[\s-]+/g,"_");
  const escapeHtml = (wert) => { const node=document.createElement("div"); node.textContent=wert??""; return node.innerHTML; };
  function fallbackKuerzel(name) { return String(name || "?").trim().split(/\s+/).map((teil) => teil[0] || "").join("").slice(0, 3).toUpperCase() || "?"; }
  function eintrag(abschuss) {
    const klasse=relation(abschuss.wildklasse), jaeger=relation(abschuss.jaeger);
    return { id:abschuss.id, nr:abschuss.nr, datum:abschuss.datum, tageszeit:abschuss.tageszeit,
      gruppe:relation(abschuss.wildgruppe)?.bezeichnung||"", klasse:klasse?.bezeichnung||"Unbekannt",
      kuerzel:klasse?.kuerzel?.trim()||fallbackKuerzel(klasse?.bezeichnung),
      vorname:MIT_VORNAME.has(normal(klasse?.bezeichnung)) ? jaeger?.vorname||"" : "",
      jaeger:[jaeger?.vorname,jaeger?.nachname].filter(Boolean).join(" "), fallwild:abschuss.fallwild===true,
      ort:relation(abschuss.erlegungsort)?.name||"" };
  }
  function passt(abschuss) {
    if(!filter.size) return true;
    const gruppe=normal(relation(abschuss.wildgruppe)?.bezeichnung);
    const gruppenFilterAktiv=filter.has("rehwild")||filter.has("rotwild")||filter.has("haar-federwild");
    const gruppePasst=(filter.has("rehwild")&&gruppe==="rehwild")||
      (filter.has("rotwild")&&gruppe==="rotwild")||
      (filter.has("haar-federwild")&&(gruppe.includes("haar")||gruppe.includes("feder")));
    if(!gruppenFilterAktiv) return filter.has("fallwild")&&abschuss.fallwild===true;
    if(!gruppePasst) return false;
    return filter.has("fallwild")||abschuss.fallwild!==true;
  }
  function istHirsch(abschuss) {
    const klasse=relation(abschuss.wildklasse)||{};
    return HIRSCH_CODES.has(codeNormal(klasse.code))||HIRSCH_NAMEN.has(normal(klasse.bezeichnung));
  }
  function hirschKlasse(abschuss) {
    const name=normal(relation(abschuss.wildklasse)?.bezeichnung);
    if(name==="hirsch b1")return "B1";
    if(name==="hirsch a")return "A";
    if(name==="hirsch b")return "B";
    if(name==="hirsch i")return "I";
    if(name==="hirsch ii")return "II";
    if(name==="hirsch iii")return "III";
    return relation(abschuss.wildklasse)?.bezeichnung||"–";
  }
  function istRehbock(abschuss) {
    const klasse=relation(abschuss.wildklasse)||{};
    return REHBOCK_CODES.has(codeNormal(klasse.code))||REHBOCK_NAMEN.has(normal(klasse.bezeichnung));
  }
  function rehbockKlasse(abschuss) {
    const klasse=relation(abschuss.wildklasse)||{},name=normal(klasse.bezeichnung),code=codeNormal(klasse.code);
    if(name==="rehbock a"||name==="bock a"||code==="REHBOCK_A"||code==="BOCK_A")return "A";
    if(name==="rehbock b"||name==="bock b"||code==="REHBOCK_B"||code==="BOCK_B")return "B";
    return klasse.bezeichnung||"–";
  }
  function hirschEintraege(fuerJahr) {
    return daten.filter((abschuss)=>Number(String(abschuss.datum||"").slice(0,4))===Number(fuerJahr)&&
      istHirsch(abschuss)&&passt(abschuss)).map((abschuss)=>{const jaeger=relation(abschuss.jaeger)||{};return{
        id:abschuss.id,nr:abschuss.nr,datum:abschuss.datum,klasse:hirschKlasse(abschuss),
        jaeger:[jaeger.vorname,jaeger.nachname].filter(Boolean).join(" ")||"–",
        alter:abschuss.alter==null?null:Number(abschuss.alter),fallwild:abschuss.fallwild===true,
        sonderabschuss:abschuss.sonderabschuss===true,
      };}).sort((a,b)=>String(a.datum).localeCompare(String(b.datum))||Number(a.nr||0)-Number(b.nr||0)||
        a.jaeger.localeCompare(b.jaeger,"de")||a.klasse.localeCompare(b.klasse,"de"));
  }
  function hirschGruppen(eintraege) {
    return {a:eintraege.filter((x)=>x.klasse==="A"),b:eintraege.filter((x)=>x.klasse==="B"||x.klasse==="B1"),
      weitere:eintraege.filter((x)=>!["A","B","B1"].includes(x.klasse))};
  }
  function rehbockEintraege() {
    return daten.filter((abschuss)=>Number(String(abschuss.datum||"").slice(0,4))===Number(jahr)&&
      istRehbock(abschuss)&&passt(abschuss)).map((abschuss)=>{const jaeger=relation(abschuss.jaeger)||{};return{
        id:abschuss.id,nr:abschuss.nr,datum:abschuss.datum,klasse:rehbockKlasse(abschuss),
        jaeger:[jaeger.vorname,jaeger.nachname].filter(Boolean).join(" ")||"–",
        alter:abschuss.alter==null?null:Number(abschuss.alter),fallwild:abschuss.fallwild===true,
        sonderabschuss:abschuss.sonderabschuss===true,
      };}).sort((a,b)=>String(a.datum).localeCompare(String(b.datum))||Number(a.nr||0)-Number(b.nr||0)||
        a.jaeger.localeCompare(b.jaeger,"de")||a.klasse.localeCompare(b.klasse,"de"));
  }
  function abschussListenSeitenDaten() {
    const hirsche=hirschGruppen(hirschEintraege(jahr)),rehboecke=rehbockEintraege();
    return [{typ:"hirsche",layout:"hirsch",titel:"HIRSCHABSCHÜSSE",jahr:Number(jahr),untertitel:"",linksTitel:"HIRSCH A",rechtsTitel:"HIRSCH B",...hirsche},
      {typ:"hirsche",titel:"REHBOCK-ABSCHÜSSE",jahr:Number(jahr),untertitel:"",linksTitel:"REHBOCK A",rechtsTitel:"REHBOCK B",
        leertext:"Keine Rehbock-Abschüsse vorhanden.",a:rehboecke.filter((x)=>x.klasse==="A"),b:rehboecke.filter((x)=>x.klasse==="B"),weitere:[]}];
  }
  function gruppiert() {
    const map=new Map(); daten.filter(passt).map(eintrag).sort((a,b)=>a.datum.localeCompare(b.datum)||
      ({frueh:0,abend:1}[a.tageszeit]??2)-({frueh:0,abend:1}[b.tageszeit]??2)||Number(a.nr)-Number(b.nr))
      .forEach((item)=>{const d=new Date(`${item.datum}T00:00:00`);const key=`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;const liste=map.get(key)||[];liste.push(item);map.set(key,liste);});
    return map;
  }
  function monate(liste){return liste.map(([monat,name])=>({monat,name,jahr:Number(jahr)}));}
  function abschussRaster(box, items) {
    for(let start=0;start<items.length;start+=3){
      const zeile=document.createElement("div");zeile.className="jagdjahr-eintragszeile";
      items.slice(start,start+3).forEach((item)=>{const button=document.createElement("button");button.type="button";button.className=`jagdjahr-eintrag${item.vorname?" has-name":" is-simple"}${item.fallwild?" is-fallwild":""}`;button.dataset.id=item.id;button.title=`Nr. ${item.nr} · ${item.klasse} · ${item.jaeger||"Kein Jäger"} · ${item.datum}${item.ort?` · ${item.ort}`:""}`;button.innerHTML=`<b>${escapeHtml(item.kuerzel)}</b>${item.vorname?`<small>${escapeHtml(item.vorname)}</small>`:""}`;zeile.appendChild(button);});
      box.appendChild(zeile);
    }
  }
  function namenEinpassen(container) {
    container.querySelectorAll(".jagdjahr-eintraege.has-multiple-names").forEach((box)=>{
      let kuerzel=10,vorname=8;
      const passt=()=>[...box.querySelectorAll(".jagdjahr-eintrag.has-name b, .jagdjahr-eintrag.has-name small")]
        .every((text)=>text.scrollWidth<=text.clientWidth+1);
      while(!passt()&&(kuerzel>8||vorname>7)){
        if(vorname>7)vorname-=.5;else if(kuerzel>8)kuerzel-=.5;
        box.style.setProperty("--jagdjahr-name-kuerzel",`${kuerzel}px`);
        box.style.setProperty("--jagdjahr-vorname",`${vorname}px`);
      }
    });
  }
  function seite(untertitel, monatsListe, map) {
    const section=document.createElement("section");section.className="jagdjahr-sheet";
    section.innerHTML=`<header><h2>JAGD JAHR</h2><strong>${jahr}</strong><p>${untertitel}</p></header>`;
    const table=document.createElement("table");table.className=`jagdjahr-calendar ${monatsListe.length===8?"acht-monate":"vier-monate"}`;
    const thead=document.createElement("thead"), hr=document.createElement("tr");
    monatsListe.forEach((m)=>{const th=document.createElement("th");th.textContent=m.name;hr.appendChild(th);});thead.appendChild(hr);table.appendChild(thead);
    const tbody=document.createElement("tbody");
    for(let tag=1;tag<=31;tag+=1){const tr=document.createElement("tr");monatsListe.forEach((m)=>{const td=document.createElement("td");const gueltig=tag<=new Date(m.jahr,m.monat+1,0).getDate();if(!gueltig){td.className="is-invalid";tr.appendChild(td);return;}td.innerHTML=`<span class="jagdjahr-tag">${tag}</span>`;const box=document.createElement("div"),items=map.get(`${m.jahr}-${m.monat+1}-${tag}`)||[],namenAnzahl=items.filter((item)=>item.vorname).length;box.className=`jagdjahr-eintraege${namenAnzahl?" has-names":""}${namenAnzahl>=2?" has-multiple-names":""}${items.length>3?" is-dense":""}${items.length>6?" is-very-dense":""}`;abschussRaster(box,items);td.appendChild(box);tr.appendChild(td);});tbody.appendChild(tr);}table.appendChild(tbody);section.appendChild(table);return section;
  }
  function hirschZeile(item,optionen={}) {
    const button=document.createElement("button");button.type="button";button.className=`jagdjahr-hirsch-row${optionen.ohneKlasse?" ohne-klasse":""}${item.fallwild?" is-fallwild":""}`;button.dataset.id=item.id;
    const datum=item.datum?`${item.datum.slice(8,10)}.${item.datum.slice(5,7)}${optionen.datumOhneEndpunkt?"":"."}`:"–";
    const status=[item.sonderabschuss?"S":"",item.fallwild?"FW":""].filter(Boolean).join("/");
    button.title=[item.jaeger,item.sonderabschuss?"Sonderabschuss":"",item.fallwild?"Fallwild":""].filter(Boolean).join(" · ");
    button.innerHTML=`${optionen.ohneKlasse?"":`<b>${escapeHtml(item.klasse)}</b>`}<time>${escapeHtml(datum)}</time><span>${escapeHtml(item.jaeger)}</span><em>${item.alter==null?"–":`${item.alter} J.`}</em>${status?`<small>${status}</small>`:""}`;
    return button;
  }
  function hirschBereich(titel,liste,optionen={}) {
    const section=document.createElement("section");section.className=`jagdjahr-hirsch-bereich${optionen.ohneKlasse?" ohne-klasse":""}`;
    section.innerHTML=`<h3>${titel}</h3><div class="jagdjahr-hirsch-columns">${optionen.ohneKlasse?"":"<b>Klasse</b>"}<b>Datum</b><b>Jäger</b><b>Alter</b><b></b></div>`;
    const rows=document.createElement("div");rows.className="jagdjahr-hirsch-list";
    liste.forEach((item)=>rows.appendChild(hirschZeile(item,optionen)));section.appendChild(rows);
    if(!liste.length){const leer=document.createElement("p");leer.className="jagdjahr-hirsch-list-empty";leer.textContent="Keine Einträge vorhanden.";section.appendChild(leer);}
    if(liste.length){const summe=document.createElement("div");summe.className="jagdjahr-hirsch-summe";
      if(optionen.getrennteSummen){const regulaer=liste.filter((item)=>item.fallwild!==true).length,fallwild=liste.filter((item)=>item.fallwild===true).length;
        summe.innerHTML=`<span>Abschuss: <b>${regulaer} Stk.</b></span><span>Fallwild: <b>${fallwild} Stk.</b></span>`;
      }else summe.textContent=`${liste.length} Stk.`;section.appendChild(summe);}
    return section;
  }
  function hirschSeite(seitenDaten) {
    const section=document.createElement("section");section.className=`jagdjahr-sheet jagdjahr-hirsch-sheet${seitenDaten.layout==="hirsch"?" is-hirsch-layout":""}`;
    section.innerHTML=`<header><h2>${escapeHtml(seitenDaten.titel||"HIRSCHABSCHÜSSE")}</h2><strong>${seitenDaten.jahr}</strong><p>${escapeHtml(seitenDaten.untertitel||"")}</p></header>`;
    const anzahl=seitenDaten.a.length+seitenDaten.b.length+seitenDaten.weitere.length;
    if(!anzahl){const leer=document.createElement("p");leer.className="jagdjahr-hirsch-empty";leer.textContent=seitenDaten.leertext||"Keine Hirschabschüsse vorhanden.";section.appendChild(leer);return section;}
    const grid=document.createElement("div");grid.className=`jagdjahr-hirsch-grid${Math.max(seitenDaten.a.length,seitenDaten.b.length)>36?" is-dense":""}`;
    const istHirschLayout=seitenDaten.layout==="hirsch";
    grid.append(hirschBereich(seitenDaten.linksTitel||"HIRSCH A",seitenDaten.a,{ohneKlasse:istHirschLayout,datumOhneEndpunkt:istHirschLayout,getrennteSummen:istHirschLayout}),
      hirschBereich(seitenDaten.rechtsTitel||"HIRSCH B",seitenDaten.b,{datumOhneEndpunkt:istHirschLayout,getrennteSummen:istHirschLayout}));
    if(seitenDaten.weitere.length){const weitere=hirschBereich("WEITERE HIRSCHE",seitenDaten.weitere,{datumOhneEndpunkt:istHirschLayout,getrennteSummen:istHirschLayout});weitere.classList.add("is-wide");grid.appendChild(weitere);}
    section.appendChild(grid);return section;
  }
  function rendern(){const map=gruppiert(),seiten=el("jjSeiten");seiten.innerHTML="";seiten.append(seite("Mai bis Dezember",monate(MONATE_1),map),seite("Jänner bis April",monate(MONATE_2),map),...abschussListenSeitenDaten().map(hirschSeite));requestAnimationFrame(()=>namenEinpassen(seiten));}
  async function laden(){el("jjFehler").hidden=true;try{daten=await JagdJahrService.abschuesse(jahr);rendern();}catch(error){console.error("Jagd Jahr laden:",error);el("jjFehler").textContent=error.message;el("jjFehler").hidden=false;}}
  function pdfDaten(){const map=gruppiert();return[{typ:"kalender",untertitel:"Mai bis Dezember",monate:monate(MONATE_1),eintraege:map},{typ:"kalender",untertitel:"Jänner bis April",monate:monate(MONATE_2),eintraege:map},...abschussListenSeitenDaten()];}
  async function pdf(oeffnen=false){const button=oeffnen?el("jjDrucken"):el("jjPdf"),text=button.textContent;button.disabled=true;button.textContent="Erstellt …";try{const blob=await JagdJahrPdfService.erstellen(jahr,pdfDaten());if(oeffnen)JagdJahrPdfService.oeffnen(blob);else JagdJahrPdfService.speichern(blob,`Jagd-Jahr-${jahr}.pdf`);}catch(error){AppFeedback.error(error.message);}finally{button.disabled=false;button.textContent=text;}}
  async function init(){A4PreviewZoom.create({scroll:document.querySelector(".jagdjahr-scroll"),pages:el("jjSeiten"),sheetSelector:".jagdjahr-sheet"});const jahre=await JagdJahrService.verfuegbareJahre();jahr=new Date().getFullYear();el("jjJahr").innerHTML=jahre.map((wert)=>`<option value="${wert}">${wert}</option>`).join("");el("jjJahr").value=jahr;el("jjJahr").addEventListener("change",(event)=>{jahr=Number(event.target.value);laden();});el("jjFilter").addEventListener("click",(event)=>{const button=event.target.closest("[data-filter]");if(!button)return;const wert=button.dataset.filter;if(wert==="alle")filter.clear();else if(filter.has(wert))filter.delete(wert);else filter.add(wert);el("jjFilter").querySelectorAll("button").forEach((item)=>{const aktiv=item.dataset.filter==="alle"?!filter.size:filter.has(item.dataset.filter);item.classList.toggle("active",aktiv);item.setAttribute("aria-pressed",String(aktiv));});rendern();});el("jjSeiten").addEventListener("click",(event)=>{const button=event.target.closest("[data-id]");if(!button)return;Router.pendingAbschussDetailId=button.dataset.id;Router.open("abschuss");});el("jjPdf").addEventListener("click",()=>pdf(false));el("jjDrucken").addEventListener("click",()=>pdf(true));await laden();}
  return { init };
})();
