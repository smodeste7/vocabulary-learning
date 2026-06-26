// service-worker.js — Cache statique minimaliste, chemins RELATIFS (GitHub Pages /repo/).
// Statique : Cache First. Données thèmes : stale-while-revalidate (MAJ en arrière-plan).
// Audio : Cache First avec repli réseau (les MP3 sont immuables une fois présents).

// ⚠️ Incrémenter la version à CHAQUE changement d'assets pré-cachés (force la MAJ).
const CACHE = 'darija-vocab-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/data.js',
  './js/ui.js',
  './js/srs.js',
  './js/progress.js',
  './js/gamification.js',
  './js/gdrive.js',
  './js/modes/explore.js',
  './js/modes/flashcard.js',
  './js/modes/quiz.js',
  './js/modes/boss.js',
  './data/themes.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // allSettled : un asset absent ne fait pas échouer toute l'installation.
      .then(c => Promise.allSettled(STATIC_ASSETS.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // On ne gère que notre origine (laisse passer Google APIs, fonts, GIS…).
  if (url.origin !== self.location.origin) return;

  // Fichiers thèmes : stale-while-revalidate (on sert le cache, on rafraîchit en fond).
  if (url.pathname.includes('/data/themes/')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Audio : Cache First, repli réseau (et mise en cache au passage). Aucun fallback HTML :
  // un MP3 manquant doit « échouer » pour que l'app bascule sur la synthèse vocale.
  if (url.pathname.includes('/audio/')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Statique : Cache First, repli réseau (mise en cache au passage), puis index.html.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
