const CACHE_NAME = "dp-jagd-shell-v81";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/app-icon.svg",
  "./assets/rechnung-logo.png",
  "./css/layout.css",
  "./css/sidebar.css",
  "./css/login.css",
  "./js/app.js",
  "./js/config.js",
  "./js/auth.js",
  "./js/router.js",
  "./js/api.js",
  "./js/dashboard.js",
  "./js/personen.js",
  "./js/abschussplan.js",
  "./js/abschussplanWildgruppe.js",
  "./js/wildgruppen.js",
  "./js/stammdaten.js",
  "./js/planpositionen.js",
  "./js/wildhaendler.js",
  "./js/abschuss.js",
  "./js/rechnungen.js",
  "./js/rechnungsvorlage.js",
  "./js/nachsuchen.js",
  "./js/import-export.js",
  "./js/mobile.js",
  "./js/components/searchDropdown.js",
  "./js/components/detailMode.js",
  "./js/components/clientFilter.js",
  "./js/components/appFeedback.js",
  "./js/components/epcQr.js",
  "./js/components/wildklasseColors.js",
  "./js/services/abschussplanService.js",
  "./js/services/dashboardService.js",
  "./js/services/wildgruppenService.js",
  "./js/services/wildklassenService.js",
  "./js/services/planpositionService.js",
  "./js/services/wildhaendlerService.js",
  "./js/services/abschussService.js",
  "./js/services/rechnungService.js",
  "./js/services/rechnungPrintService.js",
  "./js/services/rechnungsvorlageService.js",
  "./js/services/nachsuchenService.js",
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
