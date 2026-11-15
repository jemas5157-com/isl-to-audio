/* ISL Voice AI service worker: makes the site installable and usable offline.
   Bump VERSION whenever you upload new files so phones pick them up. */
const VERSION = 'isl-v1';
const SHELL = ['./', './index.html', './translate.html', './train.html', './isl-core.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

async function put(req, res) {
  if (res && (res.ok || res.type === 'opaque')) { const c = await caches.open(VERSION); c.put(req, res.clone()); }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // MediaPipe AI files from the CDN: cache after first download so the app works offline.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(req, r))));
    return;
  }
  if (url.origin !== location.origin) return;

  // model.json: always try the network first so new models show up, fall back to cache offline.
  if (url.pathname.endsWith('/model.json')) {
    e.respondWith(fetch(req).then((r) => put(req, r)).catch(() => caches.match(req)));
    return;
  }

  // Everything else: show the cached copy fast, refresh it in the background.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => put(req, r)).catch(() => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    return hit || net;
  }));
});
