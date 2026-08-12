window.TagebuchDp = (() => {
  const el = (id) => document.getElementById(id);
  let eintraege = [];
  let arten = [];
  let personen = [];
  let abschuesse = [];
  let bilder = [];
  let aktuell = null;
  let neueBilder = [];
  let ortAuswahl = null;
  let hashtagInput = null;

  function relation(value) { return Array.isArray(value) ? value[0] : value; }
  function escapeHtml(value) {
    const div = document.createElement("div"); div.textContent = value ?? ""; return div.innerHTML;
  }
  function datumAnzeige(value) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString("de-AT") : ""; }
  function zeitAnzeige(value) { return value ? String(value).slice(0, 5) : ""; }
  function personenNamen(row) {
    const namen = (row.personen || []).map((item) => {
      const person = relation(item.person);
      return person ? [person.vorname, person.nachname].filter(Boolean).join(" ") : "";
    }).filter(Boolean);
    if (row.weitere_personen) namen.push(row.weitere_personen);
    return namen.join(", ");
  }
  function ortName(row) {
    const ort = relation(row.ort_stammdaten);
    return [row.ort_freitext, ort ? OrteAuswahl.bezeichnung(ort) : ""].filter(Boolean).join(" / ");
  }
  function bilderFuer(id) { return bilder.filter((bild) => String(bild.tagebuch_id) === String(id)); }
  function hashtagsFuer(row) {
    return (row.hashtags || []).map((item) => relation(item.hashtag)).filter(Boolean);
  }
  function hashtagAnzeige(wert) { return `#${String(wert || "").replace(/\s+/g, "")}`; }

  async function init() {
    ortAuswahl = new OrteAuswahl(el("tbOrt"), el("tbOrtInfo"), { placeholder: "Ort suchen" });
    hashtagInput = new HashtagInput(el("tbHashtags"), { placeholder: "Hashtag suchen oder neu eingeben" });
    ["tbSuche", "tbVon", "tbBis", "tbFilterArt", "tbFilterOrt"].forEach((id) =>
      el(id).addEventListener("input", rendern));
    el("tbNeu").addEventListener("click", neu);
    el("tbBody").addEventListener("click", tabellenAktion);
    el("tbSpeichern").addEventListener("click", speichern);
    el("tbAbbrechen").addEventListener("click", schliessen);
    el("tbSchliessen").addEventListener("click", schliessen);
    el("tbDetailEdit").addEventListener("click", () => aktuell && formularOeffnen(aktuell, false));
    el("tbDetailDelete").addEventListener("click", () => aktuell && eintragLoeschen(aktuell));
    el("tbBilder").addEventListener("change", bilderAuswaehlen);
    el("tbBilderVorschau").addEventListener("click", bildAktion);
    el("tbModal").addEventListener("click", (event) => { if (event.target === el("tbModal")) schliessen(); });
    await initialLaden();
  }

  async function initialLaden() {
    el("tbFehler").hidden = true;
    try {
      [arten, personen, abschuesse] = await Promise.all([
        TagebuchartenService.laden(), TagebuchDpService.personenLaden(), TagebuchDpService.abschuesseLaden(), hashtagInput.laden(),
      ]);
      await ortAuswahl.laden();
      optionenRendern();
      await datenLaden();
    } catch (error) {
      console.error("Tagebuch DP initialisieren:", error);
      el("tbFehler").textContent = error.message; el("tbFehler").hidden = false;
    }
  }

  async function datenLaden() {
    [eintraege, bilder] = await Promise.all([TagebuchDpService.laden(), TagebuchDpService.bilderLaden()]);
    rendern();
  }

  function optionenRendern() {
    el("tbFilterArt").innerHTML = '<option value="">Alle</option>' + arten.map((art) =>
      `<option value="${art.id}">${escapeHtml(art.bezeichnung)}</option>`).join("");
    el("tbPersonen").innerHTML = personen.map((person) => {
      const option = document.createElement("option");
      option.value = person.id;
      option.textContent = [person.vorname, person.nachname].filter(Boolean).join(" ");
      return option.outerHTML;
    }).join("");
    el("tbAbschuss").innerHTML = '<option value="">Kein Abschuss</option>' + abschuesse.map((abschuss) => {
      const gruppe = relation(abschuss.wildgruppen)?.bezeichnung || "";
      const klasse = relation(abschuss.wildklassen)?.bezeichnung || "";
      const text = `Nr. ${abschuss.nr} - ${datumAnzeige(abschuss.datum)} - ${gruppe} - ${klasse}`;
      const option = document.createElement("option"); option.value = abschuss.id; option.textContent = text;
      return option.outerHTML;
    }).join("");
  }

  function gefiltert() {
    const suche = el("tbSuche").value.trim().toLocaleLowerCase("de");
    const ort = el("tbFilterOrt").value.trim().toLocaleLowerCase("de");
    const von = el("tbVon").value;
    const bis = el("tbBis").value;
    const artId = el("tbFilterArt").value;
    return eintraege.filter((row) => (!von || row.datum >= von) && (!bis || row.datum <= bis) &&
      (!artId || String(row.art_id) === artId) && (!ort || ortName(row).toLocaleLowerCase("de").includes(ort)) &&
      (!suche || [row.titel, row.beschreibung, ortName(row), personenNamen(row), relation(row.art)?.bezeichnung,
        ...hashtagsFuer(row).map((tag) => tag.bezeichnung)]
        .join(" ").toLocaleLowerCase("de").includes(suche)));
  }

  function td(text, label) { const zelle = document.createElement("td"); zelle.dataset.label = label; zelle.textContent = text || ""; return zelle; }

  function rendern() {
    const rows = gefiltert();
    el("tbBody").innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.append(td(datumAnzeige(row.datum), "Datum"), td(zeitAnzeige(row.uhrzeit), "Uhrzeit"),
        td(relation(row.art)?.bezeichnung, "Art"), td(row.titel, "Titel"), td(ortName(row), "Ort"));
      const hashtagTd = td("", "Hashtags"); hashtagTd.className = "tagebuch-hashtags-cell";
      const hashtagText = hashtagsFuer(row).map((tag) => hashtagAnzeige(tag.bezeichnung)).join(" ");
      hashtagTd.textContent = hashtagText || "–"; hashtagTd.title = hashtagText;
      tr.appendChild(hashtagTd);
      const beschreibungTd = td("", "Beschreibung"); beschreibungTd.className = "tagebuch-description-cell";
      const beschreibung = row.beschreibung || "";
      const kurz = beschreibung.length > 140 ? `${beschreibung.slice(0, 137).trimEnd()}…` : beschreibung;
      const beschreibungSpan = document.createElement("span"); beschreibungSpan.className = "tagebuch-description-short";
      beschreibungSpan.textContent = kurz; beschreibungSpan.title = beschreibung; beschreibungTd.appendChild(beschreibungSpan);
      tr.appendChild(beschreibungTd);
      const bildTd = td("", "Bild");
      const rowBilder = bilderFuer(row.id);
      if (rowBilder[0]?.url) {
        const button = document.createElement("button"); button.type = "button";
        button.className = "tagebuch-thumbnail-button"; button.dataset.action = "view"; button.dataset.id = row.id;
        const img = document.createElement("img"); img.className = "tagebuch-table-thumbnail";
        img.src = rowBilder[0].url; img.alt = `Bild zu ${row.titel}`; img.loading = "lazy"; button.appendChild(img);
        bildTd.appendChild(button);
        if (rowBilder.length > 1) { const count = document.createElement("span"); count.className = "tagebuch-image-count"; count.textContent = `+${rowBilder.length - 1}`; bildTd.appendChild(count); }
      } else bildTd.textContent = "Kein Bild";
      tr.appendChild(bildTd);
      const actions = td("", "Aktionen"); actions.className = "action-cell";
      actions.innerHTML = `<button class="action-btn view-btn" data-action="view" data-id="${row.id}" title="Öffnen" aria-label="Öffnen">👁</button>` +
        `<button class="action-btn edit-btn" data-action="edit" data-id="${row.id}" title="Bearbeiten" aria-label="Bearbeiten"></button>` +
        `<button class="action-btn delete-btn" data-action="delete" data-id="${row.id}" title="Löschen" aria-label="Löschen"></button>`;
      tr.appendChild(actions); el("tbBody").appendChild(tr);
    });
    el("tbLeer").hidden = rows.length > 0; el("tbTabelleWrap").hidden = rows.length === 0;
    BerechtigungService.aktionsrechteAnwenden("tagebuch-dp", el("tbBody"));
  }

  function tabellenAktion(event) {
    const button = event.target.closest("button[data-id]"); if (!button) return;
    const row = eintraege.find((item) => String(item.id) === button.dataset.id); if (!row) return;
    if (button.dataset.action === "view") return formularOeffnen(row, true);
    if (button.dataset.action === "edit") return formularOeffnen(row, false);
    eintragLoeschen(row);
  }

  function lokaleJetztWerte() {
    const jetzt = new Date();
    const datum = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-${String(jetzt.getDate()).padStart(2, "0")}`;
    return { datum, zeit: `${String(jetzt.getHours()).padStart(2, "0")}:${String(jetzt.getMinutes()).padStart(2, "0")}` };
  }

  function artOptionen(aktuelleArt = null) {
    el("tbArt").innerHTML = '<option value="">Bitte wählen</option>' + arten
      .filter((art) => art.aktiv || String(art.id) === String(aktuelleArt))
      .map((art) => `<option value="${art.id}">${escapeHtml(art.bezeichnung)}</option>`).join("");
  }

  function neu() {
    aktuell = null; neueBilder = [];
    const jetzt = lokaleJetztWerte();
    artOptionen();
    el("tbDatum").value = jetzt.datum; el("tbUhrzeit").value = jetzt.zeit;
    el("tbArt").value = ""; el("tbTitel").value = ""; el("tbOrtFreitext").value = "";
    el("tbBeschreibung").value = ""; el("tbWeiterePersonen").value = ""; el("tbAbschuss").value = "";
    hashtagInput.clear();
    [...el("tbPersonen").options].forEach((option) => { option.selected = false; });
    ortAuswahl.clear(); bilderRendern(); modalModus(false); el("tbModalTitel").textContent = "Neuer Tagebucheintrag"; oeffnen();
  }

  function formularOeffnen(row, nurLesen) {
    aktuell = row; neueBilder = []; artOptionen(row.art_id);
    el("tbDatum").value = row.datum; el("tbUhrzeit").value = zeitAnzeige(row.uhrzeit);
    el("tbArt").value = row.art_id; el("tbTitel").value = row.titel || "";
    el("tbOrtFreitext").value = row.ort_freitext || ""; el("tbBeschreibung").value = row.beschreibung || "";
    hashtagInput.setTags(hashtagsFuer(row).map((tag) => tag.bezeichnung));
    el("tbWeiterePersonen").value = row.weitere_personen || ""; el("tbAbschuss").value = row.abschuss_id || "";
    const ids = new Set((row.personen || []).map((item) => String(item.person_id)));
    [...el("tbPersonen").options].forEach((option) => { option.selected = ids.has(option.value); });
    ortAuswahl.setValue(row.ort_id, false); bilderRendern(); modalModus(nurLesen);
    el("tbModalTitel").textContent = nurLesen ? row.titel : "Tagebucheintrag bearbeiten"; oeffnen();
  }

  function modalModus(nurLesen) {
    el("tbModal").querySelectorAll(".form-grid input,.form-grid select,.form-grid textarea,.form-grid button")
      .forEach((control) => { control.disabled = nurLesen; });
    el("tbModalFooter").hidden = nurLesen;
    el("tbDetailEdit").hidden = !nurLesen; el("tbDetailDelete").hidden = !nurLesen;
    el("tbBilderVorschau").classList.toggle("is-readonly", nurLesen);
    hashtagInput.setDisabled(nurLesen);
    BerechtigungService.aktionsrechteAnwenden("tagebuch-dp", el("tbModal"));
  }

  function oeffnen() { el("tbModalFehler").hidden = true; el("tbModal").style.display = "block"; el("tbModal").setAttribute("aria-hidden", "false"); }
  function schliessen() { neueBilder.forEach((bild) => URL.revokeObjectURL(bild.url)); neueBilder = []; aktuell = null; el("tbModal").style.display = "none"; el("tbModal").setAttribute("aria-hidden", "true"); }

  function bilderAuswaehlen(event) {
    for (const datei of event.target.files) {
      try { TagebuchDpService.bildValidieren(datei); neueBilder.push({ datei, url: URL.createObjectURL(datei) }); }
      catch (error) { el("tbModalFehler").textContent = error.message; el("tbModalFehler").hidden = false; }
    }
    event.target.value = ""; bilderRendern();
  }

  function bilderRendern() {
    const container = el("tbBilderVorschau"); container.innerHTML = "";
    const vorhanden = aktuell ? bilderFuer(aktuell.id).map((bild) => ({ ...bild, vorhanden: true })) : [];
    [...vorhanden, ...neueBilder.map((bild, index) => ({ ...bild, index, dateiname: bild.datei.name }))]
      .forEach((bild) => {
        const figure = document.createElement("figure"); figure.className = "tagebuch-image";
        const link = document.createElement("a"); link.href = bild.url; link.target = "_blank"; link.rel = "noopener";
        const img = document.createElement("img"); img.src = bild.url; img.alt = bild.dateiname; link.appendChild(img);
        const caption = document.createElement("figcaption"); caption.textContent = bild.dateiname;
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "tagebuch-image-remove";
        remove.textContent = "×"; remove.title = remove.ariaLabel = "Bild löschen";
        if (bild.vorhanden) remove.dataset.imageId = bild.id; else remove.dataset.newIndex = bild.index;
        figure.append(link, caption, remove); container.appendChild(figure);
      });
  }

  async function bildAktion(event) {
    const button = event.target.closest(".tagebuch-image-remove"); if (!button) return;
    if (button.dataset.imageId) {
      const bild = bilder.find((item) => String(item.id) === button.dataset.imageId);
      if (!bild || !confirm("Bild wirklich löschen?")) return;
      try { await TagebuchDpService.bildLoeschen(bild); bilder = bilder.filter((item) => item !== bild); bilderRendern(); rendern(); }
      catch (error) { AppFeedback.error(error.message); }
    } else {
      const index = Number(button.dataset.newIndex); URL.revokeObjectURL(neueBilder[index].url); neueBilder.splice(index, 1); bilderRendern();
    }
  }

  async function speichern() {
    const daten = {
      datum: el("tbDatum").value, uhrzeit: el("tbUhrzeit").value, art_id: el("tbArt").value,
      titel: el("tbTitel").value, ort_freitext: el("tbOrtFreitext").value,
      beschreibung: el("tbBeschreibung").value, weitere_personen: el("tbWeiterePersonen").value,
      ort_id: ortAuswahl.getValue(), abschuss_id: el("tbAbschuss").value || null,
    };
    if (!daten.datum || !daten.art_id || !daten.titel.trim()) {
      el("tbModalFehler").textContent = "Datum, Art und Titel sind erforderlich."; el("tbModalFehler").hidden = false; return;
    }
    const personIds = [...el("tbPersonen").selectedOptions].map((option) => option.value);
    const button = el("tbSpeichern"); const text = button.textContent; button.disabled = true; button.textContent = "Speichert …";
    try {
      const tags = hashtagInput.getTags();
      const eintrag = await TagebuchDpService.speichern(aktuell?.id, daten, personIds, tags);
      if (neueBilder.length) await TagebuchDpService.bilderHochladen(eintrag.id,
        neueBilder.map((bild) => bild.datei), aktuell
          ? bilderFuer(aktuell.id).reduce((max, bild) => Math.max(max, Number(bild.sortierung) || 0), 0)
          : 0);
      HashtagService.hinzufuegenLokal(tags);
      await hashtagInput.laden();
      schliessen(); await datenLaden(); AppFeedback.success("Tagebucheintrag gespeichert.");
    } catch (error) { console.error("Tagebucheintrag speichern:", error); el("tbModalFehler").textContent = error.message; el("tbModalFehler").hidden = false; }
    finally { button.disabled = false; button.textContent = text; }
  }

  async function eintragLoeschen(row) {
    if (!confirm(`Tagebucheintrag „${row.titel}“ wirklich löschen?`)) return;
    try { await TagebuchDpService.loeschen(row.id, bilderFuer(row.id)); if (aktuell?.id === row.id) schliessen(); await datenLaden(); AppFeedback.success("Tagebucheintrag gelöscht."); }
    catch (error) { AppFeedback.error(error.message); }
  }

  return { init };
})();
