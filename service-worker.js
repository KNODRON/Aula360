const CACHE_NAME = 'docscan-v1';
const ASSETS = [
  '/', '/index.html', '/styles.css', '/app.js',
  '/manifest.json', '/icon-192.png', '/icon-512.png',
  '/icons/cl.png', '/icons/uk.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://docs.opencv.org/4.x/opencv.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
