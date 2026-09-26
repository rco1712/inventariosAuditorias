// Service worker: cachea el "app shell" para que la app abra y funcione sin internet.
// Los datos van por src/db.js (IndexedDB + sync a Supabase), no por aquí.
const CACHE = 'auditoriamodulos-v45';
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
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './logo-badge.png',
  './logo-full.png',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.6/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  // Los archivos de la app se guardan todos; las librerías del CDN, una por una y sin que un
  // fallo (p. ej. mala señal) cancele la actualización completa.
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all([
      cache.addAll(APP_SHELL.filter((u) => !u.startsWith('http'))),
      ...APP_SHELL.filter((u) => u.startsWith('http')).map((u) => cache.add(u).catch(() => {}))
    ])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Actualización automática (confirmado por el usuario: que nadie tenga que borrar caché):
// - Archivos de la app (mismo sitio): primero se piden a internet SIN usar la caché del navegador,
//   así siempre llega la versión más nueva; si no hay internet, se usa la copia guardada.
// - Librerías de CDN (no cambian): se usan de la copia guardada.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mismoSitio = url.origin === self.location.origin;

  if (mismoSitio) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Solo las librerías del CDN se sirven de la copia guardada. Todo lo demás de otros sitios
  // (la base de datos en línea, Supabase) va siempre directo a internet, nunca de caché.
  if (url.hostname !== 'cdn.jsdelivr.net') return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
