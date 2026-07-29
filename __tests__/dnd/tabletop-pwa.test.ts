// __tests__/dnd/tabletop-pwa.test.ts — installable Tabletop, and a worker that cannot reach the business
// app (P10-5).
//
// A service worker is the one piece of front-end code that OUTLIVES the deploy that installed it. Get it
// wrong and every visitor keeps the broken version until they clear site data, which they will not know to
// do. This repo also serves a real surveying business. So most of what follows is about blast radius.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const sw = read('public/dnd/sw.js');
/** Negative assertions run on stripped code — the comments name the very things they argue against. */
const swCode = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const manifest = JSON.parse(read('public/dnd/manifest.webmanifest')) as Record<string, unknown>;

describe('BLAST RADIUS', () => {
  it('the worker is SERVED from /dnd/, which is what caps its scope', () => {
    // A worker's scope cannot exceed the path it is served from. Putting the file at `/dnd/sw.js` makes
    // "it cannot touch the admin app" a property of the URL rather than a promise in a comment — a root
    // worker would sit in front of every receipt upload and every invoice, for every user, permanently.
    const reg = read('app/dnd/_ui/RegisterTabletopPWA.tsx');
    expect(reg).toContain("const SW_URL = '/dnd/sw.js'");
    expect(reg).toContain("const SCOPE = '/dnd/'");
    expect(reg).toContain('{ scope: SCOPE }');
  });

  it('and the manifest scopes the install to /dnd/ too', () => {
    expect(manifest.scope).toBe('/dnd/');
    expect(manifest.start_url).toBe('/dnd');
  });

  it('it is a SEPARATE manifest from the business app’s', () => {
    // The root manifest is "Starr Surveying" with a start_url of /admin/me. Installing from a character
    // sheet must not put the surveying admin on someone's home screen.
    const site = JSON.parse(read('public/manifest.json')) as Record<string, unknown>;
    expect(site.start_url).toBe('/admin/me');
    expect(manifest.name).not.toBe(site.name);
    expect(read('app/dnd/layout.tsx')).toContain("manifest: '/dnd/manifest.webmanifest'");
  });
});

describe('THE KILLSWITCH DOES REAL WORK', () => {
  const reg = read('app/dnd/_ui/RegisterTabletopPWA.tsx');

  it('is off unless NEXT_PUBLIC_DND_PWA is exactly "1"', () => {
    expect(reg).toContain("process.env.NEXT_PUBLIC_DND_PWA === '1'");
  });

  it('and the OFF path unregisters rather than merely skipping', () => {
    // A flag that only skips registration leaves an already-installed worker running forever — the switch
    // would turn the feature on and never off again, which is the opposite of a killswitch.
    expect(reg).toContain('async function disable()');
    expect(reg).toContain('reg.unregister()');
    expect(reg).toMatch(/caches\.delete\(k\)/);
  });

  it('unregisters OURS only', () => {
    // Unregistering by breadth would take out the business app's worker if one is ever added, from a
    // component that has no business touching it.
    expect(reg).toMatch(/reg\.scope\.endsWith\(SCOPE\)/);
    expect(reg).toMatch(/k\.startsWith\('tabletop-'\)/);
  });

  it('and a failed registration is silent — the site works without it', () => {
    expect(reg).toMatch(/catch \{/);
    expect(reg).toContain('return null;');
  });
});

describe('what the worker caches', () => {
  it('static, content-hashed build output and images', () => {
    expect(swCode).toContain("url.pathname.startsWith('/_next/static/')");
    expect(swCode).toMatch(/png\|jpg\|jpeg\|webp\|gif\|svg\|woff2\?\|ttf/);
  });

  it('NEVER /api/ — every one of those is caller-scoped', () => {
    // A cached API response is a response served to the wrong caller.
    expect(swCode).toContain("url.pathname.startsWith('/api/')) return false");
  });

  it('NEVER authenticated HTML, which is the interesting refusal', () => {
    // A rendered sheet is somebody's character. Cached on a shared device it is that character still
    // readable after they sign out, on a page that would otherwise have redirected. The navigation
    // handler falls back to the OFFLINE PAGE, never to a cached document.
    expect(swCode).toMatch(/request\.mode === 'navigate'/);
    expect(swCode).toMatch(/fetch\(request\)\.catch\(\(\) => caches\.match\(OFFLINE_URL\)\)/);
    // The giveaway of the version this is not: a navigation response being put into a cache.
    expect(swCode).not.toMatch(/navigate[\s\S]{0,300}cache\.put/);
  });

  it('and GET only', () => {
    // A cached POST is not a thing, and trying makes the worker throw on every save.
    expect(swCode).toContain("if (request.method !== 'GET') return;");
  });

  it('only a real 200 is kept', () => {
    // Caching an opaque or error response means serving that error back forever, which looks exactly like
    // a broken deploy and is fixed by nothing the user can do.
    expect(swCode).toMatch(/res\.ok && res\.type === 'basic'/);
  });
});

describe('upgrades and cleanup', () => {
  it('activate deletes every cache from a previous version', () => {
    // Without this a stale worker's assets outlive it and the only fix is clearing site data.
    expect(swCode).toMatch(/caches\.keys\(\)/);
    expect(swCode).toMatch(/!k\.startsWith\(VERSION\)/);
  });

  it('and takes over immediately rather than waiting for every tab to close', () => {
    expect(swCode).toContain('self.skipWaiting()');
    expect(swCode).toContain('self.clients.claim()');
  });

  it('the version prefix is namespaced, so it can only ever delete its own caches', () => {
    expect(swCode).toMatch(/const VERSION = 'tabletop-/);
    expect(swCode).toMatch(/k\.startsWith\('tabletop-'\)/);
  });
});

describe('the offline page tells the truth', () => {
  const offline = read('public/dnd/offline.html');

  it('is precached, or it is not there when it is needed', () => {
    expect(swCode).toContain('cache.addAll([OFFLINE_URL])');
    expect(swCode).toContain("const OFFLINE_URL = '/dnd/offline.html'");
  });

  it('and says sheets are NOT available offline, rather than implying they are', () => {
    // Nothing authenticated is cached, so promising the character is still here would be a lie the reader
    // discovers in one tap.
    expect(offline).toMatch(/live on the server/i);
    expect(offline).toMatch(/nothing you saved is lost/i);
  });

  it('is self-contained — an offline page that fetches a stylesheet is a blank offline page', () => {
    expect(offline).not.toMatch(/<link[^>]+stylesheet/i);
    expect(offline).not.toMatch(/<script[^>]+src=/i);
  });
});
