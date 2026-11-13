// Ordovie — service worker : fonctionnement hors ligne + mises à jour.
// Changer VERSION à chaque publication : le téléphone détecte alors la nouvelle version.
const VERSION = "0.28.1";
const CACHE = "ordovie-" + VERSION;
const FILES = ["./", "./index.html", "./app.js", "./finance-core.js", "./cloture.js", "./tickers.js", "./security.js", "./gerer.js", "./objectifs.js", "./historique.js", "./contrats.js", "./documents.js", "./assistant.js", "./analyses.js", "./portefeuille.js", "./explorer.js", "./coffre.js", "./impots.js", "./rappels.js", "./astuces.js", "./demo-data.js", "./demo.js", "./styles.css", "./manifest.json",
               "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  // cache:"reload" = toujours télécharger depuis le serveur, jamais depuis le cache HTTP du navigateur
  // (sinon une nouvelle version pouvait figer d'anciens fichiers).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
  // Pas de skipWaiting automatique : l'utilisateur choisit quand actualiser (bandeau).
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

// Cache d'abord (rapide, hors ligne) ; la nouvelle version arrive via l'installation d'un nouveau SW.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // jamais d'appels externes en cache (ex. API Claude)
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
