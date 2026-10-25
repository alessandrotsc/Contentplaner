/* Service Worker. Haelt die App offline lauffaehig.
   Bei jeder Aenderung an den Dateien die VERSION hochzaehlen, sonst zeigt
   das iPhone hartnaeckig die alte Fassung. */
const VERSION = "contentplaner-v22";
const DATEIEN = [
  "./", "./index.html", "./manifest.webmanifest",
  "./src/styles.css", "./src/app.js", "./src/store.js",
  "./src/datum.js", "./src/ui.js", "./src/zustand.js", "./src/kalender.js",
  "./src/formate.js", "./src/analytics.js", "./src/quellen.js", "./src/mehr.js", "./src/server.js", "./src/detail.js", "./src/posten.js",
  "./assets/icon-180.png", "./assets/icon-192.png",
  "./assets/icon-512.png", "./assets/icon-1024.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN.map((d) => new Request(d, { cache: "no-cache" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    // no-cache: beim Server nachfragen statt alte Dateien aus dem Browser-Zwischenspeicher zu nehmen
    fetch(e.request, { cache: "no-cache" })
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(VERSION).then((c) => c.put(e.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(e.request).then((t) => t || caches.match("./index.html")))
  );
});
