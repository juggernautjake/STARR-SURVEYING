/* public/AndrewAsh/sw.js — Andrew Ash's service worker.
 *
 * SCOPED TO /AndrewAsh/ AND NOTHING ELSE, enforced by the path this file is served from. See the note
 * in app/AndrewAsh/_ui/RegisterVoicePWA.tsx for why that matters on a domain that also runs a
 * surveying business.
 *
 * ── WHAT IT CACHES, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────────────────────────
 *
 *   · Content-hashed build output (/_next/static/…), Andrew's photographs, and fonts. Immutable, and
 *     the bulk of what a phone on a bad connection waits for. Cache-first.
 *   · The offline page. That is all.
 *
 *   · NOT /AndrewAsh/studio/… HTML. Those pages contain a client list, unpaid invoices and signed
 *     contracts. A cached studio page is that data still readable on a shared or stolen device after
 *     sign-out, on a page that would otherwise have redirected to the login.
 *   · NOT /api/…. Every one of those is caller-scoped; a cached response is a response served to the
 *     wrong caller.
 *   · NOT audio or video. Demo reels are large and change when Andrew re-records them; a stale reel
 *     in a cache is an old take being played to a casting director.
 *   · NOT anything but GET. A cached POST is not a thing, and attempting it makes the worker throw on
 *     every form submission.
 */

const VERSION = 'andrewash-v1';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/AndrewAsh/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Drop every cache from a previous VERSION. Without this a stale worker's assets outlive it and the
  // only fix a user has is clearing site data — which they will not know to do.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('andrewash-') && !k.startsWith(VERSION)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  // Audio and video are excluded by extension before the image/font test below can match them.
  if (/\.(?:mp3|wav|m4a|aac|ogg|mp4|webm|mov)$/i.test(url.pathname)) return false;
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/andrew/photos/') ||
    /\.(?:png|jpg|jpeg|webp|gif|svg|woff2?|ttf|ico)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            // Only cache a genuine 200 from our own origin. Caching an opaque cross-origin response
            // or a 404 poisons the cache with something that can never be corrected by a reload.
            if (response.ok && response.type === 'basic') {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first, falling back to the offline page. Nothing is stored, so no page's
  // contents survive the request that fetched it.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});

/* ── PUSH ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The payload is JSON written by lib/voice/notifications.ts. It is parsed defensively: a push that
 * arrives malformed still shows SOMETHING, because a notification that throws in this handler is a
 * notification the operating system silently drops, and Andrew never learns an invoice was paid.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Andrew Ash Studio', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Andrew Ash Studio';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/AndrewAsh/icon-192.png',
      badge: '/AndrewAsh/icon-192.png',
      // Tagging by kind collapses repeats: five overdue-invoice pushes become one line in the tray
      // rather than five, which is the difference between a useful alert and one that gets muted.
      tag: payload.kind || 'general',
      renotify: false,
      data: { href: payload.href || '/AndrewAsh/studio' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/AndrewAsh/studio';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if the app is already open, rather than opening a second copy — the
      // behaviour that makes an installed PWA feel like an app instead of a bookmark.
      for (const client of clientList) {
        if (client.url.includes('/AndrewAsh') && 'focus' in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
