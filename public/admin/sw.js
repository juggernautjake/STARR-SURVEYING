/* public/admin/sw.js — the surveying business app's service worker (PWA plan W2).
 *
 * `public/manifest.json` has promised an installable app at `/admin/me` for some time, and nothing
 * registered a worker for it. So a crew member could add it to a home screen and get no offline
 * behaviour and no push — a manifest writing a cheque the app did not honour. This is the worker.
 *
 * SCOPED TO /admin/ AND NOTHING ELSE, deliberately, exactly like the tabletop worker. A worker's
 * scope is capped by the path it is SERVED from, so serving this at `/admin/sw.js` makes "it cannot
 * touch /dnd or /AndrewAsh" a property of the URL rather than a promise in a comment. Those two
 * areas already run their own workers; three scoped workers that cannot reach each other is the
 * architecture this repo already chose.
 *
 * ── WHAT IT CACHES, AND WHAT IT MUST NOT ───────────────────────────────────────────────────────
 *
 *   · Static build output (`/_next/static/…`) and public images — immutable and content-hashed.
 *     Cache-first. This is the bulk of what a phone on a rural connection waits for.
 *   · The offline page. That is all.
 *
 *   · NOT authenticated HTML. An admin page is somebody's job list, somebody's payroll, somebody's
 *     receipts. A cached one on a shared device is that data still readable after they sign out, on
 *     a page that would otherwise have redirected to a login. This is a stronger reason here than it
 *     is for a character sheet.
 *   · NOT `/api/…`. Every route is caller-scoped and role-gated; a cached response is a response
 *     served to the wrong person, which in this app means someone else's pay or someone else's job.
 *   · NOT anything but GET. A cached POST is not a thing, and attempting it makes the worker throw
 *     on every save — including the field-crew saves that must not fail.
 *
 * The field-crew offline case the owner actually wants — an approved research packet readable with
 * no signal — is deliberately NOT here. `lib/research/packet-offline.ts` already decides what a
 * stored copy may CLAIM (live / offline / stale / refused, with "none" kept distinct from "not
 * recorded"), and wiring a cache under it without those rules would produce a crew reading a
 * superseded packet with no way to tell. That is plan slice W3, not this one.
 */

const VERSION = 'starr-admin-v1';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/admin/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Drop every cache from a previous VERSION. Without this a stale worker's assets outlive it and
  // the only fix a user has is clearing site data, which they will not know to do.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('starr-admin-') && !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Immutable, content-hashed build output and public art. Everything else goes to the network. */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  return url.pathname.startsWith('/_next/static/')
    || /\.(?:png|jpg|jpeg|webp|gif|svg|woff2?|ttf)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        // Only a real 200 is worth keeping. Caching an opaque or error response serves that error
        // back forever, which looks exactly like a broken deploy and is diagnosed as one.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })),
    );
    return;
  }

  // Navigations: network only, with the offline page as the failure case. NOT
  // network-first-then-cache — nothing authenticated is in the cache to fall back to, by design, and
  // pretending otherwise is how a signed-out user ends up reading a signed-in page.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
