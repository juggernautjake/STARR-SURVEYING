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
    // `cache: 'reload'` — fetched past the HTTP cache, so a new worker precaches the CURRENT offline
    // page rather than whatever the browser happens to be holding. Without it the offline screen is
    // the one true stale asset in this worker: it is precached under a `VERSION` that no deploy
    // bumps, so an edit to it would never reach an installed device.
    caches.open(STATIC_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
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
    // ── HASHED FILES ARE CACHED; EVERYTHING ELSE IS FETCHED FRESH (2026-08-04) ────────────────
    //
    // Owner: *"if we push to main and merge to trigger a redeploy, those changes should show up on
    // the browser version and the app version as soon as the deployment happens."*
    //
    // That splits cleanly in two, and the split is the whole design:
    //
    //   * **`/_next/static/`** is content-hashed — a deploy changes the URL. Cache-first is not just
    //     safe, it is the *only* strategy that cannot serve a stale copy, because a stale copy is
    //     unreachable by name. Fast and always current, both.
    //
    //   * **Images and fonts keep their paths.** `/logo.png` is `/logo.png` before and after a
    //     deploy, so anything cache-first serves the old bytes — and `VERSION` is a hardcoded `v1`
    //     no deploy bumps, so the activate handler that clears old caches has never cleared
    //     anything. These go to the network first and fall back to cache only when the network
    //     fails, which is exactly the offline case the cache exists for.
    //
    // The cost is one request per image on a warm load. That is the honest price of "as soon as the
    // deployment happens", and it is paid on the assets least likely to be large.
    const immutable = url.pathname.startsWith('/_next/static/');

    const keep = (res) => {
      // Only a real 200 is worth keeping. Caching an opaque or error response serves that error back
      // forever, which looks exactly like a broken deploy and is diagnosed as one.
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
      }
      return res;
    };

    event.respondWith(
      immutable
        ? caches.match(request).then((hit) => hit || fetch(request).then(keep))
        : fetch(request).then(keep).catch(() => caches.match(request)),
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

/* ── PUSH ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * The payload is JSON written by lib/push/admin-push.ts. Two jobs, and the second is the one the
 * owner actually asked for:
 *
 *   1. Show the OS banner (`showNotification`) — the alert on the lock screen / notification shade,
 *      which is the ONLY thing that arrives when the app is closed.
 *   2. Set the app-icon badge (`navigator.setAppBadge`) — the little count on the home-screen icon.
 *      It carries the recipient's CURRENT unread count, computed server-side at send time, so five
 *      alerts show "5" on the icon rather than each overwriting the last with "1".
 *
 * Parsed defensively: a push that throws in this handler is one the OS silently drops, and then a new
 * lead or a submitted timesheet never reaches the phone at all. Both a malformed payload and a browser
 * without the Badging API degrade to "still show the banner".
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Starr Surveying', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Starr Surveying';
  const badgeCount = typeof payload.unreadCount === 'number' ? payload.unreadCount : null;

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: payload.body || '',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        // Tagging by type collapses repeats of the same kind into one tray line rather than a stack
        // of five — the difference between a useful alert and one the crew learns to swipe away.
        tag: payload.tag || payload.type || 'general',
        renotify: true,
        data: { href: payload.href || '/admin/me' },
      });

      // The app-icon badge. `setAppBadge` lives on `navigator` in a service worker too (WorkerNavigator),
      // so this updates the icon even when no tab is open — which is the whole point of doing it here
      // rather than only in the page. Guarded because Android/desktop support it and older iOS does not.
      if (badgeCount !== null && self.navigator && 'setAppBadge' in self.navigator) {
        try {
          if (badgeCount > 0) await self.navigator.setAppBadge(badgeCount);
          else await self.navigator.clearAppBadge();
        } catch {
          /* Badging refused (permission/support) — the banner already showed, which is the essential half. */
        }
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/admin/me';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing /admin tab and navigate it, rather than opening a second copy — the
      // behaviour that makes an installed PWA feel like an app instead of a bookmark.
      for (const client of clientList) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});

/* ── BACKGROUND UPLOADS (2026-08-19) ───────────────────────────────────────────────────────────
 *
 * Owner: *"I want it so that I can leave the web app and have it still working in the background
 * while I'm doing other things on my phone, and then once it is done it can notify me."*
 *
 * A page's JavaScript stops when its tab is closed or suspended, so the page cannot do this. The
 * Background Fetch API hands the transfer to the browser process and wakes THIS worker when it
 * finishes — which is why the follow-up work lives here rather than in the gallery component.
 *
 * The page uploaded the bytes straight to storage with a signed URL. Two things still have to
 * happen after that, and both are this worker's job now:
 *   1. Create the `job_files` row, or the bytes exist and nothing lists them.
 *   2. Say so, because the person is somewhere else entirely by then.
 *
 * The row payload travels through IndexedDB (`starr-uploads`), because Background Fetch carries only
 * an id and this worker cannot see any variable the page held.
 *
 * NOTE ON iOS: none of this runs there. Safari does not implement Background Fetch, so `lib/jobs/
 * upload-background.ts` reports `foreground` and the page tells the person to keep it open. That is
 * a platform limitation, not a gap here — see that file.
 */

const UPLOAD_DB = 'starr-uploads';
const UPLOAD_STORE = 'pending';

function openUploadDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(UPLOAD_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(UPLOAD_STORE)) {
        req.result.createObjectStore(UPLOAD_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readPending(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(UPLOAD_STORE, 'readonly');
    const get = tx.objectStore(UPLOAD_STORE).get(id);
    get.onsuccess = () => resolve(get.result || null);
    get.onerror = () => resolve(null);
  });
}

function dropPending(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(UPLOAD_STORE, 'readwrite');
    tx.objectStore(UPLOAD_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

self.addEventListener('backgroundfetchsuccess', (event) => {
  const id = event.registration.id;
  event.waitUntil((async () => {
    let pending = null;
    try {
      const db = await openUploadDb();
      pending = await readPending(db, id);
      if (pending) await dropPending(db, id);
      db.close();
    } catch {
      /* the row payload is gone; the notification below still tells the truth about the bytes */
    }

    let rowOk = false;
    if (pending) {
      try {
        // Same-origin, so the session cookie rides along and the route authorises exactly as it
        // would from the page. `credentials: 'include'` is explicit because a worker's default
        // differs from a page's and this must not be left to chance.
        const res = await fetch(pending.rowEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(pending.rowBody),
        });
        rowOk = res.ok;
      } catch {
        rowOk = false;
      }
    }

    const name = (pending && pending.fileName) || 'Your file';
    await self.registration.showNotification(
      rowOk ? 'Upload finished' : 'Upload finished, but not filed',
      {
        body: rowOk
          ? `${name} has been uploaded and attached to the job.`
          // Distinguished on purpose: the bytes ARE safe in storage. Telling somebody the upload
          // failed when it did not would send them off to re-record something they already have.
          : `${name} uploaded, but it could not be attached. Open the job and add it again.`,
        tag: `upload-${id}`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { href: (pending && pending.openUrl) || '/admin/jobs' },
      },
    );
  })());
});

/* Failed or cancelled. Reported rather than swallowed: a silent failure is how somebody discovers
 * three weeks later that the walkthrough of the access road was never saved. */
for (const evt of ['backgroundfetchfail', 'backgroundfetchabort']) {
  self.addEventListener(evt, (event) => {
    const id = event.registration.id;
    event.waitUntil((async () => {
      let pending = null;
      try {
        const db = await openUploadDb();
        pending = await readPending(db, id);
        await dropPending(db, id);
        db.close();
      } catch { /* nothing recoverable */ }
      const name = (pending && pending.fileName) || 'A file';
      await self.registration.showNotification('Upload did not finish', {
        body: `${name} was not uploaded. Open the job and try again.`,
        tag: `upload-${id}`,
        icon: '/icons/icon-192.png',
        data: { href: (pending && pending.openUrl) || '/admin/jobs' },
      });
    })());
  });
}

/* Tapping the OS progress notification goes to the job, not to a blank app. */
self.addEventListener('backgroundfetchclick', (event) => {
  const id = event.registration.id;
  event.waitUntil((async () => {
    let href = '/admin/jobs';
    try {
      const db = await openUploadDb();
      const pending = await readPending(db, id);
      if (pending && pending.openUrl) href = pending.openUrl;
      db.close();
    } catch { /* fall back to the jobs list */ }
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url.includes('/admin') && 'focus' in client) {
        client.navigate(href);
        return client.focus();
      }
    }
    return self.clients.openWindow(href);
  })());
});
