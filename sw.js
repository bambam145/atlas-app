// Service worker: la app abre sin internet. Red primero, caché como respaldo.
const CACHE = 'atlas-v10';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/main.js', './js/store.js', './js/config.js', './js/cloud.js', './js/util.js', './js/icons.js', './js/ui.js', './js/sheets.js',
  './js/habits.js', './js/tasks.js', './js/goals.js', './js/xp.js',
  './js/views/hoy.js', './js/views/tareas.js', './js/views/planner.js', './js/views/habitos.js',
  './js/views/metas.js', './js/views/diario.js', './js/views/stats.js', './js/views/logros.js', './js/views/mapa.js', './js/views/auth.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Nunca cachear la nube (Supabase): los datos siempre deben ser los actuales.
  if (new URL(e.request.url).hostname.endsWith('supabase.co')) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
