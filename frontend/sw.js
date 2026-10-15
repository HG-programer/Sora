// frontend/sw.js
// Pass-through network-first service worker that immediately clears old caches on activate
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass-through network-first; do not trap stale assets in WebView or browsers
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
