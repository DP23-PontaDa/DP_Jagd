window.JagdJahr = (() => {
  const el = (id) => document.getElementById(id);
  const MONATE_1 = [[4,"MAI"],[5,"JUN"],[6,"JUL"],[7,"AUG"],[8,"SEP"],[9,"OKT"],[10,"NOV"],[11,"DEZ"]];
  const MONATE_2 = [[0,"JÄN"],[1,"FEB"],[2,"MÄR"],[3,"APR"]];
  const MIT_VORNAME = new Set(["bock a", "bock b", "hirsch a", "hirsch b", "hirsch b1"]);
  let jahr; const filter = new Set(); let daten = [];

  const relation = (wert) => Array.isArray(wert) ? wert[0] : wert;
  const normal = (wert) => String(wert || "").trim().toLocaleLowerCase("de");
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
  function rendern(){const map=gruppiert(),seiten=el("jjSeiten");seiten.innerHTML="";seiten.append(seite("Mai bis Dezember",monate(MONATE_1),map),seite("Jänner bis April",monate(MONATE_2),map));requestAnimationFrame(()=>namenEinpassen(seiten));}
  async function laden(){el("jjFehler").hidden=true;try{daten=await JagdJahrService.abschuesse(jahr);rendern();}catch(error){console.error("Jagd Jahr laden:",error);el("jjFehler").textContent=error.message;el("jjFehler").hidden=false;}}
  function pdfDaten(){const map=gruppiert();return[{untertitel:"Mai bis Dezember",monate:monate(MONATE_1),eintraege:map},{untertitel:"Jänner bis April",monate:monate(MONATE_2),eintraege:map}];}
  async function pdf(oeffnen=false){const button=oeffnen?el("jjDrucken"):el("jjPdf"),text=button.textContent;button.disabled=true;button.textContent="Erstellt …";try{const blob=await JagdJahrPdfService.erstellen(jahr,pdfDaten());if(oeffnen)JagdJahrPdfService.oeffnen(blob);else JagdJahrPdfService.speichern(blob,`Jagd-Jahr-${jahr}.pdf`);}catch(error){AppFeedback.error(error.message);}finally{button.disabled=false;button.textContent=text;}}
  async function init(){const jahre=await JagdJahrService.verfuegbareJahre();jahr=new Date().getFullYear();el("jjJahr").innerHTML=jahre.map((wert)=>`<option value="${wert}">${wert}</option>`).join("");el("jjJahr").value=jahr;el("jjJahr").addEventListener("change",(event)=>{jahr=Number(event.target.value);laden();});el("jjFilter").addEventListener("click",(event)=>{const button=event.target.closest("[data-filter]");if(!button)return;const wert=button.dataset.filter;if(wert==="alle")filter.clear();else if(filter.has(wert))filter.delete(wert);else filter.add(wert);el("jjFilter").querySelectorAll("button").forEach((item)=>{const aktiv=item.dataset.filter==="alle"?!filter.size:filter.has(item.dataset.filter);item.classList.toggle("active",aktiv);item.setAttribute("aria-pressed",String(aktiv));});rendern();});el("jjSeiten").addEventListener("click",(event)=>{const button=event.target.closest("[data-id]");if(!button)return;Router.pendingAbschussDetailId=button.dataset.id;Router.open("abschuss");});el("jjPdf").addEventListener("click",()=>pdf(false));el("jjDrucken").addEventListener("click",()=>pdf(true));await laden();}
  return { init };
})();
