// Service worker: cachea el "app shell" para que la app abra y funcione sin internet.
// Los datos van por src/db.js (IndexedDB + sync a Supabase), no por aquí.
const CACHE = 'auditoriamodulos-v36';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './bootstrap.js',
  './db.js',
  './supabase.js',
  './auth.js',
  './icon-192.png',
  './icon-512.png',
  './logo-badge.png',
  './logo-full.png',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.6/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first para el app shell y las librerías de CDN; network-first (con fallback a cache)
// para todo lo demás, así siempre hay algo que mostrar sin internet.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Refresca en segundo plano si hay conexión, sin bloquear la respuesta.
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
