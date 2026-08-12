// scripts/audit-orphan-routes.mjs — pages that exist and cannot be reached (§1.4).
//
// The audit's own words: *"Pages that exist, work, and are not in the route registry — so: not on the
// rail, not in ⌘K, no breadcrumb, no help."* And: *"This is the repo's most common defect class,
// already noted in memory: authored but not wired."*
//
// Three of the orphans were built SPECIFICALLY to close go-live gaps (finances/overview,
// finances/reconcile, payouts/tax-report) and nothing links to them, which is the sharpest possible
// version of the problem: work that shipped, works, and cannot be found.
//
// ── WHAT COUNTS AS AN ORPHAN, AND WHAT DELIBERATELY DOES NOT ───────────────────────────────────────
//
// A page is an orphan when it has a `page.tsx` under `app/admin/` and no `ADMIN_ROUTES` entry whose
// `href` matches. Excluded, because they are not navigation targets:
//
//   · Dynamic segments (`[id]`, `[email]`) — you reach them from a list, never from a menu.
//   · Route groups and private folders (`(group)`, `_components`).
//   · `/admin` itself, which redirects to the hub.
//
// Run: `node scripts/audit-orphan-routes.mjs`

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const ADMIN = join(ROOT, 'app', 'admin');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name.startsWith('_') || name.startsWith('(')) continue;
      out.push(...walk(p));
    } else if (name === 'page.tsx' || name === 'page.jsx') {
      out.push(p);
    }
  }
  return out;
}

/** `app/admin/finances/overview/page.tsx` → `/admin/finances/overview` */
function hrefOf(file) {
  const rel = relative(ROOT, file).split(sep).join('/');
  return '/' + rel.replace(/^app\//, '').replace(/\/page\.(tsx|jsx)$/, '');
}

const registry = readFileSync(join(ROOT, 'lib', 'admin', 'route-registry.ts'), 'utf8');
const registered = new Set([...registry.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]));

/**
 * Is this page nothing but a redirect?
 *
 * A forwarding address is not a destination, and registering one would put a second nav row on the
 * page it forwards to. The script already made this call by hand for `/admin` ("redirects to the
 * hub; it is not a destination") — this generalises that judgement instead of keeping a list of
 * exceptions that grows every time a page moves.
 *
 * Deliberately narrow: it must import `redirect` from `next/navigation`, call it, and render NO JSX.
 * A page that redirects *conditionally* and otherwise renders something is a real destination and
 * still has to be registered.
 */
function isRedirectOnly(file) {
  const src = readFileSync(file, 'utf8');
  if (!/from ['"]next\/navigation['"]/.test(src)) return false;
  if (!/\bredirect\(/.test(src)) return false;
  // Any JSX element means it renders something of its own. Checked on the code with comments
  // stripped, so prose mentioning a tag cannot make a real page look like a stub.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return !/<[A-Za-z]/.test(code);
}

const redirectOnly = new Set(walk(ADMIN).filter(isRedirectOnly).map(hrefOf));

const pages = walk(ADMIN)
  .map(hrefOf)
  // Dynamic segments are reached from a list, never from a menu.
  .filter((h) => !h.includes('['))
  // `/admin` redirects to the hub; it is not a destination.
  .filter((h) => h !== '/admin')
  // `/admin/login` is the DOOR, not a room. A menu item that signs you out of the app you are
  // currently using is a bug rather than a feature, so it is excluded here rather than registered.
  .filter((h) => h !== '/admin/login');

// The redirect exclusion belongs HERE and only here.
//
// The first version filtered redirect-only pages out of `pages` entirely, which broke the other
// direction: `/admin/schedule`, `/admin/work-mode` and `/admin/work-mode/developer` are REGISTERED
// redirects, so removing their files from the list made their registry entries look dangling — a
// menu item with no page behind it, which is the worse of the two faults this script checks for.
//
// Stated as two separate rules, because they are two separate questions:
//   · an UNREGISTERED redirect is not an orphan — it is a forwarding address, and registering it
//     would put a second nav row on the page it forwards to;
//   · a REGISTERED redirect is not dangling — its file exists and its menu row goes somewhere real.
const orphans = pages.filter((h) => !registered.has(h) && !redirectOnly.has(h)).sort();

console.log(`admin pages (excluding dynamic segments): ${pages.length}`);
console.log(`registered in ADMIN_ROUTES:               ${pages.length - orphans.length}`);
console.log(`ORPHANS:                                  ${orphans.length}\n`);
for (const h of orphans) console.log('  ' + h);

// Registry entries with no page behind them — the other direction, and a dead menu item is worse than
// a hidden page: one is work nobody can find, the other is a link that 404s.
const pageSet = new Set(pages);
const dangling = [...registered]
  .filter((h) => h.startsWith('/admin/') && !h.includes('[') && !pageSet.has(h))
  // A registry entry may legitimately point at a hub TAB (`/admin/me?tab=hours`).
  .filter((h) => !h.includes('?'))
  .sort();
if (dangling.length) {
  console.log(`\nDANGLING registry entries (menu item, no page): ${dangling.length}\n`);
  for (const h of dangling) console.log('  ' + h);
}

process.exit(orphans.length || dangling.length ? 1 : 0);
