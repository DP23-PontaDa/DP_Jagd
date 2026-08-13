window.Orte = (() => {
  const el = (id) => document.getElementById(id);
  let orte = [];
  let bilder = [];
  let aktiveEinrichtungen = true;
  let aktuellerOrt = null;
  let vorhandeneBilder = [];
  let neueDateien = [];
  let karte = null;
  let marker = null;
  let latitude = null;
  let longitude = null;
  let kartenEinstellungen = null;
  let kartenNurLesen = false;
  let kartenInitialisierung = 0;
  const KARTEN_FALLBACK = { map_lat: 47.3, map_lng: 13.7, map_zoom: 8 };
  const ORT_DETAIL_ZOOM = 17;

  function istZahl(value) { return value !== null && value !== "" && Number.isFinite(Number(value)); }

  async function init() {
    el("orteTabEinrichtungen").addEventListener("click", () => tabOeffnen(true));
    el("orteTabAbschussorte").addEventListener("click", () => tabOeffnen(false));
    el("orteSuche").addEventListener("input", renderTabelle);
    el("orteNeu").addEventListener("click", neuerOrt);
    el("orteKartenEinstellungen").addEventListener("click", kartenEinstellungenOeffnen);
    el("orteBody").addEventListener("click", tabellenAktion);
    el("orteSchliessen").addEventListener("click", modalSchliessen);
    el("orteAbbrechen").addEventListener("click", modalSchliessen);
    el("orteSpeichern").addEventListener("click", speichern);
    el("ortePositionLoeschen").addEventListener("click", () => positionSetzen(null, null));
    el("orteBilder").addEventListener("change", bilderAuswaehlen);
    el("orteBilderVorschau").addEventListener("click", bildAktion);
    el("orteModal").addEventListener("click", (event) => {
      if (event.target === el("orteModal")) modalSchliessen();
    });
    el("orteKarteEinstellungenSchliessen").addEventListener("click", kartenEinstellungenSchliessen);
    el("orteKarteEinstellungenAbbrechen").addEventListener("click", kartenEinstellungenSchliessen);
    el("orteKarteEinstellungenSpeichern").addEventListener("click", kartenEinstellungenSpeichern);
    el("orteKarteEinstellungenModal").addEventListener("click", (event) => {
      if (event.target === el("orteKarteEinstellungenModal")) kartenEinstellungenSchliessen();
    });
    await laden();
  }

  async function laden() {
    el("orteFehler").hidden = true;
    try {
      [orte, bilder, kartenEinstellungen] = await Promise.all([
        OrteService.orteLaden(),
        OrteService.bilderAlleLaden(),
        OrteService.kartenEinstellungenLaden(),
      ]);
      renderTabelle();
    } catch (error) {
      console.error("Orte:", error);
      el("orteFehler").textContent = error.message;
      el("orteFehler").hidden = false;
    }
  }

  function tabOeffnen(einrichtungen) {
    aktiveEinrichtungen = einrichtungen;
    el("orteTabEinrichtungen").classList.toggle("active", einrichtungen);
    el("orteTabAbschussorte").classList.toggle("active", !einrichtungen);
    renderTabelle();
  }

  function gefilterteOrte() {
    const suche = el("orteSuche").value.trim().toLocaleLowerCase("de");
    return orte.filter((ort) => ort.reviereinrichtung === aktiveEinrichtungen)
      .filter((ort) => !suche || [ort.nr, ort.name, ort.art, ort.info]
        .join(" ").toLocaleLowerCase("de").includes(suche));
  }

  function zelle(text, klasse = "") {
    const td = document.createElement("td");
    td.textContent = text ?? "";
    if (klasse) td.className = klasse;
    return td;
  }

  function renderTabelle() {
    const liste = gefilterteOrte();
    const kopf = aktiveEinrichtungen
      ? ["Nr.", "Name", "Art", "Info", "Reviereinrichtung", "Latitude", "Longitude", "Position / Karte", "Bilder", "Aktionen"]
      : ["Nr.", "Name", "Info", "Reviereinrichtung", "Latitude", "Longitude", "Position / Karte", "Bilder", "Aktionen"];
    el("orteKopf").innerHTML = `<tr>${kopf.map((wert) => `<th>${wert}</th>`).join("")}</tr>`;
    const body = el("orteBody");
    body.innerHTML = "";
    liste.forEach((ort) => {
      const row = document.createElement("tr");
      row.append(zelle(ort.nr), zelle(ort.name));
      if (aktiveEinrichtungen) row.append(zelle(ort.art));
      row.append(zelle(ort.info));
      row.append(zelle(ort.reviereinrichtung ? "Ja" : "Nein"));
      row.append(zelle(istZahl(ort.latitude) ? Number(ort.latitude).toFixed(6) : "–", "ap-number-column"));
      row.append(zelle(istZahl(ort.longitude) ? Number(ort.longitude).toFixed(6) : "–", "ap-number-column"));
      const position = zelle("");
      if (istZahl(ort.latitude) && istZahl(ort.longitude)) {
        const karteOeffnen = document.createElement("button");
        karteOeffnen.type = "button";
        karteOeffnen.className = "orte-position-link";
        karteOeffnen.dataset.action = "map";
        karteOeffnen.dataset.id = ort.id;
        karteOeffnen.textContent = "Karte öffnen";
        position.appendChild(karteOeffnen);
      } else position.textContent = "–";
      row.appendChild(position);
      const ortBilder = bilder.filter((bild) => String(bild.ort_id) === String(ort.id));
      const bildZelle = zelle("", "orte-image-overview");
      const erstesBild = ortBilder[0] || null;
      if (erstesBild?.vorschau_url) {
        const vorschauButton = document.createElement("button");
        vorschauButton.type = "button";
        vorschauButton.className = "orte-thumbnail-button";
        vorschauButton.dataset.action = "edit";
        vorschauButton.dataset.id = ort.id;
        vorschauButton.title = vorschauButton.ariaLabel = `${ort.name} öffnen`;
        const vorschau = document.createElement("img");
        vorschau.className = "orte-table-thumbnail";
        vorschau.src = erstesBild.vorschau_url;
        vorschau.alt = `Vorschaubild ${ort.name}`;
        vorschau.loading = "lazy";
        vorschauButton.appendChild(vorschau);
        bildZelle.appendChild(vorschauButton);
      } else {
        const keinBild = document.createElement("span");
        keinBild.className = "orte-no-thumbnail";
        keinBild.textContent = "Kein Bild";
        bildZelle.appendChild(keinBild);
      }
      const bildAnzahl = document.createElement("span");
      bildAnzahl.className = "orte-image-count";
      bildAnzahl.textContent = ortBilder.length === 1 ? "1 Bild" : `${ortBilder.length} Bilder`;
      bildZelle.appendChild(bildAnzahl);
      row.appendChild(bildZelle);
      const aktionen = zelle("", "action-cell");
      const bearbeiten = document.createElement("button");
      bearbeiten.type = "button";
      bearbeiten.className = "action-btn edit-btn";
      bearbeiten.dataset.action = "edit";
      bearbeiten.dataset.id = ort.id;
      bearbeiten.title = bearbeiten.ariaLabel = "Bearbeiten";
      const loeschen = document.createElement("button");
      loeschen.type = "button";
      loeschen.className = "action-btn delete-btn";
      loeschen.dataset.action = "delete";
      loeschen.dataset.id = ort.id;
      loeschen.title = loeschen.ariaLabel = "Löschen";
      aktionen.append(bearbeiten, loeschen);
      row.appendChild(aktionen);
      body.appendChild(row);
    });
    el("orteLeer").hidden = liste.length > 0;
    el("orteTabelleWrap").hidden = liste.length === 0;
    BerechtigungService.aktionsrechteAnwenden("orte", el("orteBody"));
  }

  async function tabellenAktion(event) {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    const ort = orte.find((item) => String(item.id) === button.dataset.id);
    if (!ort) return;
    if (button.dataset.action === "map") {
      try { OrteKarte.ortAnzeigen(ort, kartenFallbackFuerAnsicht()); }
      catch (error) { AppFeedback.error(error.message); }
      return;
    }
    if (button.dataset.action === "edit") {
      try { await modalOeffnen(ort); }
      catch (error) { AppFeedback.error(error.message); }
      return;
    }
    if (!confirm(`Ort „${ort.name}“ wirklich löschen?`)) return;
    try {
      await OrteService.ortLoeschen(ort.id);
      await laden();
      AppFeedback.success("Ort gelöscht.");
    } catch (error) { AppFeedback.error(error.message); }
  }

  async function neuerOrt() {
    try {
      const nr = await OrteService.naechsteNummer(aktiveEinrichtungen);
      await modalOeffnen({ nr, name: "", art: null, info: null, latitude: null, longitude: null, reviereinrichtung: aktiveEinrichtungen });
    } catch (error) { AppFeedback.error(error.message); }
  }

  async function modalOeffnen(ort, nurKarte = false) {
    kartenNurLesen = nurKarte;
    aktuellerOrt = !nurKarte && ort.id ? ort : null;
    vorhandeneBilder = !nurKarte && ort.id ? await OrteService.bilderLaden(ort.id) : [];
    neueDateien = [];
    el("orteModalTitel").textContent = nurKarte
      ? ort.name
      : (ort.id ? "Ort bearbeiten" : "Ort anlegen");
    el("orteModal").querySelectorAll(".orte-edit-only")
      .forEach((element) => { element.hidden = nurKarte; });
    el("orteNr").value = ort.nr ?? "";
    el("orteName").value = ort.name || "";
    el("orteArt").value = ort.art || "";
    el("orteInfo").value = ort.info || "";
    el("orteArtGruppe").hidden = nurKarte || !ort.reviereinrichtung;
    el("orteBilder").value = "";
    el("orteModalFehler").hidden = true;
    positionSetzen(ort.latitude, ort.longitude);
    bilderRendern();
    el("orteModal").style.display = "block";
    el("orteModal").setAttribute("aria-hidden", "false");
    karteNachModalOeffnungInitialisieren();
  }

  function karteNachModalOeffnungInitialisieren() {
    const aufruf = ++kartenInitialisierung;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (aufruf !== kartenInitialisierung ||
          el("orteModal").getAttribute("aria-hidden") === "true") return;
      const container = el("orteKarte");
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
        window.setTimeout(() => {
          if (aufruf === kartenInitialisierung) karteNachModalOeffnungInitialisieren();
        }, 100);
        return;
      }
      try {
        karteInitialisieren();
      } catch (error) {
        console.error("Orte-Karte konnte nicht initialisiert werden:", error);
        el("orteModalFehler").textContent = error.message || "Die Karte konnte nicht geladen werden.";
        el("orteModalFehler").hidden = false;
      }
    }));
  }

  function kartenStart() {
    if (istZahl(latitude) && istZahl(longitude)) {
      return { lat: Number(latitude), lng: Number(longitude), zoom: ORT_DETAIL_ZOOM };
    }
    if (istZahl(kartenEinstellungen?.map_lat) &&
        istZahl(kartenEinstellungen?.map_lng) &&
        istZahl(kartenEinstellungen?.map_zoom)) {
      return {
        lat: Number(kartenEinstellungen.map_lat),
        lng: Number(kartenEinstellungen.map_lng),
        zoom: Number(kartenEinstellungen.map_zoom),
      };
    }
    return { lat: KARTEN_FALLBACK.map_lat, lng: KARTEN_FALLBACK.map_lng,
      zoom: KARTEN_FALLBACK.map_zoom };
  }

  function karteInitialisieren() {
    if (!window.L) {
      el("orteModalFehler").textContent = "Die Karte konnte nicht geladen werden.";
      el("orteModalFehler").hidden = false;
      return;
    }
    const container = el("orteKarte");
    if (karte && karte.getContainer() !== container) {
      karte.remove();
      karte = null;
      marker = null;
    }
    if (!karte) {
      const start = kartenStart();
      karte = OrteKarte.karteAnlegen(container, start, {
        onClick: (event) => {
          if (!kartenNurLesen) positionSetzen(event.latlng.lat, event.latlng.lng, true);
        },
      });
    }
    const start = kartenStart();
    karte.invalidateSize({ pan: false });
    karte.setView([start.lat, start.lng], start.zoom);
    positionSetzen(latitude, longitude, false);
    window.setTimeout(() => karte.invalidateSize({ pan: false }), 100);
  }

  function kartenFallbackFuerAnsicht() {
    const start = kartenStart();
    return { lat: start.lat, lng: start.lng, zoom: start.zoom };
  }

  function positionSetzen(lat, lng, karteAktualisieren = false) {
    latitude = istZahl(lat) ? Number(lat) : null;
    longitude = istZahl(lng) ? Number(lng) : null;
    el("orteLatitude").textContent = latitude === null ? "–" : latitude.toFixed(6);
    el("orteLongitude").textContent = longitude === null ? "–" : longitude.toFixed(6);
    if (!karte) return;
    if (marker) { marker.remove(); marker = null; }
    if (latitude !== null && longitude !== null) {
      marker = L.marker([latitude, longitude], { draggable: !kartenNurLesen }).addTo(karte);
      if (!kartenNurLesen) {
        marker.on("dragend", () => {
          const punkt = marker.getLatLng();
          positionSetzen(punkt.lat, punkt.lng);
        });
      }
      if (karteAktualisieren) karte.setView([latitude, longitude], Math.max(karte.getZoom(), 15));
    }
  }

  function kartenEinstellungenOeffnen() {
    const werte = kartenEinstellungen || KARTEN_FALLBACK;
    el("orteMapLat").value = werte.map_lat;
    el("orteMapLng").value = werte.map_lng;
    el("orteMapZoom").value = werte.map_zoom;
    el("orteKarteEinstellungenFehler").hidden = true;
    el("orteKarteEinstellungenModal").style.display = "block";
    el("orteKarteEinstellungenModal").setAttribute("aria-hidden", "false");
  }

  function kartenEinstellungenSchliessen() {
    el("orteKarteEinstellungenModal").style.display = "none";
    el("orteKarteEinstellungenModal").setAttribute("aria-hidden", "true");
  }

  async function kartenEinstellungenSpeichern() {
    const daten = {
      map_lat: Number(el("orteMapLat").value),
      map_lng: Number(el("orteMapLng").value),
      map_zoom: Number(el("orteMapZoom").value),
    };
    const gueltig = Number.isFinite(daten.map_lat) && daten.map_lat >= -90 && daten.map_lat <= 90 &&
      Number.isFinite(daten.map_lng) && daten.map_lng >= -180 && daten.map_lng <= 180 &&
      Number.isInteger(daten.map_zoom) && daten.map_zoom >= 1 && daten.map_zoom <= 19;
    if (!gueltig) {
      el("orteKarteEinstellungenFehler").textContent =
        "Bitte gültige Koordinaten und eine Zoomstufe zwischen 1 und 19 eingeben.";
      el("orteKarteEinstellungenFehler").hidden = false;
      return;
    }
    el("orteKarteEinstellungenSpeichern").disabled = true;
    try {
      kartenEinstellungen = await OrteService.kartenEinstellungenSpeichern(daten);
      kartenEinstellungenSchliessen();
      AppFeedback.success("Karteneinstellungen gespeichert.");
    } catch (error) {
      el("orteKarteEinstellungenFehler").textContent = error.message;
      el("orteKarteEinstellungenFehler").hidden = false;
    } finally {
      el("orteKarteEinstellungenSpeichern").disabled = false;
    }
  }

  function bilderAuswaehlen(event) {
    el("orteModalFehler").hidden = true;
    for (const datei of event.target.files) {
      try {
        OrteService.bildValidieren(datei);
        neueDateien.push({ datei, url: URL.createObjectURL(datei) });
      } catch (error) {
        console.error("Ortsbild-Validierung:", { dateiname: datei.name, error });
        el("orteModalFehler").textContent = error.message;
        el("orteModalFehler").hidden = false;
      }
    }
    event.target.value = "";
    bilderRendern();
  }

  function bilderRendern() {
    const container = el("orteBilderVorschau");
    container.innerHTML = "";
    [...vorhandeneBilder.map((bild) => ({ ...bild, vorhanden: true })),
      ...neueDateien.map((bild, index) => ({ ...bild, index, dateiname: bild.datei.name }))]
      .forEach((bild) => {
        const figure = document.createElement("figure");
        figure.className = "orte-image-card";
        const link = document.createElement("a");
        link.href = bild.url;
        link.target = "_blank";
        link.rel = "noopener";
        const image = document.createElement("img");
        image.src = bild.url;
        image.alt = bild.dateiname;
        link.appendChild(image);
        const caption = document.createElement("figcaption");
        caption.textContent = bild.dateiname;
        const controls = document.createElement("div");
        controls.className = "orte-image-order";
        const hoch = document.createElement("button");
        hoch.type = "button";
        hoch.textContent = "↑";
        hoch.title = hoch.ariaLabel = "Bild nach vorne";
        hoch.dataset.move = "up";
        hoch.dataset.imageId = bild.vorhanden ? bild.id : "";
        if (!bild.vorhanden) hoch.dataset.newIndex = bild.index;
        const runter = document.createElement("button");
        runter.type = "button";
        runter.textContent = "↓";
        runter.title = runter.ariaLabel = "Bild nach hinten";
        runter.dataset.move = "down";
        runter.dataset.imageId = bild.vorhanden ? bild.id : "";
        if (!bild.vorhanden) runter.dataset.newIndex = bild.index;
        controls.append(hoch, runter);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "orte-image-remove";
        remove.textContent = "×";
        remove.title = remove.ariaLabel = "Bild löschen";
        remove.dataset.imageId = bild.vorhanden ? bild.id : "";
        if (!bild.vorhanden) remove.dataset.newIndex = bild.index;
        figure.append(link, caption, controls, remove);
        container.appendChild(figure);
      });
  }

  async function bildAktion(event) {
    const moveButton = event.target.closest("button[data-move]");
    if (moveButton) {
      const richtung = moveButton.dataset.move === "up" ? -1 : 1;
      if (moveButton.dataset.imageId) {
        const index = vorhandeneBilder.findIndex((item) => String(item.id) === moveButton.dataset.imageId);
        const ziel = index + richtung;
        if (index < 0 || ziel < 0 || ziel >= vorhandeneBilder.length) return;
        [vorhandeneBilder[index], vorhandeneBilder[ziel]] = [vorhandeneBilder[ziel], vorhandeneBilder[index]];
        try {
          await OrteService.bilderSortieren(aktuellerOrt.id, vorhandeneBilder);
        } catch (error) {
          [vorhandeneBilder[index], vorhandeneBilder[ziel]] = [vorhandeneBilder[ziel], vorhandeneBilder[index]];
          AppFeedback.error(error.message);
          return;
        }
      } else {
        const index = Number(moveButton.dataset.newIndex);
        const ziel = index + richtung;
        if (index < 0 || ziel < 0 || ziel >= neueDateien.length) return;
        [neueDateien[index], neueDateien[ziel]] = [neueDateien[ziel], neueDateien[index]];
      }
      bilderRendern();
      return;
    }
    const button = event.target.closest(".orte-image-remove");
    if (!button) return;
    if (button.dataset.imageId) {
      const bild = vorhandeneBilder.find((item) => String(item.id) === button.dataset.imageId);
      if (!bild || !confirm("Bild wirklich löschen?")) return;
      try {
        await OrteService.bildLoeschen(bild);
        vorhandeneBilder = vorhandeneBilder.filter((item) => item !== bild);
        if (aktuellerOrt?.id) await OrteService.bilderSortieren(aktuellerOrt.id, vorhandeneBilder);
      } catch (error) { AppFeedback.error(error.message); return; }
    } else {
      const index = Number(button.dataset.newIndex);
      URL.revokeObjectURL(neueDateien[index].url);
      neueDateien.splice(index, 1);
    }
    bilderRendern();
  }

  async function speichern() {
    const reviereinrichtung = aktuellerOrt ? aktuellerOrt.reviereinrichtung : aktiveEinrichtungen;
    const daten = {
      nr: el("orteNr").value, name: el("orteName").value.trim(),
      art: reviereinrichtung ? el("orteArt").value : null,
      info: el("orteInfo").value, latitude, longitude, reviereinrichtung,
    };
    if (!daten.name || (reviereinrichtung && !daten.art)) {
      el("orteModalFehler").textContent = reviereinrichtung
        ? "Name und Art sind erforderlich." : "Name ist erforderlich.";
      el("orteModalFehler").hidden = false;
      return;
    }
    const speichernButton = el("orteSpeichern");
    const urspruenglicherText = speichernButton.textContent;
    el("orteModalFehler").hidden = true;
    speichernButton.disabled = true;
    speichernButton.textContent = "Speichert …";
    try {
      let ortId = aktuellerOrt?.id;
      console.info("Ort speichern: Datensatz", { ortId, reviereinrichtung });
      const gespeicherterOrt = ortId
        ? await OrteService.ortAendern(ortId, daten)
        : await OrteService.ortAnlegen(daten);
      ortId = gespeicherterOrt?.id || ortId;
      if (!ortId) throw new Error("Der Ort wurde gespeichert, aber es wurde keine Ort-ID zurückgegeben.");
      if (neueDateien.length) {
        speichernButton.textContent = `Fotos speichern (${neueDateien.length}) …`;
        neueDateien.forEach((item) => OrteService.bildValidieren(item.datei));
        console.info("Ort speichern: Bilder hochladen", { ortId, anzahl: neueDateien.length });
        await OrteService.bilderHochladen(ortId, neueDateien.map((item) => item.datei), vorhandeneBilder.length);
      }
      console.info("Ort speichern: Übersicht aktualisieren", { ortId });
      await laden();
      modalSchliessen();
      AppFeedback.success("Ort gespeichert.");
    } catch (error) {
      console.error("Ort/Bilder speichern fehlgeschlagen:", error);
      el("orteModalFehler").textContent = error?.message || "Ort oder Foto konnte nicht gespeichert werden.";
      el("orteModalFehler").hidden = false;
    } finally {
      speichernButton.disabled = false;
      speichernButton.textContent = urspruenglicherText;
    }
  }

  function modalSchliessen() {
    kartenInitialisierung += 1;
    neueDateien.forEach((bild) => URL.revokeObjectURL(bild.url));
    neueDateien = [];
    el("orteModal").style.display = "none";
    el("orteModal").setAttribute("aria-hidden", "true");
    aktuellerOrt = null;
    kartenNurLesen = false;
  }

  return { init };
})();
