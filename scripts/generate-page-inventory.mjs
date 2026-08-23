// scripts/generate-page-inventory.mjs — every page this app serves, written down.
//
//   node scripts/generate-page-inventory.mjs
//
// Slice C1 of docs/planning/in-progress/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// Owner: *"a list of every single page on the frontend and backend that we can reference in the
// design editor… go through them one by one and work on each one and then check it off."*
//
// ── WHY THIS IS GENERATED AND NOT WRITTEN BY HAND ───────────────────────────────────────────────
//
// A hand-kept list of 168 pages is wrong the day after somebody adds a route, and the failure is
// silent: the page you forgot to add is the page you never review. The filesystem IS the list —
// every `page.tsx` under `app/` is a route, by definition of the App Router.
//
// ── AND WHY IT IS GENERATED AT BUILD TIME RATHER THAN READ AT RUNTIME ───────────────────────────
//
// An API route could walk `app/` with `readdir`. On Vercel it would find nothing: the source tree
// is not deployed, only the compiled output. Reading the filesystem for this would work perfectly
// in development and return an empty list in production — which is the exact shape of bug this
// project has hit before, and the reason it is a committed JSON file instead.

import fs from 'node:fs';
import path from 'node:path';

const APP = path.join(process.cwd(), 'app');
const OUT = path.join(process.cwd(), 'lib', 'design', 'pages.generated.json');

/** Route groups `(marketing)` and private folders `_components` are not URL segments. */
const isGroup = (name) => name.startsWith('(') && name.endsWith(')');
const isPrivate = (name) => name.startsWith('_') || name === 'api';

/** Which part of the product a route belongs to. Decided by its path, because that is what
 *  determines who sees it and therefore how it should be reviewed. */
function areaOf(route) {
  if (route.startsWith('/admin')) return 'admin';
  if (route.startsWith('/platform')) return 'platform';
  if (route.startsWith('/dnd')) return 'dnd';
  if (/^\/(login|register|signup|forgot|reset|verify|auth)/.test(route)) return 'auth';
  if (/^\/(pay|portal|proposal|share|invoice|customer)/.test(route)) return 'customer';
  return 'public';
}

const routes = [];

function walk(dir, segments) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  const hasPage = entries.some((e) => e.isFile() && /^page\.(tsx|jsx|ts|js)$/.test(e.name));
  if (hasPage) {
    const route = `/${segments.join('/')}` || '/';
    routes.push({
      route: route === '/' ? '/' : route.replace(/\/+$/, ''),
      area: areaOf(route === '' ? '/' : route),
      // A `[id]` segment is one page serving many records. It still needs designing once, and it
      // cannot be visited without picking a record — so it is flagged rather than dropped.
      dynamic: segments.some((s) => s.startsWith('[')),
      file: path.relative(process.cwd(), dir).split(path.sep).join('/'),
    });
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || isPrivate(entry.name)) continue;
    walk(
      path.join(dir, entry.name),
      isGroup(entry.name) ? segments : [...segments, entry.name],
    );
  }
}

walk(APP, []);
routes.sort((a, b) => a.route.localeCompare(b.route));

const byArea = {};
for (const r of routes) byArea[r.area] = (byArea[r.area] ?? 0) + 1;

fs.writeFileSync(OUT, `${JSON.stringify({
  generatedBy: 'scripts/generate-page-inventory.mjs',
  note: 'Every page.tsx under app/. Regenerate after adding a route; do not hand-edit.',
  count: routes.length,
  byArea,
  routes,
}, null, 2)}\n`);

console.log(`\n  ${routes.length} pages found\n`);
for (const [area, n] of Object.entries(byArea).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${area}`);
}
console.log(`\n  Written to ${path.relative(process.cwd(), OUT)}\n`);
