/*
 * Lightweight service worker for the editor.
 *
 *
 * HTML, RSC, API responses and cross-origin requests deliberately stay on the
 * network. Only immutable, content-hashed Next.js assets are cached. This keeps
 * deploys atomic: a cached document can never point at removed JS/CSS chunks.
 */

const STATIC_CACHE = 'perler-static-v1';
const MAX_STATIC_ENTRIES = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames
        .filter((name) => (
          name === 'start-url'
          || name === 'offlineCache'
          || name.startsWith('workbox-precache')
          || (name.startsWith('perler-static-') && name !== STATIC_CACHE)
        ))
        .map((name) => caches.delete(name)));
    } catch {
      // Cache Storage 在隐私模式或配额异常时可能拒绝访问；不能阻止新 SW 激活。
    }

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/_next/static/')) return;
  if (request.headers.has('range')) return;

  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
    } catch {
      // 缓存不可用时继续走网络，绝不能让成功的静态资源请求失败。
    }

    const response = await fetch(request);
    if (cache && response.status === 200 && response.type === 'basic') {
      try {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > MAX_STATIC_ENTRIES) {
          await Promise.all(keys
            .slice(0, keys.length - MAX_STATIC_ENTRIES)
            .map((key) => cache.delete(key)));
        }
      } catch {
        // 写缓存失败只影响离线复用，不影响本次网络响应。
      }
    }
    return response;
  })());
});
