const CACHE = 'codex-pocket-trusted-v2';
const ASSETS = ['/codex-pocket-trusted-web/', '/codex-pocket-trusted-web/app.js', '/codex-pocket-trusted-web/login-loader.js', '/codex-pocket-trusted-web/markdown.js', '/codex-pocket-trusted-web/accounts.js', '/codex-pocket-trusted-web/icons.js', '/codex-pocket-trusted-web/delivery.js', '/codex-pocket-trusted-web/chronology.js', '/codex-pocket-trusted-web/account-crypto.js', '/codex-pocket-trusted-web/transport.js', '/codex-pocket-trusted-web/style.css', '/codex-pocket-trusted-web/icon.svg', '/codex-pocket-trusted-web/manifest.webmanifest','/codex-pocket-trusted-web/vendor/bundle.js','/codex-pocket-trusted-web/vendor/katex/katex.min.css'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname) || url.search) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname)));
});
