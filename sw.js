const CACHE_NAME = "dp-jagd-shell-v153";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/app-icon.svg",
  "./assets/rechnung-logo.png",
  "./css/layout.css?v=153",
  "./css/sidebar.css",
  "./css/login.css",
  "./css/orte.css?v=110",
  "./css/tagebuch.css?v=112",
  "./css/st-peter-mitterberg.css?v=114",
  "./css/hashtag-input.css?v=115",
  "./js/app.js?v=90",
  "./js/config.js",
  "./js/auth.js?v=94",
  "./js/router.js?v=140",
  "./js/api.js?v=122",
  "./js/dashboard.js?v=152",
  "./js/personen.js?v=122",
  "./js/abschussplan.js?v=129",
  "./js/freigaben.js?v=151",
  "./js/abschussplanWildgruppe.js?v=137",
  "./js/wildgruppen.js?v=88",
  "./js/stammdaten.js?v=146",
  "./js/abschussregeln.js?v=151",
  "./js/planpositionen.js",
  "./js/wildhaendler.js?v=88",
  "./js/abschuss.js?v=146",
  "./js/rechnungen.js?v=88",
  "./js/rechnungsvorlage.js",
  "./js/benutzerverwaltung.js?v=95",
  "./js/orte.js?v=127",
  "./js/nachsuchen.js?v=99",
  "./js/import-export.js?v=128",
  "./js/mobile.js",
  "./js/components/searchDropdown.js",
  "./js/components/orteKarte.js?v=118",
  "./js/components/orteAuswahl.js?v=108",
  "./js/services/hashtagService.js?v=115",
  "./js/components/hashtagInput.js?v=115",
  "./js/components/detailMode.js?v=129",
  "./js/components/clientFilter.js",
  "./js/components/appFeedback.js",
  "./js/components/epcQr.js",
  "./js/components/wildklasseColors.js",
  "./js/services/abschussplanService.js?v=137",
  "./js/services/abschussregelnService.js?v=151",
  "./js/services/freigabenService.js?v=151",
  "./js/services/dashboardService.js?v=138",
  "./js/services/wildgruppenService.js?v=88",
  "./js/services/wildklassenService.js?v=151",
  "./js/services/planpositionService.js",
  "./js/services/wildhaendlerService.js?v=88",
  "./js/services/abschussService.js?v=151",
  "./js/services/rechnungService.js?v=88",
  "./js/services/rechnungPrintService.js?v=88",
  "./js/services/rechnungsvorlageService.js",
  "./js/services/berechtigungService.js?v=140",
  "./js/services/benutzerverwaltungService.js?v=95",
  "./js/services/orteService.js?v=127",
  "./js/services/tagebuchartenService.js?v=111",
  "./js/services/tagebuchDpService.js?v=112",
  "./js/tagebucharten.js?v=111",
  "./js/tagebuch-dp.js?v=115",
  "./js/services/journalKategorienService.js?v=114",
  "./js/services/stPeterMitterbergService.js?v=114",
  "./js/journal-kategorien.js?v=114",
  "./js/st-peter-mitterberg.js?v=115",
  "./js/services/nachsuchenService.js?v=99",
  "./js/services/importExportService.js?v=126",
  "./pages/login.html",
  "./pages/dashboard.html",
  "./pages/personen.html",
  "./pages/abschussplan.html",
  "./pages/freigaben.html",
  "./pages/wildgruppen.html",
  "./pages/stammdaten.html",
  "./pages/abschussregeln.html",
  "./pages/planpositionen.html",
  "./pages/wildhaendler.html",
  "./pages/abschuss.html",
  "./pages/rechnungen.html",
  "./pages/rechnung-print.html",
  "./pages/rechnungsvorlage.html",
  "./pages/benutzerverwaltung.html",
  "./pages/orte.html",
  "./pages/tagebucharten.html",
  "./pages/tagebuch-dp.html",
  "./pages/journal-kategorien.html",
  "./pages/st-peter-mitterberg.html",
  "./pages/nachsuchen.html",
  "./pages/import-export.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) => cached || (event.request.mode === "navigate"
            ? caches.match("./index.html")
            : Response.error()),
        ),
      ),
  );
});
