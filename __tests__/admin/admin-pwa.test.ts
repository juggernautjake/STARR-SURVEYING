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

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
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
    // Line endings normalised before matching. The literal carried a bare `\n`, which cannot match
    // a working tree checked out with CRLF — so this passed when written and failed the moment git
    // normalised the file, with nothing about the page having changed.
    //
    // Seventh CRLF trap in this repo today, across three different shapes: negative controls that
    // silently did nothing, a source-slice that swallowed the whole file, and now an exact-match
    // assertion. **Any check that matches multi-line source text must normalise first.**
    expect(offline.replace(/\r\n/g, '\n')).toContain('live on the\n      server, not on this device');
  });

  it('tells a crew member their work is not lost, which is what they will fear', () => {
    expect(offline).toContain('Nothing you saved has been lost');
  });
});
