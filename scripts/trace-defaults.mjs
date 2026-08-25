// scripts/trace-defaults.mjs — a locked default design for every page, traced from the running app.
//
//   node --env-file=.env.local scripts/trace-defaults.mjs --base http://127.0.0.1:3015
//   node --env-file=.env.local scripts/trace-defaults.mjs --area admin        # one area
//   node --env-file=.env.local scripts/trace-defaults.mjs --only /admin/jobs  # one route
//   node --env-file=.env.local scripts/trace-defaults.mjs --missing           # only what has none
//   node --env-file=.env.local scripts/trace-defaults.mjs --stale             # records behind their page
//   node --env-file=.env.local scripts/trace-defaults.mjs --since HEAD~1      # what a slice just touched
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
import { waitForPageReady, openState } from './lib/design-observe.mjs';
// The SAME rule the page list draws its "Traced before the page changed" chip from. A queue that
// showed work this tool could not see would be the conformance defect again — two copies of one
// rule, disagreeing, with a number that looked like evidence.
import { staleRoutes, routesChangedSince } from '../lib/design/staleness.ts';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = (arg('--base') ?? 'http://127.0.0.1:3015').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const AREA = arg('--area');
const ONLY = arg('--only');
const MISSING_ONLY = process.argv.includes('--missing');
// S1 of DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md. Two different questions, deliberately two flags:
//   --stale   what has fallen behind — the catch-up queue, and what the page list's fifth gap counts
//   --since   what a slice just touched — for a hook, right after the change
// Conflating them would re-run the whole backlog on every commit.
const STALE_ONLY = process.argv.includes('--stale');
// V4. Off by default: tracing every state of every page is N× the work, and most routes have no
// states at all. `--states` is what you run when you want the tabs too.
const WITH_STATES = process.argv.includes('--states');
const SINCE = arg('--since');
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
    if (/\/(login|signin|sign-in|logout|signout)$/.test(page.route)) {
      // Signed in, these redirect the moment they load — a "trace" of one is a trace of whatever
      // it forwarded to, filed under the wrong route.
      skipped.push({ route: page.route, why: 'auth route — redirects when signed in' });
      continue;
    }
    if (page.dynamic) {
      // `/admin/jobs/[id]` renders one job. Whichever job you picked would become the spec.
      skipped.push({ route: page.route, why: 'dynamic — no canonical instance to trace' });
      continue;
    }
    wanted.push(page);
  }
  // LIMIT is applied by the CALLER, after --missing/--stale/--since have narrowed the list.
  // Slicing here took the first N routes in the INVENTORY and then filtered them, so
  // `--since <ref> --limit 3` traced nothing while reporting "3 route(s) changed" — the two numbers
  // it printed in the same breath disagreed with each other.
  return { wanted, skipped };
}

const token = await encode({ token: { email: AS, name: 'Default tracer', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 4 * 60 * 60 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
let page = await ctx.newPage();

// ── ONE BAD ROUTE MUST NOT TAKE THE REST WITH IT ────────────────────────────────────────────────
//
// A full re-run reported 64 traced and 74 failed, and the 74 were one event: `/admin/login` is a
// page that redirects itself when you are already signed in, so its navigation was still pending
// when the next `goto` started. Playwright answers that with "Navigation is interrupted by another
// navigation" — and it kept answering it, for every remaining route, because they all shared this
// one tab. Seventy-four pages were reported as untraceable when nothing was wrong with any of them.
//
// That is the same shape as the fixed-wait bug and the two before it: the instrument failed and the
// output looked exactly like a finding. A failed route now gets a fresh tab before the next one.
async function freshPage() {
  try { await page.close(); } catch { /* already gone — that is why we are here */ }
  page = await ctx.newPage();
}

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

// ── V4: THE STATES EACH ROUTE HAS ─────────────────────────────────────────────────────────────
//
// Owner: *"I need each actual page to have a default for all tabs and everything."*
//
// Read from the dossiers rather than re-found here: V2's walk already does the finding, and two
// implementations of "what are this page's tabs" would drift the way the conformance check's two
// signature rules did. A route with no dossier yet simply has no states to trace — run the
// deriver first, which is what `--states` says when it finds nothing.
const dossierRes = await page.request.fetch(`${BASE}/api/admin/design/dossier`);
const statesByRoute = new Map();
if (dossierRes.ok()) {
  for (const d of (await dossierRes.json()).dossiers ?? []) {
    if (Array.isArray(d.states) && d.states.length) statesByRoute.set(d.route, d.states);
  }
}

const { wanted, skipped } = plan();
let todo = MISSING_ONLY ? wanted.filter((p) => !hasDefault.has(p.route)) : wanted;

if (STALE_ONLY) {
  const tracedAt = new Map(existing
    // The list API returns SUMMARIES, which are camelCase — `traced_at` is the column name and
    // reads as undefined here. It did: `--stale` matched nothing and reported "0 route(s)" as a
    // success, while the page list drawn from the same rule said 50. A filter that silently matches
    // nothing is the worst kind of wrong, because it looks like good news.
    .filter((d) => d.status === 'default' && d.tracedAt && d.route)
    .map((d) => [d.route, d.tracedAt]));
  const stale = staleRoutes(PAGES.routes, tracedAt);
  todo = todo.filter((p) => stale.has(p.route));
  console.log(`\n  --stale: ${stale.size} route(s) have a default older than their page`);
}

if (SINCE) {
  const changed = routesChangedSince(PAGES.routes, SINCE);
  todo = todo.filter((p) => changed.has(p.route));
  console.log(`\n  --since ${SINCE}: ${changed.size} route(s) changed`);
}

if (LIMIT > 0) todo = todo.slice(0, LIMIT);

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
    // Set by the loop below the moment a navigation lands somewhere else.
    let forwarded = false;
    for (const [viewId, size] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(size);
      await page.goto(`${BASE}${target.route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // ── C14: A FORWARD IS ANSWERED ON THE FIRST NAVIGATION, NOT AFTER TWO FULL WALKS ──────────
      //
      // Moving the forward check above `stillLoading` fixed WHAT this reports. It did nothing about
      // what it costs: the check still sat below this loop, so every stub paid two page loads, two
      // 25s readiness waits and two 15s network-idle waits before anything looked at the URL.
      //
      // After the consolidation roughly eighty of the ninety-eight routes in a `--since` pass are
      // stubs. At up to forty seconds each that is most of an hour spent measuring redirects, which
      // is why the first full pass never finished. The destination is known as soon as navigation
      // resolves, so it is read here and the rest of the walk is skipped.
      // ── AND THE CHECK HAS TO WAIT A MOMENT, BECAUSE THESE FORWARDS ARE CLIENT-SIDE ──────────
      //
      // Measured: every redirect stub this plan created answers a document GET with **200**, not a
      // 307. `redirect()` in a server component is performed by the client router after hydration,
      // so at `domcontentloaded` the URL is still the stub. Reading it there is a RACE — it happened
      // to work for stubs whose destination compiles quickly and not for the rest, which is why
      // `/admin/discussions` reported "redirects to /admin/messages" and `/admin/invites`, four rows
      // later in the same run, reported a hang.
      //
      // So: give the forward a bounded moment to happen. Four seconds is far short of the 25s
      // readiness budget this exists to avoid, and a stub that has not moved in four seconds is one
      // whose destination is worth waiting for as a page anyway.
      await page.waitForURL((u) => new URL(u).pathname !== target.route, { timeout: 4_000 })
        .catch(() => {});
      if (new URL(page.url()).pathname !== target.route) { forwarded = true; break; }

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

    // A route that forwards is not a page, and tracing where it went would lock somebody else's
    // layout in under this URL. Skipped rather than failed: there is nothing here to fix, and a
    // queue that can never reach zero is one people stop reading.
    const landedOn = new URL(page.url()).pathname;
    void forwarded;   // the break above already left `page.url()` on the destination

    // ── C14: THE FORWARD IS CHECKED BEFORE THE SPINNER, AND THE ORDER WAS A REAL BUG ────────────
    //
    // `stillLoading` used to be answered first, and it swallowed every stub whose DESTINATION is
    // slow. After the consolidation that is most of them: `/admin/learn/flashcard-bank`,
    // `/admin/equipment/consumables`, `/admin/equipment/timeline` and `/admin/discussions` all
    // reported "never finished loading" — not because the stub hangs, but because it lands on a
    // portal that has not gone quiet within the budget, and the check below never ran.
    //
    // The cost was not a bad log line. It was S2: the block below RETIRES the locked design a
    // forwarding route no longer has, and it was unreachable for exactly the routes this plan
    // created. Every one of those stubs kept a default claiming to be a 1:1 record of a page that
    // now serves a redirect — the precise rot S2 was written to stop.
    //
    // Where the browser ended up is known the moment navigation resolves; it does not need the page
    // to settle. So the forward is answered first, and the spinner check only speaks for routes that
    // really are trying to be a page.
    if (landedOn !== target.route) {
      // ── S2: RETIRE THE DESIGN THIS ROUTE NO LONGER HAS ──────────────────────────────────────
      //
      // Refusing to trace a forwarding route stops a WRONG default being written. It does nothing
      // about the one that is already there, and that is the half that rots: after C1 of the
      // consolidation plan, `/admin/billing/invoices` and `/admin/billing/plan-history` each still
      // held a LOCKED design called "— as served", claiming to be a 1:1 record of a route that now
      // serves a redirect. A design system is only worth reading if a stale entry cannot sit there
      // looking current.
      //
      // ARCHIVED, not deleted, and the difference matters. These captures are the right page's
      // elements, measured while the route really rendered them — "what this looked like before it
      // became a tab" is worth keeping. (The five removed on 2026-08-24 were a different case: they
      // held the DESTINATION's elements, traced straight through the forward, and were evidence of
      // nothing.) `lifecycle.ts` anticipated exactly this — a default `canBecome: ['archived']`,
      // because "a default can only ever be re-traced or retired".
      const retired = [];
      for (const d of existing.filter((x) => x.route === target.route && x.status === 'default')) {
        const res = await page.request.fetch(`${BASE}/api/admin/design/${d.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: { status: 'archived' },
        });
        retired.push(res.ok() ? d.id : `${d.id} (failed: ${res.status()})`);
      }
      skipped.push({
        route: target.route,
        why: `redirects to ${landedOn} — not a page of its own${retired.length ? `, ${retired.length} design(s) retired` : ''}`,
      });
      console.log(`—  redirects to ${landedOn}${retired.length ? ` · retired ${retired.length} stale design(s)` : ''}`);
      continue;
    }

    // Only now, for a route that really is trying to be a page of its own.
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

    // ── V4: AND NOW EACH STATE OF IT ────────────────────────────────────────────────────────────
    //
    // A tabbed page was never one thing to look at. /admin/settings is six, and the design system
    // recorded whichever one happened to be showing when the walk arrived.
    //
    // Two ways in, tried in order, because the app uses both:
    //   1. the URL — `?tab=invoices` — where the page reads one. Cheap, exact, and re-runnable.
    //   2. clicking the tab, for the pages that hold their state in a variable.
    //
    // AND THEN A CHECK THAT IT WORKED. This is the whole risk of the slice: if the click misses or
    // the URL is ignored, every state captures the SAME tab and the product gets six identical
    // defaults with six different names — worse than none, because they look like a finished job.
    // The capture is only stored when the state that ends up selected is the one we asked for.
    const states = WITH_STATES ? (statesByRoute.get(target.route) ?? []) : [];
    for (const st of states) {
      try {
        const stateCaptures = {};
        let reached = false;
        for (const [viewId, size] of Object.entries(VIEWPORTS)) {
          await page.setViewportSize(size);
          // V6: the try-the-URL-then-click-then-CHECK dance is `openState` in the observer now.
          // Three tools need it and each was about to keep its own copy — which is the exact shape
          // that made every tab of /admin/settings come back as the breadcrumb one slice ago.
          if (!await openState(page, BASE, target.route, st)) break;
          reached = true;
          stateCaptures[viewId] = await page.evaluate(CAPTURE, classes);
        }

        if (!reached || !stateCaptures.desktop) {
          console.log(`        · ${st.key}: could not reach it — not stored`);
          continue;
        }
        const stateRes = await page.request.fetch(`${BASE}/api/admin/design/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: {
            route: target.route,
            stateKey: st.key,
            name: `${target.route} · ${st.key} — as served`,
            desktop: stateCaptures.desktop,
            mobile: stateCaptures.mobile ?? stateCaptures.desktop,
            asDefault: true,
          },
        });
        if (stateRes.ok()) {
          const b = await stateRes.json();
          console.log(`        · ${st.key}: ${b.coverage.desktop.kept} desktop · ${b.coverage.mobile.kept} mobile`);
        } else {
          console.log(`        · ${st.key}: api ${stateRes.status()}`);
        }
      } catch (err) {
        console.log(`        · ${st.key}: ${String(err).split('\n')[0].slice(0, 50)}`);
        await freshPage();
      }
    }

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
    await freshPage();
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
