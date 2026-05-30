// __tests__/notifications/notify-links-audit.test.ts
//
// notifications-completeness-pass Slice 1 — sweeps every notification
// `link:` literal across the codebase and asserts the URL resolves to
// a real registered admin route. Catches the regression where a future
// PR wires a notification with a typo'd or placeholder URL that
// silently no-ops on click.
//
// Strategy: scan every file under app/api/** + lib/notifications.ts +
// lib/notifications/** for literal `link: '/admin/…'` or
// `link: \`/admin/…\`` patterns, then verify each path's prefix
// resolves against `ADMIN_ROUTES`. We intentionally do NOT try to
// statically resolve dynamic templates (`/admin/jobs/${jobId}`) — the
// prefix check (`/admin/jobs`) catches the common typo cases without
// trying to type-check the runtime value.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';

const ROOT = path.join(__dirname, '..', '..');

/** Files / directories scanned for notify link literals. */
const SCAN_ROOTS = [
  path.join(ROOT, 'app', 'api'),
  path.join(ROOT, 'lib', 'notifications'),
];
const SCAN_FILES = [path.join(ROOT, 'lib', 'notifications.ts')];

/** Regexes intentionally simple — they extract the literal between
 *  single/back-quotes after `link:` and skip pass-through expressions
 *  (`link: opts.link`, `link: someVar`, etc.) where the value isn't a
 *  literal we can audit. */
const SINGLE_QUOTE = /\blink:\s*'([^']+)'/g;
const BACK_TICK = /\blink:\s*`([^`]+)`/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function gatherFiles(): string[] {
  const out: string[] = [...SCAN_FILES];
  for (const root of SCAN_ROOTS) {
    if (fs.existsSync(root)) walk(root, out);
  }
  return out;
}

interface FoundLink {
  file: string;
  raw: string;
}

function findLinks(): FoundLink[] {
  const out: FoundLink[] = [];
  for (const file of gatherFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const re of [SINGLE_QUOTE, BACK_TICK]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        out.push({ file: path.relative(ROOT, file), raw: m[1] });
      }
    }
  }
  return out;
}

/** Normalize a possibly-templated link down to the static prefix the
 *  route-registry should know:
 *    `/admin/jobs/${jobId}`        → `/admin/jobs`
 *    `/admin/employees?manage=…`   → `/admin/employees`
 *    `/admin/learn/modules/${id}`  → `/admin/learn/modules`
 *    `/admin/my-pay`               → `/admin/my-pay`
 */
function staticPrefix(link: string): string {
  // Strip query string.
  const noQuery = link.split('?')[0];
  // Cut at the first template-literal interpolation.
  const interp = noQuery.indexOf('${');
  const truncated = interp >= 0 ? noQuery.slice(0, interp) : noQuery;
  // Drop trailing slash if any.
  return truncated.replace(/\/$/, '');
}

const REGISTERED = new Set(ADMIN_ROUTES.map((r) => r.href));
function resolves(href: string): boolean {
  if (REGISTERED.has(href)) return true;
  // Allow registered route + '/' prefix match (deep page under a
  // registered list, e.g. `/admin/jobs` registered → `/admin/jobs/abc`
  // resolves).
  for (const r of REGISTERED) {
    if (href.startsWith(r + '/')) return true;
  }
  return false;
}

describe('notification link audit', () => {
  const links = findLinks();

  it('finds at least one notification link to scan (sanity)', () => {
    expect(links.length).toBeGreaterThan(10);
  });

  it('every literal link starts with /admin/', () => {
    const bad = links.filter((l) => !l.raw.startsWith('/admin/'));
    expect(bad, `non-/admin/ link(s): ${JSON.stringify(bad, null, 2)}`).toEqual([]);
  });

  it('every literal link resolves to a registered admin route', () => {
    const bad = links
      .map((l) => ({ ...l, prefix: staticPrefix(l.raw) }))
      .filter((l) => !resolves(l.prefix));
    expect(
      bad,
      `link(s) that don't resolve against ADMIN_ROUTES:\n${JSON.stringify(bad, null, 2)}`,
    ).toEqual([]);
  });

  it('no link carries an obvious placeholder (TODO / FIXME / undefined / null)', () => {
    const bad = links.filter((l) => /\b(TODO|FIXME|undefined|null)\b/i.test(l.raw));
    expect(bad).toEqual([]);
  });
});
