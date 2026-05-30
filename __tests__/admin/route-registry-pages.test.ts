// __tests__/admin/route-registry-pages.test.ts
//
// nav-flyout-hover-fix 2026-05-30 — the workspace hover fly-outs in
// the IconRail list every accessible route in a workspace. The user
// asked us to "make sure those drop down menus actually have pages
// they link to." This test walks every `href` in ADMIN_ROUTES and
// asserts a real `page.tsx` (or a dynamic-segment match) exists for
// it, so a future PR that adds a registry entry without a page — or
// renames a page without updating the registry — fails CI instead of
// shipping a dead fly-out link.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';

const ROOT = path.join(__dirname, '..', '..');

/** Does a Next.js App-Router `page` file exist for this admin href?
 *  Strips any `?query`, then walks `app/<segments>` allowing a single
 *  dynamic `[param]` directory to stand in for a concrete segment
 *  (e.g. `/admin/jobs/123` resolves via `app/admin/jobs/[id]`). */
function hasPage(href: string): boolean {
  const clean = href.split('?')[0].split('#')[0].replace(/^\//, '');
  const parts = clean.split('/');
  let dir = path.join(ROOT, 'app');
  for (const part of parts) {
    if (!fs.existsSync(dir)) return false;
    const entries = fs.readdirSync(dir);
    if (entries.includes(part)) {
      dir = path.join(dir, part);
      continue;
    }
    const dynamic = entries.find((e) => e.startsWith('[') && e.endsWith(']'));
    if (dynamic) {
      dir = path.join(dir, dynamic);
      continue;
    }
    return false;
  }
  return ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].some((f) =>
    fs.existsSync(path.join(dir, f)),
  );
}

describe('admin route registry — every href has a page', () => {
  const hrefs = [...new Set(ADMIN_ROUTES.map((r) => r.href))];

  it('has a healthy number of routes to check (sanity)', () => {
    expect(hrefs.length).toBeGreaterThan(40);
  });

  it('every registry href resolves to a real App-Router page', () => {
    const missing = hrefs.filter((h) => !hasPage(h));
    expect(missing, `registry hrefs with no page file:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every href is an absolute /admin path', () => {
    const bad = hrefs.filter((h) => !h.startsWith('/admin'));
    expect(bad).toEqual([]);
  });
});
