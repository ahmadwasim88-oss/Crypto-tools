const CACHE_NAME = "crypto-tools-waz-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./Portfolio_Tracker.html",
  "./Scanner.html",
  "./CrytoCal.html",
  "./Percentage%20Calculators.html",
  "./ohlcv.html"
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

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok && response.type === "basic") {
          const responseCopy = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, responseCopy));
        }

        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) return cachedResponse;

        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }

        return Response.error();
      })
  );
});
