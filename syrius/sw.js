'use strict';

// Pas de cache de session, d’API, de position ou d’audio. Seul l’écran hors
// connexion est conservé ; le code de la radio vient toujours du réseau.
const CACHE = 'syrius-offline-v2';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/syrius/offline.html')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('syrius-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin || !url.pathname.startsWith('/syrius/')) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match('/syrius/offline.html')) || Response.error()));
});
