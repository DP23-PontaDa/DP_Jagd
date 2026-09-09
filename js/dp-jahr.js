window.DpJahr = (() => {
  const el = (id) => document.getElementById(id);
  const relation = (wert) => Array.isArray(wert) ? wert[0] : wert;
  const MONATE_1 = [[4,"MAI"],[5,"JUN"],[6,"JUL"],[7,"AUG"],[8,"SEP"],[9,"OKT"],[10,"NOV"],[11,"DEZ"]];
  const MONATE_2 = [[0,"JÄN"],[1,"FEB"],[2,"MÄR"],[3,"APR"]];
  let jahr = new Date().getFullYear(), daten = [], nurAnsitz = false, hashtag = "";
  const artIds = new Set();
  const normal = (wert) => String(wert || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
  const hashtagNormal = (wert) => normal(wert).replace(/^#+/, "");
  const escapeHtml = (wert) => { const node = document.createElement("div"); node.textContent = wert ?? ""; return node.innerHTML; };
  const artVon = (row) => relation(row.art);

  function artText(row) {
    const art = artVon(row)?.bezeichnung || "Unbekannt";
    if (normal(art) !== "ansitz" || !row.uhrzeit) return art;
    return String(row.uhrzeit).slice(0, 5) < "12:00" ? "F" : "A";
  }

  function hatHashtag(row, gesucht) {
    if (!gesucht) return true;
    return (row.hashtags || []).some((zuordnung) => {
      const tag = relation(zuordnung.hashtag);
      return hashtagNormal(tag?.normalisiert || tag?.bezeichnung) === gesucht;
    });
  }

  function gefilterteDaten() {
    const gesucht = hashtagNormal(hashtag);
    return daten.filter((row) => {
      const art = artVon(row), artName = normal(art?.bezeichnung);
      if (nurAnsitz && artName !== "ansitz" && artName !== "pirsch") return false;
      if (artIds.size && !artIds.has(String(row.art_id || art?.id))) return false;
      return hatHashtag(row, gesucht);
    });
  }

  function eintrag(row) {
    const art = artVon(row)?.bezeichnung || "Unbekannt", anzeige = artText(row);
    const ort = relation(row.ort_stammdaten)?.name || row.ort_freitext || "";
    return { id:row.id, datum:row.datum, uhrzeit:row.uhrzeit, kuerzel:anzeige, anzeige,
      lang:anzeige.length > 2, fallwild:false,
      title:[row.datum,row.uhrzeit?String(row.uhrzeit).slice(0,5):"",art,row.titel,ort,row.beschreibung].filter(Boolean).join(" · ") };
  }

  function gruppiert() {
    const map = new Map();
    gefilterteDaten().map(eintrag).sort((a,b) => a.datum.localeCompare(b.datum)
      || String(a.uhrzeit || "99:99").localeCompare(String(b.uhrzeit || "99:99"))
      || a.title.localeCompare(b.title,"de")).forEach((item) => {
      const datum = new Date(`${item.datum}T00:00:00`), key = `${datum.getFullYear()}-${datum.getMonth()+1}-${datum.getDate()}`;
      const liste = map.get(key) || []; liste.push(item); map.set(key, liste);
    });
    return map;
  }

  const monate = (liste) => liste.map(([monat,name]) => ({ monat,name,jahr:Number(jahr) }));
  function raster(box, items) {
    for (let start=0; start<items.length; start+=3) {
      const zeile=document.createElement("div"); zeile.className="jagdjahr-eintragszeile";
      items.slice(start,start+3).forEach((item) => {
        const button=document.createElement("button"); button.type="button";
        button.className=`jagdjahr-eintrag dp-jahr-eintrag ${item.lang?"is-long":"is-simple"}`;
        button.dataset.id=item.id; button.title=item.title; button.innerHTML=`<b>${escapeHtml(item.anzeige)}</b>`; zeile.appendChild(button);
      }); box.appendChild(zeile);
    }
  }

  function seite(untertitel, monatsListe, map) {
    const section=document.createElement("section"); section.className="jagdjahr-sheet";
    section.innerHTML=`<header><h2>DP JAHR</h2><strong>${jahr}</strong><p>${untertitel}</p></header>`;
    const table=document.createElement("table"); table.className=`jagdjahr-calendar ${monatsListe.length===8?"acht-monate":"vier-monate"}`;
    const thead=document.createElement("thead"), kopf=document.createElement("tr");
    monatsListe.forEach((monat) => { const th=document.createElement("th"); th.textContent=monat.name; kopf.appendChild(th); });
    thead.appendChild(kopf); table.appendChild(thead); const tbody=document.createElement("tbody");
    for (let tag=1; tag<=31; tag+=1) {
      const tr=document.createElement("tr"); monatsListe.forEach((monat) => {
        const td=document.createElement("td"), gueltig=tag<=new Date(monat.jahr,monat.monat+1,0).getDate();
        if (!gueltig) { td.className="is-invalid"; tr.appendChild(td); return; }
        td.innerHTML=`<span class="jagdjahr-tag">${tag}</span>`; const box=document.createElement("div");
        const items=map.get(`${monat.jahr}-${monat.monat+1}-${tag}`)||[];
        box.className=`jagdjahr-eintraege${items.length>3?" is-dense":""}${items.length>6?" is-very-dense":""}`;
        raster(box,items); td.appendChild(box); tr.appendChild(td);
      }); tbody.appendChild(tr);
    }
    table.appendChild(tbody); section.appendChild(table); return section;
  }

  function seitenDaten() {
    const map=gruppiert();
    return [{untertitel:"Mai bis Dezember",monate:monate(MONATE_1),eintraege:map},
      {untertitel:"Jänner bis April",monate:monate(MONATE_2),eintraege:map}];
  }
  function rendern() {
    const container=el("dpjSeiten"); container.innerHTML="";
    seitenDaten().forEach((seiteDaten) => container.appendChild(seite(seiteDaten.untertitel,seiteDaten.monate,seiteDaten.eintraege)));
  }
  function artOptionen() {
    const arten=new Map(); daten.forEach((row) => { const art=artVon(row); if (art?.id) arten.set(String(art.id),art.bezeichnung); });
    [...artIds].forEach((id) => { if (!arten.has(id)) artIds.delete(id); });
    el("dpjArt").innerHTML=[...arten.entries()].sort((a,b)=>a[1].localeCompare(b[1],"de"))
      .map(([id,name])=>`<label><input type="checkbox" value="${escapeHtml(id)}"${artIds.has(id)?" checked":""}> <span>${escapeHtml(name)}</span></label>`).join("");
    artZusammenfassung(arten);
  }
  function artZusammenfassung(arten = null) {
    const namen=arten?[...artIds].map((id)=>arten.get(id)).filter(Boolean):[...el("dpjArt").querySelectorAll("input:checked")].map((input)=>input.nextElementSibling?.textContent).filter(Boolean);
    el("dpjArtSummary").textContent=!namen.length?"Alle":namen.length<=2?namen.join(", "):`${namen.length} Arten`;
  }
  async function laden() {
    el("dpjFehler").hidden=true;
    try { daten=await TagebuchDpService.jahresEintraege(jahr); artOptionen(); rendern(); }
    catch(error) { console.error("DP Jahr:",error); el("dpjFehler").textContent=error.message; el("dpjFehler").hidden=false; }
  }
  function ansitzStatus() {
    el("dpjAnsitz").classList.toggle("active",nurAnsitz); el("dpjAnsitz").setAttribute("aria-pressed",String(nurAnsitz));
    el("dpjAnsitz").textContent=nurAnsitz?"Ansitz ✓":"Ansitz";
  }
  function reset() {
    nurAnsitz=false; artIds.clear(); hashtag=""; el("dpjArt").querySelectorAll("input").forEach((input)=>{input.checked=false;});
    el("dpjArtSummary").textContent="Alle"; el("dpjHashtag").value=""; ansitzStatus(); rendern();
  }
  async function pdf() {
    const button=el("dpjPdf"), text=button.textContent; button.disabled=true; button.textContent="Erstellt …";
    try { const blob=await JagdJahrPdfService.erstellen(jahr,seitenDaten(),{titel:"DP JAHR"}); JagdJahrPdfService.speichern(blob,`DP-Jahr-${jahr}.pdf`); }
    catch(error) { AppFeedback.error(error.message); } finally { button.disabled=false; button.textContent=text; }
  }
  async function init() {
    const jahre=await TagebuchDpService.verfuegbareJahre(); el("dpjJahr").innerHTML=jahre.map((wert)=>`<option value="${wert}">${wert}</option>`).join(""); el("dpjJahr").value=jahr;
    el("dpjJahr").addEventListener("change",(event)=>{jahr=Number(event.target.value);laden();});
    el("dpjAnsitz").addEventListener("click",()=>{nurAnsitz=!nurAnsitz;ansitzStatus();rendern();});
    el("dpjArt").addEventListener("change",(event)=>{if(!event.target.matches('input[type="checkbox"]'))return;if(event.target.checked)artIds.add(event.target.value);else artIds.delete(event.target.value);artZusammenfassung();rendern();});
    el("dpjHashtag").addEventListener("input",(event)=>{hashtag=event.target.value;rendern();});
    el("dpjReset").addEventListener("click",reset); el("dpjPdf").addEventListener("click",pdf); el("dpjDrucken").addEventListener("click",()=>window.print());
    el("dpjSeiten").addEventListener("click",(event)=>{const entry=event.target.closest("[data-id]");if(!entry)return;Router.pendingTagebuchDetailId=entry.dataset.id;Router.open("tagebuch-dp");});
    ansitzStatus(); await laden();
  }
  return { init };
})();
