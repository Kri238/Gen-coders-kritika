/* Label Lab service worker — app-shell + runtime caching so repeat scans
   don't re-download the OCR engine, fonts, or export library every time. */
const CACHE_VERSION = "labellab-v1";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isCDN = url.hostname.includes("jsdelivr.net")
    || url.hostname.includes("unpkg.com")
    || url.hostname.includes("googleapis.com")
    || url.hostname.includes("gstatic.com")
    || url.hostname.includes("cdn.jsdelivr.net");

  if (isCDN) {
    // Cache-first: the OCR engine, worker script, wasm/traineddata, fonts, and
    // html2canvas rarely change once fetched — this is what makes repeat scans fast.
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // Network-first for the app shell itself, falling back to cache when offline.
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
  }
});
