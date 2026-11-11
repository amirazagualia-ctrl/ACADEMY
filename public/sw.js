// Service Worker Rahma Academy — rend l'application installable (PWA)
const CACHE = 'rahma-academy-v68';
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
  '/static/views-ai.js',
  '/static/views-eva-i18n.js',
  '/static/views-eva-editor.js',
  '/static/views-evaluations.js',
  '/static/views-bank.js',
  '/static/views-curriculum.js',
  '/static/views-tenants.js',
  '/static/views-tutor.js',
  '/static/views-math6.js',
  '/static/situations-data-1.js',
  '/static/situations-data-2.js',
  '/static/situations-data-3.js',
  '/static/views-situations.js',
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

  // Manifest PWA et icônes : TOUJOURS réseau. Sinon le logo / le nom / les couleurs
  // d'un établissement resteraient figés sur la première version mise en cache
  // (cause du « logo et PWA ne s'appliquent pas »).
  if (url.pathname === '/manifest.json' || url.pathname.startsWith('/static/icons/') || url.pathname.startsWith('/static/branding/')) return;

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
  // (les logos téléversés peuvent changer : revalidation réseau en arrière-plan)
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res })
        .catch(() => caches.match(e.request))
    );
  }
});
