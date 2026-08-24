// scripts/trace-defaults.mjs — a locked default design for every page, traced from the running app.
//
//   node --env-file=.env.local scripts/trace-defaults.mjs --base http://127.0.0.1:3015
//   node --env-file=.env.local scripts/trace-defaults.mjs --area admin        # one area
//   node --env-file=.env.local scripts/trace-defaults.mjs --only /admin/jobs  # one route
//   node --env-file=.env.local scripts/trace-defaults.mjs --missing           # only what has none
//   node --env-file=.env.local scripts/trace-defaults.mjs --only /admin/jobs   # RE-TRACE one page
//
// Re-tracing is the same command as tracing: it replaces the route's default and prints what moved
// (Phase P3). It never touches a design somebody cloned from that default — those are ordinary
// drafts with their own ids, and only the row whose status is `default` is replaced.
//
// Phase P of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"I want you to make it so that we have the default version of each page, and it should be
// represented 1:1 between the editor and the page being actually served."*
//
// ── WHY THE DEFAULT IS TRACED AND NOT DRAWN ─────────────────────────────────────────────────────
//
// "1:1 with what is served" is a claim about a specific page at a specific moment. Nobody can hand-
// build 270 of those in a canvas and have them be true — they would be 270 approximations, and the
// ones that drifted would be indistinguishable from the ones that had not. A trace is measured: it
// walks the live DOM at 1440 and at 390, matches each node to a catalogue entry, and records the
// real geometry.
//
// That is also why the result is LOCKED. A default is evidence. The moment it can be edited it
// stops being evidence and becomes another opinion, and then nothing in the system knows what the
// page actually looks like.
//
// ── WHAT THIS DELIBERATELY DOES NOT TRACE ───────────────────────────────────────────────────────
//
// Dynamic routes (`/admin/jobs/[id]`) have no canonical instance — tracing one job's page would
// make one customer's data the specification for the page. They are skipped and counted.
//
// A page that never finished loading is skipped too, loudly. A capture of a loading splash is a
// design containing one spinner, and it would look like a successful trace of a very simple page.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import { CAPTURE } from './lib/design-capture.mjs';
import { waitForPageReady } from './lib/design-observe.mjs';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = (arg('--base') ?? 'http://127.0.0.1:3015').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const AREA = arg('--area');
const ONLY = arg('--only');
const MISSING_ONLY = process.argv.includes('--missing');
const LIMIT = Number(arg('--limit') ?? 0);

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const PAGES = JSON.parse(fs.readFileSync('lib/design/pages.generated.json', 'utf8'));

/** Which pages to trace, and why the others are not traced. */
function plan() {
  const skipped = [];
  const wanted = [];
  for (const page of PAGES.routes) {
    if (ONLY && page.route !== ONLY) continue;
    if (AREA && page.area !== AREA) continue;
    if (page.dynamic) {
      // `/admin/jobs/[id]` renders one job. Whichever job you picked would become the spec.
      skipped.push({ route: page.route, why: 'dynamic — no canonical instance to trace' });
      continue;
    }
    wanted.push(page);
  }
  return { wanted: LIMIT > 0 ? wanted.slice(0, LIMIT) : wanted, skipped };
}

const token = await encode({ token: { email: AS, name: 'Default tracer', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 4 * 60 * 60 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();

const indexRes = await page.request.fetch(`${BASE}/api/admin/design/import`);
if (!indexRes.ok()) {
  console.error(`  Could not read the catalogue index (${indexRes.status()}). Is the server up and the account a developer?`);
  await browser.close();
  process.exit(1);
}
const { classes } = await indexRes.json();

// What already has a default, so `--missing` can skip it and a re-run is cheap.
const listRes = await page.request.fetch(`${BASE}/api/admin/design`);
const existing = listRes.ok() ? (await listRes.json()).designs ?? [] : [];
const hasDefault = new Set(existing.filter((d) => d.status === 'default').map((d) => d.route));

const { wanted, skipped } = plan();
const todo = MISSING_ONLY ? wanted.filter((p) => !hasDefault.has(p.route)) : wanted;

console.log(`\n  ${BASE} — tracing ${todo.length} page(s) at 1440px and 390px`);
console.log(`  ${skipped.length} skipped as dynamic · ${hasDefault.size} already had a default\n`);

const done = [];
const failed = [];

for (const [i, target] of todo.entries()) {
  const label = `[${String(i + 1).padStart(3)}/${todo.length}] ${target.route.padEnd(42)}`;
  process.stdout.write(`  ${label}`);
  try {
    const captures = {};
    let stillLoading = false;
    for (const [viewId, size] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(size);
      await page.goto(`${BASE}${target.route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // Admin pages fetch after mount. Capturing the splash would trace a spinner and call it a page.
      //
      // Waits for the page rather than for a fixed 2.5s: that number is why `/admin/work` traced 70
      // desktop elements and 2 mobile — not a phone page with two things on it, a capture taken
      // while the page was still arriving.
      if (!await waitForPageReady(page)) stillLoading = true;
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      captures[viewId] = await page.evaluate(CAPTURE, classes);
      if (viewId === 'desktop' && captures[viewId].length < 8) {
        stillLoading = stillLoading
          || await page.locator('text=/^\\s*(Loading|Loading…)\\s*$/').count() > 0;
      }
    }

    if (stillLoading) {
      failed.push({ route: target.route, why: 'never finished loading — a trace here would be a spinner' });
      console.log('—  never finished loading');
      continue;
    }

    const res = await page.request.fetch(`${BASE}/api/admin/design/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        route: target.route,
        name: `${target.route} — as served`,
        desktop: captures.desktop,
        mobile: captures.mobile,
        asDefault: true,
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok()) throw new Error(body?.error ?? `api ${res.status()}`);

    const { coverage, changes } = body;
    done.push({
      route: target.route,
      desktop: coverage.desktop.kept,
      mobile: coverage.mobile.kept,
      changes: changes ?? [],
    });
    console.log(`✓  ${String(coverage.desktop.kept).padStart(3)} desktop · ${String(coverage.mobile.kept).padStart(3)} mobile`);

    // ── WHAT MOVED (P3) ─────────────────────────────────────────────────────────────────────────
    //
    // A re-trace replaces the record of what a page looks like. Doing that silently is the version
    // of this feature that helps nobody: you re-trace precisely BECAUSE the page changed, and if
    // the tool will not say how, the only way to find out is to compare two screenshots by eye.
    //
    // Nothing is printed for a first trace — there was no previous default, so there is no change,
    // and printing "0 added, 0 removed" 130 times would bury the routes that did move.
    for (const change of changes ?? []) {
      const moved = change.moved ?? [];
      if (!change.added.length && !change.removed.length && !moved.length && change.before === change.after) continue;
      const bits = [];
      if (change.before !== change.after) bits.push(`${change.before} → ${change.after} elements`);
      if (change.added.length) bits.push(`+${change.added.length} new: ${change.added.slice(0, 4).join(' ')}`);
      if (change.removed.length) bits.push(`−${change.removed.length} gone: ${change.removed.slice(0, 4).join(' ')}`);
      if (moved.length) bits.push(`${moved.length} moved (worst ${moved[0].signature} by ${moved[0].by}px)`);
      console.log(`        ${change.view}: ${bits.join(' · ')}`);
    }
  } catch (err) {
    failed.push({ route: target.route, why: err.message.split('\n')[0].slice(0, 70) });
    console.log(`—  ${err.message.split('\n')[0].slice(0, 50)}`);
  }
}

await browser.close();

console.log(`\n  ── ${done.length} traced · ${failed.length} failed · ${skipped.length} skipped ──\n`);
if (failed.length) {
  console.log('  Not traced:');
  for (const f of failed) console.log(`    ${f.route.padEnd(44)} ${f.why}`);
  console.log('');
}
const empty = done.filter((d) => d.desktop === 0);
if (empty.length) {
  // A trace with nothing in it is not a page with nothing on it — it is a trace that failed
  // quietly, and it would sit in the list looking like a finished default.
  console.log(`  ${empty.length} page(s) traced to ZERO desktop elements — look at these before trusting them:`);
  for (const e of empty.slice(0, 20)) console.log(`    ${e.route}`);
  console.log('');
}
process.exit(failed.length > 0 ? 1 : 0);
