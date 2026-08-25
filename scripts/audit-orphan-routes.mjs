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
//   · Pages the CODE navigates to — see SENT_TO below.
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

/**
 * Pages reached by a redirect in application code rather than by navigation.
 *
 * The value is WHERE FROM, so this list can be audited rather than trusted.
 */
const SENT_TO = new Map([
  ['/admin/billing/upgrade', 'lib/saas/bundle-gate.ts — upgradePromptUrl(), via middleware.ts'],
]);

// A named exemption that has gone stale is worse than no exemption: it silently keeps a genuinely
// orphaned page off this report. Checked rather than trusted.
for (const [href, from] of SENT_TO) {
  const file = join(ROOT, from.split(' —')[0]);
  const src = readFileSync(file, 'utf8');
  // A boundary, not `includes`. `/admin/billing/upgrade` is a substring of
  // `/admin/billing/upgrade-MOVED`, so a plain `includes` would call a renamed route present and the
  // guard would pass on exactly the change it exists to catch. Found by trying it.
  const mentioned = new RegExp(href.replace(/[.*+?^${}()|[]\]/g, "\$&") + "(?![A-Za-z0-9_-])").test(src);
  if (!mentioned) {
    console.error(`SENT_TO says ${href} is reached from ${from}, and that file no longer mentions it.`);
    console.error('Either the redirect moved — update this list — or the page really is an orphan now.');
    process.exit(2);
  }
}

const pages = walk(ADMIN)
  .map(hrefOf)
  // Dynamic segments are reached from a list, never from a menu.
  .filter((h) => !h.includes('['))
  // `/admin` redirects to the hub; it is not a destination.
  .filter((h) => h !== '/admin')
  // `/admin/login` is the DOOR, not a room. A menu item that signs you out of the app you are
  // currently using is a bug rather than a feature, so it is excluded here rather than registered.
  .filter((h) => h !== '/admin/login')
  // ── PAGES THE CODE SENDS YOU TO ─────────────────────────────────────────────────────────────
  //
  // A third kind of reachable, added by C1 of the consolidation plan and distinct from both of the
  // others. These are real pages with real content that nobody navigates to DELIBERATELY: the app
  // puts you there, from anywhere, with query parameters that are the whole point of the visit.
  //
  // `/admin/billing/upgrade` is the case. `lib/saas/bundle-gate.ts` redirects here with
  // `?requiredBundle=` and `?returnTo=` when somebody opens a page the firm has not paid for. It
  // had a sidebar entry, and that entry was the accident — a menu item reading "Upgrade Plan" that
  // renders "Unknown bundle" when you click it, because the parameters that give it meaning only
  // exist when the gate sends you.
  //
  // Deliberately a NAMED LIST and not a pattern. This is the escape hatch from the repo's most
  // common defect class — a page nobody can find — so it has to cost something to use. Each entry
  // names the code that navigates there, and a reviewer can check that the code still does.
  .filter((h) => !SENT_TO.has(h));

// The redirect exclusion belongs HERE and only here.
//
// The first version filtered redirect-only pages out of `pages` entirely, which broke the other
// direction: `/admin/schedule` is a REGISTERED redirect, so removing its file from the list made
// its registry entry look dangling — a menu item with no page behind it, which is the worse of the
// two faults this script checks for. (`/admin/work-mode` and `/admin/work-mode/developer` were the
// other two examples until C0g retired them; the rule is unchanged.)
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
