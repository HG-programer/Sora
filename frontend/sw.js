// frontend/sw.js
// Production Service Worker for Sora PWA (Offline shell caching & stale-while-revalidate)
const CACHE_NAME = "sora-shell-v3";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/api.js",
  "/js/catalog.js",
  "/js/app.js",
  "/privacy.html",
  "/assets/icon.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn("[Sora SW] Precaching notice:", err);
      })
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Strictly bypass all cross-origin requests (CDNs, external image hosts, AI APIs)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never intercept API calls, non-GET requests, or non-HTTP protocols
  if (
    url.pathname.startsWith("/api/") ||
    event.request.method !== "GET" ||
    !url.protocol.startsWith("http")
  ) {
    return;
  }

  // Stale-While-Revalidate for app shell and static resources
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const toCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
          }
          return networkResponse;
        })
        .catch(() => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
          return null;
        });

      return cached || fetchPromise;
    })
  );
});
