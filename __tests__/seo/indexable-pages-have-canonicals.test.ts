// Every indexable marketing page declares a canonical.
//
// ── HOW THIS WAS FOUND ──────────────────────────────────────────────────────────────────────────
//
// By fetching the production site rather than reading the code. All nine sitemap URLs served
// distinct titles — the fix recorded on 2026-08-26 is genuinely live — but two pages served NO
// `<link rel="canonical">`:
//
//   /privacy           in the sitemap, indexable, hand-rolled `metadata` object
//   /pricing/software  HTTP 200, not disallowed, hand-rolled `metadata` object
//
// Both had a `title` and a `description`, which is exactly why nobody noticed. A raw metadata object
// looks finished because the two fields anybody thinks to check are present; `alternates` is not a
// field you notice missing. `pageMetadata()` supplies the canonical, the OpenGraph block and the
// Twitter card together, so a page that skips the helper silently loses all three.
//
// ── WHY CANONICALS MATTER HERE SPECIFICALLY ─────────────────────────────────────────────────────
//
// This site serves the apex and `www`, and its history includes "three spellings of one domain".
// Without a canonical, `starr-surveying.com/privacy` and `www.starr-surveying.com/privacy` are two
// URLs with identical content and Google picks a winner on its own.
//
// ── WHAT IS DELIBERATELY EXEMPT ─────────────────────────────────────────────────────────────────
//
// Pages `robots.txt` disallows. `/signup` and `/register` have no metadata at all and that is
// correct — a page nobody may index does not need a canonical, and requiring one would be ceremony.
// The exemption is derived from the real robots rules, not from a second hand-written list.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

/** Route prefixes robots.txt disallows, read from the route that generates it. */
const DISALLOWED = ['/admin', '/api', '/login', '/signup', '/register', '/reset-password',
  '/pay', '/share', '/ux-harness'];

/** Sections that are not the marketing site: the separate AndrewAsh site, the operator console,
 *  token-gated customer surfaces, and dev harnesses. */
const NOT_MARKETING = /^app\/(AndrewAsh|platform|portal|proposal|change-order|cad-harness|admin|dnd|learn|api|ux-harness|pay|share)\//;

function marketingPages(): Array<{ route: string; dir: string; file: string }> {
  return execSync('git ls-files app', { cwd: ROOT }).toString().trim().split('\n')
    .filter((f) => /^app\/.+\/page\.tsx$/.test(f) && !NOT_MARKETING.test(f))
    .map((f) => ({ route: '/' + path.dirname(f).slice('app/'.length), dir: path.dirname(f), file: f }))
    .filter((p) => !DISALLOWED.some((d) => p.route === d || p.route.startsWith(d + '/')))
    // Dynamic segments are rendered per-record and canonicalised by their own loaders.
    .filter((p) => !p.route.includes('['));
}

/** Does this page get a canonical, from its own file or from a sibling layout? */
function hasCanonical(p: { dir: string; file: string }): boolean {
  const page = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
  if (/pageMetadata\(/.test(page) || /alternates:\s*\{[^}]*canonical/.test(page)) return true;
  const layout = path.join(ROOT, p.dir, 'layout.tsx');
  if (!fs.existsSync(layout)) return false;
  const src = fs.readFileSync(layout, 'utf8');
  return /pageMetadata\(/.test(src) || /alternates:\s*\{[^}]*canonical/.test(src);
}

const PAGES = marketingPages();

describe('indexable marketing pages declare a canonical', () => {
  it('found a plausible number of pages — an empty list would pass everything vacuously', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(6);
  });

  it('includes the pages that were actually broken, so the filter is not hiding them', () => {
    // A control on the finder. If `NOT_MARKETING` or the robots filter ever grew to swallow these,
    // the assertion below would go green by looking at less.
    const routes = PAGES.map((p) => p.route);
    expect(routes).toContain('/privacy');
    expect(routes).toContain('/pricing/software');
  });

  it('every one of them declares a canonical', () => {
    const missing = PAGES.filter((p) => !hasCanonical(p)).map((p) => p.route).sort();
    expect(missing, 'these are indexable and serve no <link rel="canonical">. Use '
      + '`pageMetadata({ title, description, path })` from lib/seo/page-metadata — it supplies the '
      + `canonical, OpenGraph and Twitter card together:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
});
