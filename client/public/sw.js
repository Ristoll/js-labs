/* global self, caches, URL, fetch */
// Dogfight PWA service worker (Milestone 4).
// Minimal installable shell: caches the app HTML + critical assets so the
// game loads offline after the first visit. Does NOT cache the WebSocket
// endpoint — reconnection is handled by GameSocket when online.

const CACHE_NAME = 'dogfight-v1';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/src/style.css',
  '/assets/sprites/ship.png',
  '/assets/sprites/asteroid.png',
  '/assets/sprites/bullet.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept the WebSocket upgrade or the API/health endpoints.
  if (
    url.pathname === '/ws' ||
    url.pathname.startsWith('/api') ||
    url.pathname === '/health' ||
    url.pathname === '/ready' ||
    url.pathname === '/metrics'
  ) {
    return;
  }

  // Cache-first for shell assets, network-first otherwise.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && request.method === 'GET') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
