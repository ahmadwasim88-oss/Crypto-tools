const CACHE_NAME = "crypto-tools-waz-v3";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./tools/Portfolio_Tracker.html",
  "./tools/CrytoCal.html",
  "./tools/PercentageCalculators.html",
  "./tools/ohlcv.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const requestURL = new URL(request.url);

  if (requestURL.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request, {
        cache: "no-cache"
      });

      if (response && response.ok && response.type === "basic") {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        } catch (error) {
          console.error("Cache update failed:", error);
        }
      }

      return response;
    } catch (error) {
      const cachedResponse = await caches.match(request);

      if (cachedResponse) return cachedResponse;

      if (request.mode === "navigate") {
        const fallback = await caches.match("./index.html");

        if (fallback) return fallback;
      }

      return Response.error();
    }
  })());
});
