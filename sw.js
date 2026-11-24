/**
 * SUSHEE Karaoke - Service Worker (Stage 2 Offline Support)
 * - App shell: Network-first with cache fallback (ensures fresh updates when online, full boot when offline)
 * - Downloaded songs & lyrics: Served from offline cache when available
 */
const APP_SHELL_CACHE = 'sushee-shell-v6';
const OFFLINE_SONGS_CACHE = 'sushee-offline-songs-v1';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/i18n.js',
  './js/lrc-parser.js',
  './js/audio-effects.js',
  './js/storage-scanner.js',
  './js/recorder.js',
  './js/visualizer.js',
  './js/cloud-catalog.js',
  './js/hosting-service.js',
  './js/offline-manager.js',
  './js/lyric-sync-manager.js',
  './js/share-manager.js',
  './js/vocal-scorer.js',
  './js/library-prefs.js',
  './js/lrc-editor.js',
  './js/score-card.js',
  './js/auto-updater.js',
  './js/app.js',
  './assets/icon.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/splash-photo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => Promise.allSettled(APP_SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_SHELL_CACHE && k !== OFFLINE_SONGS_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Let browser handle partial Range requests directly unless cached offline
  const hasRange = req.headers && req.headers.has('range');
  const url = new URL(req.url);

  // 1. Check offline songs cache first for remote audio/LRC
  if (url.origin !== self.location.origin) {
    if (hasRange) return;
    event.respondWith(
      caches.open(OFFLINE_SONGS_CACHE).then((cache) =>
        cache.match(req.url).then((cached) => cached || fetch(req))
      )
    );
    return;
  }

  // 2. Same-origin app shell: network-first, fallback to cache (strip ?v=... query for matching)
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
