/* Genuine app shell worker. Business/API responses and mutations are never cached or replayed. */
const CACHE_PREFIX = 'genuine-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const OFFLINE_URL = '/offline';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/GGENUINE_FULL_BRAND_PACKAGE/logos/png/g-genuine-app-icon-192x192.png',
  '/GGENUINE_FULL_BRAND_PACKAGE/pwa/g-genuine-maskable-192x192.png',
  '/GGENUINE_FULL_BRAND_PACKAGE/pwa/g-genuine-maskable-512x512.png',
  '/GGENUINE_FULL_BRAND_PACKAGE/pwa/apple-touch-icon-180x180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API, auth, or tenant-scoped page responses. The app uses bearer tokens.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(OFFLINE_URL)) || new Response('You are offline. Reconnect and try again.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // Auth pages can use the generic offline navigation fallback, but are never cached.
  if (url.pathname.startsWith('/login') || url.pathname.startsWith('/register') || url.pathname.startsWith('/reset-password') || url.pathname.startsWith('/forgot-password')) return;

  // Cache only same-origin immutable Next build assets and the explicit public PWA assets.
  const isNextAsset = url.pathname.startsWith('/_next/static/');
  const isPwaAsset = url.pathname.startsWith('/GGENUINE_FULL_BRAND_PACKAGE/') || url.pathname === '/manifest.webmanifest';
  if (!isNextAsset && !isPwaAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (isNextAsset) {
      // Development chunk URLs are stable across edits. Fetch the latest app code
      // first so an installed PWA cannot keep serving an obsolete interactive flow.
      try {
        const response = await fetch(new Request(request, { cache: 'no-cache' }));
        if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || new Response('This resource is not available offline.', { status: 503 });
      }
    }

    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      return new Response('This resource is not available offline.', { status: 503 });
    }
  })());
});
