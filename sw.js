// Service worker: la app abre sin internet. Red primero, caché como respaldo.
const CACHE = 'atlas-v23';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/main.js', './js/store.js', './js/config.js', './js/cloud.js', './js/util.js', './js/icons.js', './js/ui.js', './js/sheets.js',
  './js/habits.js', './js/tasks.js', './js/goals.js', './js/xp.js',
  './js/views/hoy.js', './js/views/tareas.js', './js/views/planner.js', './js/views/habitos.js',
  './js/views/metas.js', './js/views/diario.js', './js/views/stats.js', './js/views/logros.js', './js/views/mapa.js', './js/views/auth.js', './js/views/onboarding.js', './js/views/paywall.js', './js/share.js', './js/pixel.js', './js/push.js', './js/install.js', './css/legal.css', './terminos.html', './privacidad.html',
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
  const u = new URL(e.request.url);
  if (u.hostname.endsWith('supabase.co') || u.pathname.endsWith('.apk')) return;
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

// Recordatorios: mostrar el aviso que envía el servidor
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'atlas', {
    body: d.body || '', tag: d.tag || 'atlas', renotify: true,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './' },
  }));
});

// Tocar el aviso abre (o enfoca) atlas
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.startsWith(self.registration.scope));
    return w ? w.focus() : self.clients.openWindow(url);
  }));
});
