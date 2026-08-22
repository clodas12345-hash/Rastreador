const CACHE_NAME = 'gkd-mobility-pwa-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Let the browser fetch directly via network first
  event.respondWith(
    fetch(event.request).catch((err) => {
      return caches.match(event.request).then((cached) => cached || Response.error());
    })
  );
});
