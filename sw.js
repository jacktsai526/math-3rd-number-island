// Offline support: cache the game files so it works without internet after the first visit.
const CACHE = 'niq-v1.0.0';
const FILES = ['./', 'index.html', 'js/game.js', 'js/music.js', 'js/save.js', 'vendor/three.module.min.js', 'vendor/addons/RoundedBoxGeometry.js',
  'fonts/fredoka-latin-500-normal.woff2', 'fonts/fredoka-latin-600-normal.woff2', 'fonts/fredoka-latin-700-normal.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Network first (so updates arrive right away), fall back to cache when offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
