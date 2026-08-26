window.Abschussregeln = (() => {
  const el = (id) => document.getElementById(id); let rows = []; let aktuell = null;
  const typName = (typ) => AbschussregelnService.REGELTYPEN.find((wert) => wert[0] === typ)?.[1] || typ;
  async function init() {
    el("arNeu").onclick = neu; el("arSpeichern").onclick = speichern; el("arAbbrechen").onclick = schliessen; el("arClose").onclick = schliessen;
    el("arJaegerFilter").onchange = rendern;
    el("arTyp").innerHTML = "";
    el("arJaeger").innerHTML = "";
    el("arJaegerFilter").innerHTML = '<option value="">Alle Jäger</option>';
    AbschussregelnService.REGELTYPEN.forEach(([wert, name]) => el("arTyp").add(new Option(name, wert)));
    const [klassen, jaeger] = await Promise.all([WildklassenService.getAktivePlanWildklassen(), AbschussregelnService.jaegerLaden()]);
    wildklassenOptionenFuellen(el("arWildklasse"), klassen);
    jaeger.forEach((person) => {
      const name = `${person.vorname} ${person.nachname}`.trim();
      el("arJaeger").add(new Option(name, person.id));
      el("arJaegerFilter").add(new Option(name, person.id));
    });
    el("arNeu").hidden = !BerechtigungService.darf("abschussregeln", "Bearbeiten"); await laden();
  }
  function wildklassenOptionenFuellen(select, klassen) {
    select.innerHTML = "";
    let gruppe = null; let optgroup = null;
    WildklassenService.sortiereNachWildgruppeUndWildklasse(klassen).forEach((klasse) => {
      const gruppenId = String(klasse.wildgruppe_id || "");
      if (gruppenId !== gruppe) {
        gruppe = gruppenId; optgroup = document.createElement("optgroup");
        optgroup.label = klasse.wildgruppe_bezeichnung || "Ohne Wildgruppe"; select.append(optgroup);
      }
      optgroup.append(new Option(klasse.bezeichnung, klasse.id));
    });
  }
  async function laden() { try { rows = await AbschussregelnService.laden(); rendern(); } catch (error) { AppFeedback.error(error.message); } }
  function rendern() {
    el("arBody").innerHTML = "";
    const jaegerId = el("arJaegerFilter").value;
    const gefiltert = rows.filter((regel) =>
      !jaegerId || String(regel.jaeger_id) === String(jaegerId));
    gefiltert.forEach((regel) => {
      const tr = document.createElement("tr");
      [regel.nr, `${regel.jaeger?.vorname || ""} ${regel.jaeger?.nachname || ""}`.trim(), regel.wildklasse?.bezeichnung || "", typName(regel.regel_typ), regel.frei_ab || "–", regel.freigabejahr || "–", regel.bemerkung || "", regel.aktiv ? "Ja" : "Nein"]
        .forEach((wert, index) => { const td = document.createElement("td"); td.dataset.label = ["Nr.","Jäger","Wildklasse","Regel","Frei ab","Freigabejahr","Bemerkung","Aktiv"][index]; td.textContent = wert; tr.append(td); });
      const aktion = document.createElement("td"); aktion.className = "action-cell"; aktion.dataset.label = "Aktionen";
      const edit = document.createElement("button"); edit.className = "action-btn edit-btn"; edit.title = "Bearbeiten"; edit.hidden = !BerechtigungService.darf("abschussregeln", "Bearbeiten"); edit.onclick = () => bearbeiten(regel);
      const del = document.createElement("button"); del.className = "action-btn delete-btn"; del.title = "Löschen"; del.hidden = !BerechtigungService.darf("abschussregeln", "Löschen"); del.onclick = () => entfernen(regel);
      aktion.append(edit, del); tr.append(aktion); el("arBody").append(tr);
    });
    if (!gefiltert.length) {
      const tr = document.createElement("tr"); const td = document.createElement("td");
      td.colSpan = 9; td.textContent = "Keine Abschussregeln für diesen Jäger vorhanden.";
      tr.append(td); el("arBody").append(tr);
    }
  }
  async function neu() {
    aktuell = null; el("arTitel").textContent = "Neue Abschussregel"; el("arNr").value = await AbschussregelnService.naechsteNr();
    el("arFreiAb").value = ""; el("arFreigabejahr").value = new Date().getFullYear(); el("arBemerkung").value = ""; el("arAktiv").checked = true; oeffnen();
  }
  function bearbeiten(regel) {
    aktuell = regel; el("arTitel").textContent = "Abschussregel bearbeiten"; el("arNr").value = regel.nr; el("arJaeger").value = regel.jaeger_id;
    el("arWildklasse").value = regel.wildklasse_id; el("arTyp").value = regel.regel_typ; el("arFreiAb").value = regel.frei_ab || "";
    el("arFreigabejahr").value = regel.freigabejahr || ""; el("arBemerkung").value = regel.bemerkung || ""; el("arAktiv").checked = regel.aktiv; oeffnen();
  }
  function oeffnen() { el("arModal").style.display = "block"; } function schliessen() { el("arModal").style.display = "none"; }
  async function speichern() {
    const daten = { nr: Number(el("arNr").value), jaeger_id: el("arJaeger").value, wildklasse_id: el("arWildklasse").value, regel_typ: el("arTyp").value,
      frei_ab: el("arFreiAb").value || null,
      freigabejahr: el("arFreigabejahr").value ? Number(el("arFreigabejahr").value) : null, bemerkung: el("arBemerkung").value.trim() || null,
      aktiv: el("arAktiv").checked, gueltig_ab: null, regel_wert: null, geaendert_am: new Date().toISOString() };
    if (!daten.nr || !daten.jaeger_id || !daten.wildklasse_id || !daten.regel_typ || !daten.freigabejahr) return AppFeedback.error("Nr., Jäger, Wildklasse, Regel und Freigabejahr sind erforderlich.");
    if (daten.frei_ab && Number(daten.frei_ab.slice(0, 4)) !== daten.freigabejahr) return AppFeedback.error(`Das Datum Frei ab muss innerhalb des Freigabejahres ${daten.freigabejahr} liegen.`);
    try { await AbschussregelnService.speichern(daten, aktuell?.id); schliessen(); await laden(); AppFeedback.success("Abschussregel gespeichert."); } catch (error) { AppFeedback.error(error.message); }
  }
  async function entfernen(regel) { if (!await AppFeedback.confirmDelete("Abschussregel löschen?", "Die individuelle Regel wird dauerhaft gelöscht.")) return; try { await AbschussregelnService.loeschen(regel.id); await laden(); } catch (error) { AppFeedback.error(error.message); } }
  return { init };
})();
