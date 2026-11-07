// Сервис-воркер realme run: после первой загрузки игра запускается без интернета.
// Номер версии и список библиотек подставляет сборка: при каждом выпуске файл меняется, и браузер сам ставит обновление.
const BUILD = '5683ff00be';
const SHELL = 'realmerun-shell-' + BUILD;      // сама игра (index.html, иконки): новая версия — новый кэш
const LIBS = 'realmerun-libs-v1';              // Three.js с CDN: версия зашита в адрес, перекачивать не нужно
const CDN_HOST = 'cdn.jsdelivr.net';
const FILES = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const LIB_URLS = [
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js"
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
    const libs = await caches.open(LIBS);
    // библиотеки — «по возможности»: если CDN недоступен, дозагрузятся при первом запуске с интернетом
    await Promise.all(LIB_URLS.map(async (u) => { try { if (!(await libs.match(u))) await libs.add(new Request(u, { mode: 'cors' })); } catch (_) { /* ok */ } }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('realmerun-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Страница: сначала сеть (чтобы новая версия приходила сразу), но если связи нет или она медленнее 3,5 с — берём из кэша.
async function page(e) {
  const shell = await caches.open(SHELL), cached = await shell.match('index.html');
  const net = fetch(e.request).then((r) => { if (r && r.ok) shell.put('index.html', r.clone()); return r; });
  e.waitUntil(net.catch(() => {}));
  if (!cached) return net;
  return Promise.race([net.catch(() => cached), new Promise((res) => setTimeout(() => res(cached), 3500))]);
}
// Остальное (иконки, Three.js): из кэша, а если нет — из сети с сохранением.
async function asset(req, url) {
  const c = await caches.open(url.hostname === CDN_HOST ? LIBS : SHELL);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  const r = await fetch(req);
  if (r && r.ok && (r.type === 'basic' || r.type === 'cors')) c.put(req, r.clone());
  return r;
}
async function fresh(req) {
  const c = await caches.open(SHELL);
  try { const r = await fetch(req, { cache: 'no-store' }); if (r && r.ok) c.put(req, r.clone()); return r; } catch (_) { const hit = await c.match(req, { ignoreVary: true }); if (hit) return hit; throw _; }
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { if (url.origin === self.location.origin) e.respondWith(page(e)); return; }
  // config.json (адрес рейтинга) и crest.png (герб) меняются без новой версии игры — берём из сети, а без связи из кэша
  if (url.origin === self.location.origin && /\/(config\.json|crest\.png)$/.test(url.pathname)) { e.respondWith(fresh(req)); return; }
  if (url.origin === self.location.origin || url.hostname === CDN_HOST) e.respondWith(asset(req, url));
});
