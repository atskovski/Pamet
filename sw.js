/* ============================================================
   Pamet — service worker (v1.0.1)
   App-shell caching for offline use + installability.
   - Precaches the app shell (HTML/CSS/JS/icons/manifest).
   - Serves a network-first strategy for the shell so updates
     land quickly, falling back to cache when offline.
   - Never caches user data (that lives in localStorage / backend).
   ============================================================ */
const CACHE = "pamet-shell-v1";

const SHELL = [
  "/index.html",
  "/css/styles.css",
  "/js/store.js",
  "/js/auth.js",
  "/js/app.js",
  "/manifest.webmanifest",
  "/assets/icon-192.png",
  "/assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle same-origin GETs.
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;

  // Network-first, cache-fallback for the app shell.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html")))
  );
});
