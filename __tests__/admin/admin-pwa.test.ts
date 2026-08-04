// The business app's manifest now has a worker behind it (PWA plan W2).
//
// `public/manifest.json` has promised an installable app at `/admin/me` for some time and nothing
// registered a service worker for it, so a crew member could add it to a home screen and get no
// offline behaviour and no push — a manifest writing a cheque the app did not honour.
//
// The rules pinned here are the ones that make a service worker safe rather than the ones that make
// it work. A worker is the only front-end code that outlives the deploy that installed it: a mistake
// persists until the user clears site data, which they will not know to do. In an app that carries
// jobs, payroll and receipts, the cautious properties matter more than the caching.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readSource } from '../_helpers/source';

// Reads with line endings normalised — see __tests__/_helpers/source.ts for why every
// source-reading assertion in this repo has to.
const read = readSource;
const sw = read('public/admin/sw.js');
const reg = read('app/admin/components/RegisterAdminPWA.tsx');
const layout = read('app/admin/layout.tsx');

describe('it is actually registered', () => {
  it('is mounted in the admin layout', () => {
    // The defect this repo produces most often is exactly this: a component that exists and nothing
    // renders. A worker nobody registers is a file, not a feature.
    expect(layout).toContain('<RegisterAdminPWA />');
  });

  it('is off unless explicitly enabled', () => {
    expect(reg).toContain("process.env.NEXT_PUBLIC_ADMIN_PWA === '1'");
  });

  it('the OFF path uninstalls rather than merely skipping', () => {
    // A flag that only skips registration leaves an installed worker running forever — the switch
    // would turn the feature on and never off again, which is the opposite of a killswitch.
    expect(reg).toContain('unregister()');
    expect(reg).toContain('caches.delete');
  });
});

describe('it cannot reach the other two apps', () => {
  it('is served from /admin/, which caps its scope by URL', () => {
    // Scope is capped by the path a worker is SERVED from. Serving it here makes "it cannot touch
    // /dnd" a property of the URL rather than a promise in a comment.
    expect(fs.existsSync(path.join(process.cwd(), 'public/admin/sw.js'))).toBe(true);
    expect(reg).toContain("const SW_URL = '/admin/sw.js'");
    expect(reg).toContain("const SCOPE = '/admin/'");
  });

  it('unregisters only its own scope', () => {
    // /dnd/ and /AndrewAsh/ each run their own worker. A broad unregister from here would take both
    // out, from a component with no business touching either.
    expect(reg).toContain('reg.scope.endsWith(SCOPE)');
  });

  it('deletes only its own caches', () => {
    expect(reg).toContain("k.startsWith('starr-admin-')");
  });
});

describe('what it refuses to cache is the point', () => {
  it('never caches API responses', () => {
    // Every admin route is caller-scoped and role-gated. A cached response is a response served to
    // the wrong person — in this app, someone else's pay or someone else's job.
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toMatch(/if \(url\.pathname\.startsWith\('\/api\/'\)\) return false/);
  });

  it('never caches anything but GET', () => {
    expect(sw).toContain("if (request.method !== 'GET') return");
  });

  it('does not fall back to cached HTML for navigations', () => {
    // Network-only with an offline page, NOT network-first-then-cache: nothing authenticated is in
    // the cache by design, and pretending otherwise is how a signed-out user reads a signed-in page.
    expect(sw).toContain('fetch(request).catch(() => caches.match(OFFLINE_URL))');
  });

  it('only stores a real same-origin 200', () => {
    // Caching an opaque or error response serves that error back forever, which looks exactly like a
    // broken deploy and gets diagnosed as one.
    expect(sw).toContain("res.ok && res.type === 'basic'");
  });

  it('drops caches from a previous version on activate', () => {
    expect(sw).toContain("k.startsWith('starr-admin-') && !k.startsWith(VERSION)");
  });
});

describe('the offline page tells the truth', () => {
  const offline = read('public/admin/offline.html');

  it('exists and is what the worker precaches', () => {
    expect(sw).toContain("const OFFLINE_URL = '/admin/offline.html'");
  });

  it('does not promise data that is deliberately not cached', () => {
    // The bare `\n` in this literal cannot match a CRLF checkout, so this passed when written and
    // failed the moment git normalised the file — nothing about the page having changed. It is one
    // of eight instances of that trap found in a single day, in three shapes: negative controls
    // that silently did nothing, a source-slice that swallowed a whole file, and exact matches like
    // this one.
    //
    // No `.replace()` here on purpose: `read` is `readSource`, which normalises. Leaving a manual
    // fix beside the helper would make it unclear which one is doing the work — and if the helper
    // ever stopped, a redundant guard would hide it.
    expect(offline).toContain('live on the\n      server, not on this device');
  });

  it('tells a crew member their work is not lost, which is what they will fear', () => {
    expect(offline).toContain('Nothing you saved has been lost');
  });
});

describe('an installed app updates itself — no reinstall, ever', () => {
  // Owner's question, 2026-08-04: *"will I have to manually update the app if we make changes and I
  // already have it downloaded?"* The answer is no, and these are the four properties that make it
  // true. Each is one line, and losing any one of them strands somebody on an old build with no
  // symptom except that a fix "did not work".

  it('a new worker takes over immediately instead of waiting for every tab to close', () => {
    // The default is that a new worker sits in `waiting` until all clients are gone. A home-screen
    // app is almost never "closed", so without these two the user can sit on a superseded build for
    // days and there is nothing on screen to say so.
    expect(sw).toContain('self.skipWaiting()');
    expect(sw).toContain('self.clients.claim()');
  });

  it('pages are always fetched fresh — nothing about the app shell is cached', () => {
    // Navigations are network-only with the offline page as the failure case, so the HTML and every
    // server-rendered page is current on every load. This is also why the answer is "no" today: with
    // the PWA flag unset there is no worker at all, and the home-screen icon is a live bookmark.
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain('fetch(request).catch(() => caches.match(OFFLINE_URL))');
  });

  it('cached images and fonts refresh in the background', () => {
    // The gap this closes. `/_next/static/` is content-hashed so a deploy changes the URL, but
    // `/logo.png` does not — and `VERSION` is a hardcoded `v1` that no deploy bumps, so cache-first
    // would serve a replaced image forever on every installed device.
    //
    // Stale-while-revalidate: the cached copy is served immediately, the network copy replaces it
    // for next time. One stale render, then correct, with no action from the user.
    expect(sw).toContain('const network = fetch(request)');
    expect(sw).toContain('hit || network');
  });

  it('the offline page itself cannot go stale', () => {
    // It is the one asset precached under that never-bumped VERSION, so an edit to it would reach
    // no installed device. `cache: 'reload'` fetches past the HTTP cache when a new worker installs.
    expect(sw).toContain("cache: 'reload'");
  });
});
