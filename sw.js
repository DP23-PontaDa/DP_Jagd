const CACHE_NAME = "dp-jagd-shell-v105";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/app-icon.svg",
  "./assets/rechnung-logo.png",
  "./css/layout.css?v=90",
  "./css/sidebar.css",
  "./css/login.css",
  "./css/orte.css?v=99",
  "./js/app.js?v=90",
  "./js/config.js",
  "./js/auth.js?v=94",
  "./js/router.js?v=96",
  "./js/api.js",
  "./js/dashboard.js?v=95",
  "./js/personen.js",
  "./js/abschussplan.js?v=95",
  "./js/abschussplanWildgruppe.js",
  "./js/wildgruppen.js?v=88",
  "./js/stammdaten.js",
  "./js/planpositionen.js",
  "./js/wildhaendler.js?v=88",
  "./js/abschuss.js?v=104",
  "./js/rechnungen.js?v=88",
  "./js/rechnungsvorlage.js",
  "./js/benutzerverwaltung.js?v=95",
  "./js/orte.js?v=103",
  "./js/nachsuchen.js?v=99",
  "./js/import-export.js",
  "./js/mobile.js",
  "./js/components/searchDropdown.js",
  "./js/components/orteAuswahl.js?v=101",
  "./js/components/detailMode.js",
  "./js/components/clientFilter.js",
  "./js/components/appFeedback.js",
  "./js/components/epcQr.js",
  "./js/components/wildklasseColors.js",
  "./js/services/abschussplanService.js",
  "./js/services/dashboardService.js?v=95",
  "./js/services/wildgruppenService.js?v=88",
  "./js/services/wildklassenService.js?v=105",
  "./js/services/planpositionService.js",
  "./js/services/wildhaendlerService.js?v=88",
  "./js/services/abschussService.js?v=99",
  "./js/services/rechnungService.js?v=88",
  "./js/services/rechnungPrintService.js?v=88",
  "./js/services/rechnungsvorlageService.js",
  "./js/services/berechtigungService.js?v=96",
  "./js/services/benutzerverwaltungService.js?v=95",
  "./js/services/orteService.js?v=103",
  "./js/services/nachsuchenService.js?v=99",
  "./js/services/importExportService.js",
  "./pages/login.html",
  "./pages/dashboard.html",
  "./pages/personen.html",
  "./pages/abschussplan.html",
  "./pages/wildgruppen.html",
  "./pages/stammdaten.html",
  "./pages/planpositionen.html",
  "./pages/wildhaendler.html",
  "./pages/abschuss.html",
  "./pages/rechnungen.html",
  "./pages/rechnung-print.html",
  "./pages/rechnungsvorlage.html",
  "./pages/benutzerverwaltung.html",
  "./pages/orte.html",
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
