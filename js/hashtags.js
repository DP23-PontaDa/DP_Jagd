window.Hashtags = (() => {
  const el=(id)=>document.getElementById(id);
  let eintraege=[], alleTags=[], ausgewaehlt=new Set();
  const escapeHtml=(wert)=>{const node=document.createElement("div");node.textContent=wert??"";return node.innerHTML;};
  const datum=(wert)=>wert?new Date(`${wert}T00:00:00`).toLocaleDateString("de-AT"):"";
  function suchTags() {
    return String(el("htSuche").value||"").split(/[\s,;]+/).map(HashtagsService.normalisieren).filter(Boolean);
  }
  function aktiveTags() { return new Set([...ausgewaehlt,...suchTags()]); }
  function tagListeRendern() {
    const suchteile=suchTags();
    const sichtbar=alleTags.filter((tag)=>!suchteile.length || suchteile.some((teil)=>tag.normalisiert.includes(teil)));
    el("htListe").innerHTML=sichtbar.length?sichtbar.map((tag)=>`<label><input type="checkbox" value="${escapeHtml(tag.normalisiert)}"${ausgewaehlt.has(tag.normalisiert)?" checked":""}><span>#${escapeHtml(tag.bezeichnung)}</span></label>`).join(""):'<p class="empty-state">Keine passenden Hashtags.</p>';
  }
  function trefferRendern() {
    const gesucht=aktiveTags(), hinweis=el("htHinweis"), wrap=el("htTabelleWrap");
    if(!gesucht.size){hinweis.textContent="Bitte mindestens einen Hashtag auswählen.";hinweis.hidden=false;wrap.hidden=true;return;}
    const rows=eintraege.filter((row)=>{const vorhanden=new Set(row.hashtags.map((tag)=>tag.normalisiert));return [...gesucht].every((tag)=>vorhanden.has(tag));});
    if(!rows.length){hinweis.textContent="Keine Einträge mit den ausgewählten Hashtags gefunden.";hinweis.hidden=false;wrap.hidden=true;return;}
    hinweis.hidden=true;wrap.hidden=false;
    el("htBody").innerHTML=rows.map((row)=>`<tr class="hashtags-result-row" tabindex="0" data-id="${escapeHtml(row.id)}" data-quelle="${escapeHtml(row.quelle)}"><td data-label="Datum">${datum(row.datum)}</td><td data-label="Quelle">${escapeHtml(row.quelleName)}</td><td data-label="Art / Titel"><strong>${escapeHtml(row.art)}</strong>${row.art&&row.titel?" – ":""}${escapeHtml(row.titel)}</td><td data-label="Hashtags"><div class="hashtags-inline">${row.hashtags.map((tag)=>`<span>#${escapeHtml(tag.bezeichnung)}</span>`).join("")}</div></td><td data-label="Beschreibung"><span class="hashtags-description" title="${escapeHtml(row.beschreibung)}">${escapeHtml(row.beschreibung)}</span></td></tr>`).join("");
  }
  function rendern(){tagListeRendern();trefferRendern();}
  function oeffnen(row){if(!row)return;if(row.dataset.quelle==="tagebuch-dp"){Router.pendingTagebuchDetailId=row.dataset.id;Router.open("tagebuch-dp");}else{Router.pendingStPeterDetailId=row.dataset.id;Router.open("st-peter-mitterberg");}}
  function reset(){ausgewaehlt.clear();el("htSuche").value="";rendern();}
  async function init(){
    el("htFehler").hidden=true;
    el("htSuche").addEventListener("input",rendern);
    el("htListe").addEventListener("change",(event)=>{if(!event.target.matches('input[type="checkbox"]'))return;if(event.target.checked){ausgewaehlt.add(event.target.value);const eingabe=suchTags();if(eingabe.length===1&&event.target.value.includes(eingabe[0]))el("htSuche").value="";}else ausgewaehlt.delete(event.target.value);rendern();});
    el("htAuswahlAufheben").addEventListener("click",()=>{ausgewaehlt.clear();rendern();});el("htReset").addEventListener("click",reset);
    el("htBody").addEventListener("click",(event)=>oeffnen(event.target.closest("tr[data-id]")));
    el("htBody").addEventListener("keydown",(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();oeffnen(event.target.closest("tr[data-id]"));}});
    try{eintraege=await HashtagsService.laden();const map=new Map();eintraege.flatMap((row)=>row.hashtags).forEach((tag)=>{if(tag.normalisiert&&!map.has(tag.normalisiert))map.set(tag.normalisiert,tag.bezeichnung);});alleTags=[...map].map(([normalisiert,bezeichnung])=>({normalisiert,bezeichnung})).sort((a,b)=>a.bezeichnung.localeCompare(b.bezeichnung,"de",{sensitivity:"base"}));rendern();}
    catch(error){console.error("Hashtag-Suche:",error);el("htFehler").textContent=error.message;el("htFehler").hidden=false;}
  }
  return {init};
})();
