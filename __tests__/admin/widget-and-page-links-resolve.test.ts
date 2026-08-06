// __tests__/admin/widget-and-page-links-resolve.test.ts
//
// Owner, 2026-08-06: *"on a lot of the widgets there are links like 'Go to my hours →' that don't
// actually link to the pages they need to link to."*
//
// ── WHY THE EXISTING GUARD DID NOT CATCH THIS ───────────────────────────────────────────────────
//
// `nav-links-go-somewhere.test.ts` was written on 2026-08-04 for exactly this defect and fixed it —
// for `ADMIN_ROUTES`. It asserts that no *registered* route carries a query string and that every
// one has a page file. That is the menu.
//
// It is not the app. Widget footers, ⌘K actions, page bodies, the help drawer and every notification
// deep-link build their own hrefs, and nothing checked those. So the same five dead `?tab=` targets
// that were removed from the menu on the 4th were still live in 26 other places on the 6th — the
// "Go to my hours →" the owner clicked among them. Restoring `/admin/my-hours` fixed the menu entry
// and left every widget pointing at the Hub.
//
// This guard scans the source instead of a registry, so it covers anything that spells a URL.
//
// ── THE TWO FAILURE SHAPES ──────────────────────────────────────────────────────────────────────
//
// 1. A link to a path with no page → 404. Easy to spot in a browser, invisible in a unit test.
// 2. A link whose meaning lives in a query string the destination ignores → NO 404, no error, you
//    just land somewhere unhelpful. `/admin/me?tab=hours` is the Hub. This shape is why the bug
//    survived two audits: nothing is broken enough to report itself.
//
// A third shape appears once and is worth naming: `/admin/equipment/vehicles` matched
// `/admin/equipment/[id]`, so it rendered the equipment-detail page for an item whose id is the word
// "vehicles". A dynamic segment will swallow any literal you put in front of it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { WIDGET_LINKS } from '@/lib/hub/widgets/_shared/widget-links';
import { LEGACY_REDIRECTS } from '@/lib/admin/legacy-redirects';

const ROOT = process.cwd();

// ── the real route table, read off disk ─────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

const APP = path.join(ROOT, 'app').replace(/\\/g, '/');

const ROUTES: string[] = walk(APP)
  .filter((f) => /\/page\.(tsx|ts|jsx)$/.test(f))
  .map((f) => f.slice(APP.length).replace(/\/page\.(tsx|ts|jsx)$/, ''))
  // route groups — `app/(site)/about` serves `/about`
  .map((r) => r.replace(/\/\([^/]+\)/g, ''))
  .map((r) => (r === '' ? '/' : r));

const MATCHERS = ROUTES.map((route) => ({
  route,
  re: new RegExp(
    '^' +
      route
        .replace(/[.*+?^${}()|\\]/g, '\\$&')
        .replace(/\\\[\\\.\\\.\\\.[^\]]*\\\]/g, '.+')   // [...catchAll]
        .replace(/\[[^\]]+\]/g, '[^/]+') +               // [id]
      '$',
  ),
}));

/** Every route whose pattern accepts `p`, dynamic ones included. */
function matchesFor(p: string): string[] {
  return MATCHERS.filter((m) => m.re.test(p)).map((m) => m.route);
}

// ── source scan ─────────────────────────────────────────────────────────────────────────────────

const INTERNAL = '(?:admin|platform|pay|portal|proposal|share|change-order|about|services|pricing|contact|resources|credentials|service-area|register|signup)';
const LINK_RE = new RegExp(`(?:href|link|url|route)\\s*[:=]\\s*\\{?\\s*[\`'"](/${INTERNAL}[^\`'"]*)[\`'"]`, 'gi');
const NAV_RE = /(?:router\.(?:push|replace)|redirect)\(\s*[`'"](\/[^`'"]*)[`'"]/g;

interface Hit { file: string; line: number; href: string }

function collectHits(): Hit[] {
  const hits: Hit[] = [];
  for (const dir of ['app', 'lib']) {
    for (const f of walk(path.join(ROOT, dir))) {
      if (!/\.(tsx|ts)$/.test(f)) continue;
      if (/\.test\.tsx?$/.test(f)) continue;
      const rel = f.slice(ROOT.replace(/\\/g, '/').length + 1);
      // Separate products in the same repo — not the surveying app's routing story.
      if (/^(app\/dnd|app\/AndrewAsh|lib\/dnd)/.test(rel)) continue;
      const src = fs.readFileSync(f, 'utf8');
      const lines = src.split('\n');
      for (const re of [LINK_RE, NAV_RE]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          const line = src.slice(0, m.index).split('\n').length;
          // Skip comment lines: this file and several fix notes quote the old bad URLs on purpose.
          if (/^\s*(\/\/|\*|\/\*)/.test(lines[line - 1] ?? '')) continue;
          hits.push({ file: rel, line, href: m[1] });
        }
      }
    }
  }
  return hits;
}

const HITS = collectHits();

/** Deliberately unbuilt operator-console surfaces. They are rendered as inert, dimmed cards (see
 *  `SURFACES[].built` in app/platform/page.tsx) — a roadmap, not navigation. Delete an entry here
 *  the day its page ships. */
const UNBUILT_ROADMAP = new Set([
  '/platform/billing',
  '/platform/broadcasts',
  '/platform/health',
]);

const RESOLVES_VIA_REDIRECT = new Set(Object.keys(LEGACY_REDIRECTS));

function pathOf(href: string): string {
  return href.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
}

/** A path ending in a file extension is a static asset served from `public/`, not a page route —
 *  `/admin/sw.js` is the admin PWA's service worker. Checking those against the route table would
 *  be checking the wrong table, so they are verified against `public/` instead. */
function isStaticAsset(p: string): boolean {
  return /\.[a-z0-9]{2,5}$/i.test(p);
}

describe('the scan itself is wired up', () => {
  it('found a realistic number of routes and links', () => {
    expect(ROUTES.length).toBeGreaterThan(200);
    expect(HITS.length).toBeGreaterThan(400);
  });
});

describe('every internal link points at a page that exists', () => {
  it('every static asset linked from code exists in public/', () => {
    const missing = HITS.filter((h) => !h.href.includes('${') && isStaticAsset(pathOf(h.href)))
      .filter((h) => !fs.existsSync(path.join(ROOT, 'public', pathOf(h.href))))
      .map((h) => `${h.file}:${h.line}  →  ${h.href}`);
    expect(missing, `Linked assets not in public/:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('no link targets a path with no route', () => {
    const broken = HITS.filter((h) => {
      if (h.href.includes('${')) return false;             // built at runtime
      const p = pathOf(h.href);
      if (isStaticAsset(p)) return false;                  // checked above, against public/
      if (UNBUILT_ROADMAP.has(p)) return false;
      if (RESOLVES_VIA_REDIRECT.has(p)) return false;
      return matchesFor(p).length === 0;
    });
    expect(
      broken.map((b) => `${b.file}:${b.line}  →  ${b.href}`),
      `These links point at paths with no page behind them:\n  ${broken
        .map((b) => `${b.file}:${b.line}  →  ${b.href}`)
        .join('\n  ')}`,
    ).toEqual([]);
  });

  it('no hard-coded link resolves only through a dynamic segment', () => {
    // `/admin/equipment/vehicles` is not a 404 — it matches `/admin/equipment/[id]` and renders the
    // detail page for a record that does not exist. A literal path segment that only survives
    // because a `[param]` swallowed it is a typo wearing a working page's costume.
    const swallowed = HITS.filter((h) => {
      if (h.href.includes('${')) return false;
      const p = pathOf(h.href);
      if (UNBUILT_ROADMAP.has(p) || RESOLVES_VIA_REDIRECT.has(p)) return false;
      if (ROUTES.includes(p)) return false;
      const via = matchesFor(p);
      return via.length > 0 && via.every((v) => v.includes('['));
    });
    expect(
      swallowed.map((s) => `${s.file}:${s.line}  →  ${s.href}  (only matches ${matchesFor(pathOf(s.href)).join(', ')})`),
      `These literal links are being swallowed by a dynamic route:\n  ${swallowed
        .map((s) => `${s.file}:${s.line}  →  ${s.href}`)
        .join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('no link relies on a query parameter its destination ignores', () => {
  it('nothing links to /admin/me?tab=…', () => {
    // The Hub reads exactly two query parameters, `edit` and `debug`. Slice 189 retired its tab bar;
    // every `?tab=` link since has silently dropped the parameter and rendered the widget canvas.
    // Each retired tab now has a real page: my-hours, my-pay, my-notes, my-files, profile, mileage,
    // learn/fieldbook. Point at those.
    const offenders = HITS.filter((h) => /^\/admin\/me\?tab=/.test(h.href));
    expect(
      offenders.map((o) => `${o.file}:${o.line}  →  ${o.href}`),
      `The Hub ignores \`tab\`. These land on the widget canvas instead of the page they name:\n  ${offenders
        .map((o) => `${o.file}:${o.line}  →  ${o.href}`)
        .join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('the widget "Go to…" table', () => {
  const entries = Object.entries(WIDGET_LINKS);

  it('covers enough widgets to be worth checking', () => {
    expect(entries.length).toBeGreaterThan(30);
  });

  it('every destination is a real page', () => {
    const broken = entries
      .filter(([, t]) => matchesFor(pathOf(t.href)).length === 0)
      .map(([id, t]) => `${id} → ${t.href}`);
    expect(broken, `Widget footers pointing nowhere:\n  ${broken.join('\n  ')}`).toEqual([]);
  });

  it('no destination carries a query string', () => {
    // A "Go to my hours →" whose meaning lives in a query is one page pretending to be another.
    const withQuery = entries
      .filter(([, t]) => t.href.includes('?'))
      .map(([id, t]) => `${id} → ${t.href}`);
    expect(withQuery, `Widget footers relying on a query string:\n  ${withQuery.join('\n  ')}`).toEqual([]);
  });

  it('every destination is exact, never swallowed by a [param]', () => {
    const swallowed = entries
      .filter(([, t]) => {
        const p = pathOf(t.href);
        if (ROUTES.includes(p)) return false;
        const via = matchesFor(p);
        return via.length > 0 && via.every((v) => v.includes('['));
      })
      .map(([id, t]) => `${id} → ${t.href}`);
    expect(swallowed, `Widget footers swallowed by a dynamic route:\n  ${swallowed.join('\n  ')}`).toEqual([]);
  });
});
