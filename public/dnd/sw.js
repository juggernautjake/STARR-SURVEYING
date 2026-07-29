/* public/dnd/sw.js — the Tabletop service worker (P10-5).
 *
 * SCOPED TO /dnd/ AND NOTHING ELSE. This repo also serves a real surveying business, and a service worker
 * registered at the root would sit in front of every admin page, every receipt upload and every invoice —
 * for every user, permanently, including after this file changed. A worker's scope is capped by the path
 * it is served from, so serving it at `/dnd/sw.js` makes "it cannot touch the business app" a property of
 * the URL rather than a promise in a comment.
 *
 * WHAT IT CACHES, AND WHAT IT DELIBERATELY DOES NOT:
 *
 *   · Static build assets (`/_next/static/…`) and public images — immutable, content-hashed, and the
 *     bulk of what a slow connection at a table is waiting for. Cache-first.
 *   · The offline page. That is all.
 *
 *   · NOT authenticated HTML. A rendered sheet is somebody's character, and a cached one on a shared
 *     device is that character still readable after they sign out — on a page that would otherwise have
 *     redirected. Caching it is the obvious next step for "offline sheets" and it needs a sign-out purge
 *     first; see P10-5b.
 *   · NOT `/api/…`. Every one of those is caller-scoped, and a cached response is a response served to
 *     the wrong caller.
 *   · NOT anything but GET. A cached POST is not a thing, and trying makes the worker throw on every
 *     save.
 */

const VERSION = 'tabletop-v1';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/dnd/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Drop every cache from a previous VERSION. Without this, a stale worker's assets outlive it and the
  // only fix a user has is clearing site data — which they will not know to do.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tabletop-') && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Immutable, content-hashed build output and public art. Everything else goes straight to the network. */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  return url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/dnd/maps/vendor/')
    || /\.(?:png|jpg|jpeg|webp|gif|svg|woff2?|ttf)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        // Only a real 200 is worth keeping. Caching an opaque or error response means serving that error
        // back forever, which looks exactly like a broken deploy.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })),
    );
    return;
  }

  // Navigations: network only, with the offline page as the failure case. NOT network-first-then-cache —
  // nothing authenticated is in the cache to fall back to, by design, and pretending otherwise is how a
  // signed-out user ends up reading a signed-in page.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
