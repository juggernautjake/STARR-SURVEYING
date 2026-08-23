// scripts/design-coverage-sweep.mjs — walk every page and ask what the catalogue cannot name.
//
//   node --env-file=.env.local scripts/design-coverage-sweep.mjs
//   node --env-file=.env.local scripts/design-coverage-sweep.mjs --only jobs --base http://127.0.0.1:3211
//
// Slice C9 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"systematically go through each and every page and thoroughly catalogue each and every
// element of every kind."*
//
// ── WHY THIS REPLACED THE ORIGINAL PLAN FOR C9 ──────────────────────────────────────────────────
//
// C9 was written as a manual pass: open each of the 147 admin routes, look at it, and decide which
// elements the catalogue is missing. That is weeks of work whose output is a judgement, and the
// judgement is made by whoever is least tired.
//
// The import walk (§13) does it mechanically. Point it at a route and it reports every element on
// that page that matches no catalogue entry — not an opinion about coverage, but the page saying
// what it wears. So this runs that walk across every route and aggregates.
//
// ── THE RANKING IS THE POINT ────────────────────────────────────────────────────────────────────
//
// The output is not "here are 400 unknown classes". It is those classes ranked by **how many ROUTES
// they appear on**, because that is exactly the curation priority: a class on 40 pages is one entry
// that makes 40 pages designable, and a class on one page is a bespoke thing that may never need an
// entry at all. Nothing in a static CSS scan can tell you that — a stylesheet does not know how many
// pages render it.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import fs from 'node:fs';
import { CAPTURE } from './lib/design-capture.mjs';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = (arg('--base') ?? 'http://127.0.0.1:3211').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const ONLY = arg('--only');
const LIMIT = Number(arg('--limit') ?? 0);
const OUT = arg('--out') ?? 'docs/planning/design-coverage.md';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

/** The same registry `ui-fit-sweep` walks, so "every page" means the same thing in both. */
function routes() {
  const src = fs.readFileSync('lib/admin/route-registry.ts', 'utf8');
  const found = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
  const list = [...new Set(found)]
    .filter((h) => h.startsWith('/') && !h.includes('[') && !h.includes(':'))
    .filter((h) => !ONLY || h.includes(ONLY))
    .sort();
  return LIMIT > 0 ? list.slice(0, LIMIT) : list;
}

const token = await encode({
  token: { email: AS, name: 'Design coverage sweep', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60 * 3,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('dialog', (d) => void d.accept());

const indexRes = await page.request.fetch(`${BASE}/api/admin/design/import`);
if (!indexRes.ok()) {
  console.error(`  Could not read the catalogue index (${indexRes.status()}).`);
  await browser.close();
  process.exit(1);
}
const { classes, entries } = await indexRes.json();

const list = routes();
console.log(`\n  Sweeping ${list.length} route(s) against ${entries} catalogue entries\n`);

/** route → { kept, matched, gaps: [{classes, tag, count, sample}] } */
const perRoute = [];
const failures = [];

for (const [i, route] of list.entries()) {
  process.stdout.write(`  [${String(i + 1).padStart(3)}/${list.length}] ${route.padEnd(38)}`);
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2200);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // A page still showing its loading splash reports zero gaps, which reads exactly like full
    // coverage. That false clean has bitten this repo's sweeps before, so it is called out.
    const stillLoading = await page.locator('text=/^\\s*(Loading|Loading…)\\s*$/').count();

    const captured = await page.evaluate(CAPTURE, classes);
    const res = await page.request.fetch(`${BASE}/api/admin/design/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { route, dryRun: true, desktop: captured, mobile: [] },
    });
    if (!res.ok()) throw new Error(`api ${res.status()}`);
    const { coverage } = await res.json();

    const gapCount = coverage.gaps.reduce((n, g) => n + g.count, 0);
    perRoute.push({
      route,
      kept: coverage.desktop.kept,
      gaps: coverage.gaps,
      gapCount,
      loading: stillLoading > 0 && coverage.desktop.kept < 5,
    });
    console.log(`${String(coverage.desktop.kept).padStart(4)} elements, ${String(coverage.gaps.length).padStart(3)} unnamed${stillLoading > 0 && coverage.desktop.kept < 5 ? '  (never finished loading)' : ''}`);
  } catch (err) {
    failures.push({ route, why: err.message.split('\n')[0].slice(0, 80) });
    console.log(`—  ${err.message.split('\n')[0].slice(0, 50)}`);
  }
}

await browser.close();

// ── Aggregate: how many ROUTES each unknown class appears on ──────────────────────────────────
const byClass = new Map();
for (const r of perRoute) {
  if (r.loading) continue;
  for (const gap of r.gaps) {
    const key = gap.classes;
    const existing = byClass.get(key) ?? { classes: key, tag: gap.tag, routes: new Set(), total: 0, sample: gap.sample };
    existing.routes.add(r.route);
    existing.total += gap.count;
    if (!existing.sample && gap.sample) existing.sample = gap.sample;
    byClass.set(key, existing);
  }
}
const ranked = [...byClass.values()]
  .map((g) => ({ ...g, routeCount: g.routes.size }))
  .sort((a, b) => b.routeCount - a.routeCount || b.total - a.total);

const measured = perRoute.filter((r) => !r.loading);
const totalElements = measured.reduce((n, r) => n + r.kept, 0);
const totalGaps = measured.reduce((n, r) => n + r.gapCount, 0);
const covered = totalElements ? Math.round(((totalElements - totalGaps) / totalElements) * 100) : 0;

// ── The document ──────────────────────────────────────────────────────────────────────────────
const lines = [];
lines.push('# Catalogue coverage — what the Page Designer can and cannot name', '');
lines.push('*Generated by `scripts/design-coverage-sweep.mjs`. Do not hand-edit — re-run it.*', '');
lines.push('Every admin route is opened signed-in at 1440px and walked with the same function the');
lines.push('importer uses (`scripts/lib/design-capture.mjs`). Each element is matched against the');
lines.push('catalogue. What follows is what the pages themselves say they wear.', '');
lines.push(`- **${measured.length} routes measured**, ${entries} catalogue entries`);
lines.push(`- **${totalElements} elements** found; **${totalGaps}** matched no entry`);
lines.push(`- **≈${covered}% of rendered elements are catalogued**`);
if (perRoute.some((r) => r.loading)) {
  lines.push(`- ${perRoute.filter((r) => r.loading).length} route(s) never finished loading and are EXCLUDED — a page showing a spinner reports zero gaps, which reads exactly like full coverage`);
}
if (failures.length) lines.push(`- ${failures.length} route(s) could not be measured (listed at the end)`);
lines.push('');

lines.push('## What to curate next', '');
lines.push('Ranked by **how many routes** each unnamed class appears on, not by how many times it is');
lines.push('rendered. A class on 40 pages is one entry that makes 40 pages designable; a class on one');
lines.push('page may never need an entry at all. A static CSS scan cannot tell you this — a');
lines.push('stylesheet does not know how many pages render it.', '');
lines.push('| Routes | Instances | Element | Example content |');
lines.push('|---:|---:|---|---|');
for (const g of ranked.slice(0, 60)) {
  const selector = `\`${g.tag}.${g.classes.split(' ').join('.')}\``;
  const sample = g.sample ? `“${g.sample.replace(/\|/g, '\\|').slice(0, 40)}”` : '';
  lines.push(`| ${g.routeCount} | ${g.total} | ${selector} | ${sample} |`);
}
if (ranked.length > 60) lines.push('', `…and ${ranked.length - 60} more, each on fewer routes.`);
lines.push('');

lines.push('## Per route', '');
lines.push('| Route | Elements | Unnamed |');
lines.push('|---|---:|---:|');
for (const r of [...measured].sort((a, b) => b.gapCount - a.gapCount)) {
  lines.push(`| \`${r.route}\` | ${r.kept} | ${r.gapCount} |`);
}
lines.push('');

if (perRoute.some((r) => r.loading)) {
  lines.push('## Never finished loading', '');
  lines.push('Measured as almost empty, so excluded from the totals rather than counted as covered.', '');
  for (const r of perRoute.filter((x) => x.loading)) lines.push(`- \`${r.route}\``);
  lines.push('');
}

if (failures.length) {
  lines.push('## Could not be measured', '');
  for (const f of failures) lines.push(`- \`${f.route}\` — ${f.why}`);
  lines.push('');
}

fs.writeFileSync(OUT, lines.join('\n'));

console.log(`\n  ── ${measured.length} routes, ${totalElements} elements, ≈${covered}% catalogued ──\n`);
console.log('  Top gaps by how many routes they appear on:\n');
for (const g of ranked.slice(0, 15)) {
  console.log(`    ${String(g.routeCount).padStart(3)} routes  ${g.tag}.${g.classes.split(' ').join('.')}`);
}
console.log(`\n  Written to ${OUT}\n`);
