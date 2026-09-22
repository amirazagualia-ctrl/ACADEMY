// Service Worker Rahma Academy — rend l'application installable (PWA)
const CACHE = 'rahma-academy-v40';
const PRECACHE = [
  '/static/app.js',
  '/static/public.js',
  '/static/views-core.js',
  '/static/views-academic.js',
  '/static/pdf-fonts.js',
  '/static/views-notebook.js',
  '/static/views-timetable.js',
  '/static/views-homework.js',
  '/static/views-certificates.js',
  '/static/views-import.js',
  '/static/views-progress.js',
  '/static/views-admin.js',
  '/static/views-chat.js',
  '/static/styles.css',
  '/static/logo-rahma.png', '/static/logo-rahma-circle.png',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/avatars/boy1.jpg',
  '/static/avatars/boy2.jpg',
  '/static/avatars/boy3.jpg',
  '/static/avatars/boy4.jpg',
  '/static/avatars/girl1.jpg',
  '/static/avatars/girl2.jpg',
  '/static/avatars/girl3.jpg',
  '/static/avatars/girl4.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Jamais de cache pour l'API : toujours réseau
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;

  // Pages HTML : réseau d'abord, cache en secours (hors-ligne)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Statiques même origine : cache d'abord, réseau en secours
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
      )
    );
  }
});
