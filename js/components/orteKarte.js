window.OrteKarte = (() => {
  const SPEICHER = "dpjagd-orte-basiskarte";
  let modal = null;
  let karte = null;
  let marker = null;

  function ansichtLaden() {
    try { return localStorage.getItem(SPEICHER) || "karte"; }
    catch (error) { return "karte"; }
  }

  function ansichtSpeichern(wert) {
    try { localStorage.setItem(SPEICHER, wert); }
    catch (error) { /* Storage darf die Karte nicht blockieren. */ }
  }

  function basiskartenAnlegen(zielKarte) {
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>',
    });
    const satellit = L.tileLayer(
      "https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg",
      {
        maxNativeZoom: 20,
        maxZoom: 20,
        attribution: 'Datenquelle: <a href="https://basemap.at" target="_blank" rel="noopener">basemap.at</a>',
      },
    );
    (ansichtLaden() === "satellit" ? satellit : osm).addTo(zielKarte);
    L.control.layers({ Karte: osm, "Satellit / Luftbild": satellit }, null, {
      position: "topright",
      collapsed: matchMedia("(max-width: 600px)").matches,
    }).addTo(zielKarte);
    zielKarte.on("baselayerchange", (event) => {
      ansichtSpeichern(event.layer === satellit ? "satellit" : "karte");
    });
  }

  function modalAnlegen() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `<div class="modal-content orte-modal-content orte-map-viewer-content">
      <div class="modal-header"><h2 data-map-title>Ort</h2><button class="close-btn" data-map-close type="button" aria-label="Schließen">&times;</button></div>
      <div class="orte-map orte-map-viewer" data-map-container aria-label="Position des Ortes"></div>
    </div>`;
    document.body.appendChild(modal);
    const schliessen = () => { modal.style.display = "none"; modal.setAttribute("aria-hidden", "true"); };
    modal.querySelector("[data-map-close]").addEventListener("click", schliessen);
    modal.addEventListener("click", (event) => { if (event.target === modal) schliessen(); });
  }

  function ortAnzeigen(ort, fallback = { lat: 47.3, lng: 13.7, zoom: 8 }) {
    if (!window.L) throw new Error("Die Karte konnte nicht geladen werden.");
    modalAnlegen();
    modal.querySelector("[data-map-title]").textContent = ort?.name || "Ort";
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    const hatPosition = ort?.latitude !== null && ort?.latitude !== undefined && ort?.latitude !== "" &&
      ort?.longitude !== null && ort?.longitude !== undefined && ort?.longitude !== "" &&
      Number.isFinite(Number(ort.latitude)) && Number.isFinite(Number(ort.longitude));
    const start = hatPosition ? { lat: Number(ort.latitude), lng: Number(ort.longitude), zoom: 17 } : fallback;
    setTimeout(() => {
      if (!karte) {
        karte = L.map(modal.querySelector("[data-map-container]")).setView([start.lat, start.lng], start.zoom);
        basiskartenAnlegen(karte);
      }
      if (marker) { marker.remove(); marker = null; }
      if (hatPosition) marker = L.marker([start.lat, start.lng]).addTo(karte);
      karte.invalidateSize();
      karte.setView([start.lat, start.lng], start.zoom);
      setTimeout(() => karte.invalidateSize(), 100);
    }, 50);
  }

  return { basiskartenAnlegen, ortAnzeigen };
})();
