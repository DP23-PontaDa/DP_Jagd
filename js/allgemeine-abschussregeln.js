window.AllgemeineAbschussregeln = (() => {
  const el = (id) => document.getElementById(id); let regeln = []; let aktuell = null;
  const bedingungName = (code) => AllgemeineAbschussregelnService.BEDINGUNGEN.find(([wert]) => wert === code)?.[1] || code;
  async function init() {
    el("aarNeu").onclick = neu; el("aarSpeichern").onclick = speichern;
    ["aarClose", "aarAbbrechen"].forEach((id) => { el(id).onclick = schliessen; });
    el("aarBedingung").innerHTML = ""; el("aarOperator").innerHTML = "";
    AllgemeineAbschussregelnService.BEDINGUNGEN.forEach(([code, name]) => el("aarBedingung").add(new Option(name, code)));
    AllgemeineAbschussregelnService.OPERATOREN.forEach((operator) => el("aarOperator").add(new Option(operator, operator)));
    const klassen = await WildklassenService.getAktivePlanWildklassen(); wildklassenFuellen(klassen);
    el("aarNeu").hidden = !BerechtigungService.darf("allgemeine-abschussregeln", "Bearbeiten");
    await laden();
  }
  function wildklassenFuellen(klassen) {
    const select = el("aarWildklasse"); select.innerHTML = ""; let gruppe = null; let optgroup;
    WildklassenService.sortiereNachWildgruppeUndWildklasse(klassen).forEach((klasse) => {
      if (String(klasse.wildgruppe_id) !== gruppe) { gruppe = String(klasse.wildgruppe_id); optgroup = document.createElement("optgroup"); optgroup.label = klasse.wildgruppe_bezeichnung; select.append(optgroup); }
      optgroup.append(new Option(klasse.bezeichnung, klasse.id));
    });
  }
  async function laden() { try { regeln = await AllgemeineAbschussregelnService.laden(); rendern(); } catch (error) { AppFeedback.error(error.message); } }
  function rendern() {
    const body = el("aarBody"); body.innerHTML = "";
    regeln.forEach((regel) => {
      const tr = document.createElement("tr"); const werte = [regel.nr, regel.wildklasse?.bezeichnung || "", regel.jahr_von, regel.jahr_bis, bedingungName(regel.bedingung_feld), regel.vergleichsoperator, `${regel.grenzwert}${regel.einheit ? ` ${regel.einheit}` : ""}`, `Stehzeit ${regel.stehzeit_jahre} Jahre`, regel.aktiv ? "Ja" : "Nein"];
      werte.forEach((wert, index) => { const td = document.createElement("td"); td.dataset.label = ["Nr.","Wildklasse","Gültig von","Gültig bis","Bedingung","Operator","Grenzwert","Ergebnis / Stehzeit","Aktiv"][index]; td.textContent = wert; tr.append(td); });
      const aktion = document.createElement("td"); aktion.className = "action-cell"; aktion.dataset.label = "Aktionen";
      const edit = document.createElement("button"); edit.className = "action-btn edit-btn"; edit.title = "Bearbeiten"; edit.hidden = !BerechtigungService.darf("allgemeine-abschussregeln", "Bearbeiten"); edit.onclick = () => bearbeiten(regel);
      const del = document.createElement("button"); del.className = "action-btn delete-btn"; del.title = "Löschen"; del.hidden = !BerechtigungService.darf("allgemeine-abschussregeln", "Löschen"); del.onclick = () => entfernen(regel);
      aktion.append(edit, del); tr.append(aktion); body.append(tr);
    });
    if (!regeln.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 10; td.textContent = "Keine allgemeinen Abschussregeln vorhanden."; tr.append(td); body.append(tr); }
  }
  async function neu() { aktuell = null; el("aarTitel").textContent = "Neue allgemeine Abschussregel"; el("aarNr").value = await AllgemeineAbschussregelnService.naechsteNr(); const jahr = new Date().getFullYear(); el("aarVon").value = jahr; el("aarBis").value = jahr; el("aarBedingung").value = "geweihgewicht"; el("aarOperator").value = "<"; el("aarGrenzwert").value = ""; el("aarEinheit").value = "kg"; el("aarStehzeit").value = ""; el("aarPrioritaet").value = 0; el("aarBezeichnung").value = ""; el("aarBemerkung").value = ""; el("aarAktiv").checked = true; oeffnen(); }
  function bearbeiten(regel) { aktuell = regel; el("aarTitel").textContent = "Allgemeine Abschussregel bearbeiten"; el("aarNr").value = regel.nr; el("aarWildklasse").value = regel.wildklasse_id; el("aarVon").value = regel.jahr_von; el("aarBis").value = regel.jahr_bis; el("aarBedingung").value = regel.bedingung_feld; el("aarOperator").value = regel.vergleichsoperator; el("aarGrenzwert").value = regel.grenzwert; el("aarEinheit").value = regel.einheit || ""; el("aarStehzeit").value = regel.stehzeit_jahre; el("aarPrioritaet").value = regel.prioritaet || 0; el("aarBezeichnung").value = regel.bezeichnung; el("aarBemerkung").value = regel.bemerkung || ""; el("aarAktiv").checked = regel.aktiv; oeffnen(); }
  function oeffnen() { el("aarModal").style.display = "block"; el("aarModal").setAttribute("aria-hidden", "false"); }
  function schliessen() { el("aarModal").style.display = "none"; el("aarModal").setAttribute("aria-hidden", "true"); aktuell = null; }
  async function speichern() {
    const daten = { nr:Number(el("aarNr").value), wildklasse_id:el("aarWildklasse").value, jahr_von:Number(el("aarVon").value), jahr_bis:Number(el("aarBis").value), bedingung_feld:el("aarBedingung").value, vergleichsoperator:el("aarOperator").value, grenzwert:Number(el("aarGrenzwert").value), einheit:el("aarEinheit").value.trim()||null, ergebnis_typ:"STEHZEIT_JAHRE", stehzeit_jahre:Number(el("aarStehzeit").value), prioritaet:Number(el("aarPrioritaet").value||0), bezeichnung:el("aarBezeichnung").value.trim(), bemerkung:el("aarBemerkung").value.trim()||null, aktiv:el("aarAktiv").checked };
    if (!daten.nr || !daten.wildklasse_id || !daten.jahr_von || !daten.jahr_bis || !daten.bezeichnung || !Number.isFinite(daten.grenzwert) || !Number.isInteger(daten.stehzeit_jahre)) return AppFeedback.error("Bitte alle Pflichtfelder korrekt ausfüllen.");
    try { await AllgemeineAbschussregelnService.speichern(daten, aktuell?.id); schliessen(); await laden(); AppFeedback.success("Allgemeine Abschussregel gespeichert."); } catch (error) { AppFeedback.error(error.message); }
  }
  async function entfernen(regel) { if (!await AppFeedback.confirmDelete("Allgemeine Abschussregel löschen?", "Die Regel wird dauerhaft gelöscht.")) return; try { await AllgemeineAbschussregelnService.loeschen(regel.id); await laden(); } catch (error) { AppFeedback.error(error.message); } }
  return { init };
})();
