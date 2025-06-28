// service-worker.js

const CACHE_NAME = 'docscan-cache-v1';
const ASSETS = [
  '/',  
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icons/cl.png',
  '/icons/uk.png',
  // Si quieres cachear también las librerías externas:
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://docs.opencv.org/4.x/opencv.js'
];

// 1) Precaching en el install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 2) Limpieza de caches antiguos en el activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// 3) Estrategia cache-first para assets
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then(response => {
          // Opcional: cachear nuevas peticiones del mismo origen
          // if (event.request.url.startsWith(self.location.origin)) {
          //   caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          // }
          return response;
        })
        .catch(() => {
          // Opcional: fallback si falla la red y no está en cache,
          // p.ej. servir un HTML offline, una imagen genérica, etc.
        });
    })
  );
});
