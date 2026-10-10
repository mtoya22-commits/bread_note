// パンノート service worker — offline app shell.
// デプロイで中身を変えたら VERSION を上げてください（古いキャッシュが破棄されます）。
const VERSION = 'bread-note-v2.1.2';
const ASSETS = [
  './', './index.html', './styles.css',
  './app.js', './app.js?v=2', './db.js', './calc.js', './seed.js',
  './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先：オンラインなら常に最新のファイルを使い、取れたものはキャッシュを更新する。
// オフラインのときだけキャッシュから返す（更新後の最初の起動から新しい版が動く）。
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
