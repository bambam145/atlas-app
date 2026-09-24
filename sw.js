// Service worker: la app abre sin internet. Red primero, caché como respaldo.
const CACHE = 'atlas-v27';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/main.js', './js/store.js', './js/config.js', './js/cloud.js', './js/util.js', './js/icons.js', './js/ui.js', './js/sheets.js',
  './js/habits.js', './js/tasks.js', './js/goals.js', './js/xp.js',
  './js/views/hoy.js', './js/views/tareas.js', './js/views/planner.js', './js/views/habitos.js',
  './js/views/metas.js', './js/views/diario.js', './js/views/stats.js', './js/views/resumen.js', './js/views/logros.js', './js/views/mapa.js', './js/views/auth.js', './js/views/onboarding.js', './js/views/paywall.js', './js/share.js', './js/pixel.js', './js/push.js', './js/install.js', './css/legal.css', './terminos.html', './privacidad.html',
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
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    actions: d.act ? (d.actions || []) : [], // botones: "Sano", "+1 vaso"…
    data: { url: d.url || './', act: d.act || null, title: d.title || '' },
  }));
});

const openApp = (path) => {
  const url = new URL(path || './', self.registration.scope).href;
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { if (path && path !== './') w.navigate(url).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(url);
  });
};

// Botón del aviso: registra sin abrir la app. Tocar el aviso: abre (o enfoca) atlas.
self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  n.close();
  const d = n.data || {};
  if (!e.action || !d.act) { e.waitUntil(openApp(d.url)); return; }
  const btn = (n.actions || []).find((a) => a.action === e.action);
  e.waitUntil(
    fetch(d.act.url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ token: d.act.token, value: e.action }) })
      .then((r) => r.json())
      .then((res) => {
        if (!res.ok) throw new Error('no');
        // La app (si está abierta) baja el cambio de la nube.
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => list.forEach((c) => c.postMessage({ type: 'atlas-pull' })));
        return self.registration.showNotification(`✓ ${d.title}`, {
          body: `${btn ? btn.title : 'Registrado'} · guardado`, tag: n.tag, silent: true,
          icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' },
        });
      })
      .catch(() => openApp('./')) // sin internet o error: abrir la app para registrarlo ahí
  );
});
