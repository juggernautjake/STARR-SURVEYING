// scripts/derive-dossiers.mjs — measure what every page does, and what is on it.
//
//   node --env-file=.env.local scripts/derive-dossiers.mjs --base http://127.0.0.1:3016
//   node --env-file=.env.local scripts/derive-dossiers.mjs --only /admin/jobs
//   node --env-file=.env.local scripts/derive-dossiers.mjs --area admin --limit 20
//   node --env-file=.env.local scripts/derive-dossiers.mjs --missing     # only pages with none
//   node --env-file=.env.local scripts/derive-dossiers.mjs --stale       # dossiers behind their page
//   node --env-file=.env.local scripts/derive-dossiers.mjs --since HEAD~1  # what a slice touched
//
// Phase D1 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"I want you to evaluate/analyze each page and determine the purpose of the page and what
// all functions it serves."*
//
// ── WHY THIS IS A WALK AND NOT A WRITE-UP ───────────────────────────────────────────────────────
//
// 176 admin routes described by hand is a document that is wrong within a month and gives no
// signal about WHICH lines have rotted. So the half that can be measured is measured: the controls,
// the regions, the endpoints the page calls while it loads. The half that cannot — what the page is
// FOR — is left blank for a person, and the editor says which pages are still waiting for that
// sentence. Two halves, two lifetimes, and neither overwrites the other.
//
// ── THE NETWORK LIST IS THE MOST USEFUL PART ────────────────────────────────────────────────────
//
// A `POST /api/admin/jobs` while the page is open says more about what a page does than any number
// of buttons: it is the page writing something, observed. That is why the walk listens to requests
// rather than only reading the DOM — and why it waits after load, because the calls that matter are
// the ones the page makes once it has settled.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import { OBSERVE, waitForPageReady, openState } from './lib/design-observe.mjs';
// The same rule the page list and the tracer use. One definition of "the record is behind the
// page", so the queue and the tools that empty it cannot disagree.
import { staleRoutes, routesChangedSince } from '../lib/design/staleness.ts';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = (arg('--base') ?? 'http://127.0.0.1:3015').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const AREA = arg('--area') ?? 'admin';
const ONLY = arg('--only');
const LIMIT = Number(arg('--limit') ?? 0);
const MISSING_ONLY = process.argv.includes('--missing');
// S1. Same two questions as the tracer, same two flags, same shared rule — "what has fallen
// behind" and "what did this slice touch" are different queues and conflating them would re-run
// the whole backlog on every commit.
const STALE_ONLY = process.argv.includes('--stale');
const SINCE = arg('--since');
// ── V6: ONE DOSSIER PER TAB ─────────────────────────────────────────────────────────────────────
//
// Owner: *"each page that has tabs… has its own like, sub page listed… so that I can edit each one
// individually."* V4 gave every tab its own DEFAULT DESIGN; without this, every tab still shared one
// inventory and one checklist — so a tab could be designed but never measured, and its checklist
// asked about elements belonging to whichever tab the walk happened to land on.
//
// Behind a flag, and off by default, for one reason: it multiplies the walk. `/admin/settings`
// alone is six extra page loads, and the full admin sweep is ~78 states on top of 176 routes.
const WITH_STATES = process.argv.includes('--states');

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const PAGES = JSON.parse(fs.readFileSync('lib/design/pages.generated.json', 'utf8'));

const token = await encode({
  token: { email: AS, name: 'Dossier deriver', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 4 * 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{
  name: 'authjs.session-token', value: token,
  domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax',
}]);
let page = await ctx.newPage();

// The same recovery `trace-defaults.mjs` needed, for the same reason: these walks share one tab,
// and a route that redirects itself leaves a navigation pending that fails every route after it.
// Seventy-four consecutive "failures" in the tracer were one such event. A fresh tab after any
// failure keeps one bad page from being reported as a bad product.
async function freshPage() {
  try { await page.close(); } catch { /* already gone — that is why we are here */ }
  page = await ctx.newPage();
}

// What already has a dossier, so `--missing` is cheap and a re-run does not redo the whole product.
const existingRes = await page.request.fetch(`${BASE}/api/admin/design/dossier`);
if (!existingRes.ok()) {
  console.error(`  Could not read the dossier list (${existingRes.status()}). Is the server up and the account a developer?`);
  await browser.close();
  process.exit(1);
}
// Kept as ROWS rather than collapsed straight into a Set: `--stale` needs `derivedAt` off the
// same fetch, and asking for the list twice to get one more field is how a script ends up with two
// slightly different pictures of the same table.
const dossierRows = (await existingRes.json()).dossiers ?? [];
const existing = new Set(dossierRows.filter((d) => d.elementCount > 0).map((d) => d.route));

const wanted = PAGES.routes.filter((p) => {
  if (ONLY) return p.route === ONLY;
  if (AREA && p.area !== AREA) return false;
  // A dynamic route has no canonical instance: whichever record you loaded would become the
  // description of the page. Same reason the tracer skips them.
  // Signed in, these forward immediately — a dossier derived here describes the destination
  // filed under the wrong route.
  if (/\/(login|signin|sign-in|logout|signout)$/.test(p.route)) return false;
  if (p.dynamic) return false;
  if (MISSING_ONLY && existing.has(p.route)) return false;
  return true;
});
let scoped = wanted;

if (STALE_ONLY) {
  // `existing` is a Set of routes that HAVE a dossier; the derived_at timestamp comes from the
  // dossier list endpoint. Both are already fetched above.
  const derivedAt = new Map(dossierRows
    .filter((d) => d.route && d.derivedAt)
    .map((d) => [d.route, d.derivedAt]));
  const stale = staleRoutes(PAGES.routes, derivedAt);
  scoped = scoped.filter((p) => stale.has(p.route));
  console.log(`\n  --stale: ${stale.size} route(s) have a dossier older than their page`);
}

if (SINCE) {
  const changed = routesChangedSince(PAGES.routes, SINCE);
  scoped = scoped.filter((p) => changed.has(p.route));
  console.log(`\n  --since ${SINCE}: ${changed.size} route(s) changed`);
}

const todo = LIMIT > 0 ? scoped.slice(0, LIMIT) : scoped;

console.log(`\n  ${BASE} — deriving ${todo.length} dossier(s)`);
console.log(`  ${existing.size} already measured\n`);

const done = [];
const failed = [];
const skipped = [];

for (const [i, target] of todo.entries()) {
  const label = `[${String(i + 1).padStart(3)}/${todo.length}] ${target.route.padEnd(44)}`;
  process.stdout.write(`  ${label}`);

  // Requests are collected per page, and only the app's own API: a font from a CDN says nothing
  // about what the page does.
  const requests = [];
  const onRequest = (req) => {
    try {
      const url = new URL(req.url());
      if (url.origin !== new URL(BASE).origin) return;
      if (!url.pathname.startsWith('/api/')) return;
      requests.push({ method: req.method(), path: url.pathname });
    } catch { /* a malformed URL is not evidence of anything */ }
  };
  page.on('request', onRequest);

  try {
    const response = await page.goto(`${BASE}${target.route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // ── WAIT FOR THE PAGE, NOT FOR A NUMBER ─────────────────────────────────────────────────────
    //
    // The first version waited a fixed 2.5s. `/admin/audit` renders its spinner for four seconds and
    // `/admin/billing` for eleven, so both were observed as EMPTY and refused — two real pages
    // recorded as having nothing on them, because the wait was measuring the dev server's compile
    // time rather than the page.
    const ready = await waitForPageReady(page);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // A forwarding stub is not a page with a missing dossier; it is not a page. Counted as a
    // failure it left four routes permanently in the "not derived" list with nothing to do.
    //
    // ── C14: ASKED BEFORE THE SPINNER, AND THE ORDER WAS THE SAME BUG AS trace-defaults ─────────
    //
    // This check used to sit below `problem` and be guarded by `!problem` — so a stub whose
    // DESTINATION is slow had `problem` set to "still loading" first and was never recognised as a
    // forward at all. After the consolidation that is most stubs: they land on a portal that has not
    // gone quiet inside the budget.
    //
    // Which is the very failure the comment above records being fixed once already, arriving by a
    // different door: four routes stuck permanently in "not derived" with nothing to do about it.
    // Found by fixing the identical ordering in `trace-defaults.mjs` and then reading its sibling.
    //
    // Where the browser ended up is known as soon as navigation resolves and needs no readiness. A
    // 4xx is still checked BELOW rather than here, because that is a real answer from a real
    // request, and a stub that forwards to a page answering 500 should say so.
    const landedOn = new URL(page.url()).pathname;
    if (landedOn !== target.route) {
      skipped.push({ route: target.route, why: `redirects to ${landedOn}` });
      console.log(`—  redirects to ${landedOn} — not a page of its own`);
      continue;
    }

    let problem = null;
    const status = response?.status() ?? 0;
    if (status >= 400) problem = `the page answered ${status}`;
    if (!problem && !ready) problem = 'still loading after 25s — a dossier here would describe a spinner';

    const observed = await page.evaluate(OBSERVE);
    if (!problem && observed.controls.length === 0 && observed.headings.length === 0) {
      // An empty observation is not an empty page — it is a walk that arrived too early or landed
      // somewhere else. Stored, it would become a dossier saying the page has nothing on it.
      problem = 'nothing observable — the page had not rendered';
    }

    const res = await page.request.fetch(`${BASE}/api/admin/design/dossier/derive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { base: BASE, observation: { route: target.route, ...observed, requests, problem } },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok()) throw new Error(body?.error ?? `api ${res.status()}`);

    const { dossier, checklist } = body;
    done.push({ route: target.route, elements: dossier.elementCount, functions: dossier.functions.length });
    console.log(`✓  ${String(dossier.elementCount).padStart(3)} elements · ${dossier.functions.length} functions · ${checklist.generated} checklist items`);

    // ── AND EACH OF ITS STATES (V6) ──────────────────────────────────────────────────────────────
    //
    // The route walk above already found them — `observed.states` is the tab strip, read from the
    // DOM. Each one is now visited on its own and inventoried on its own.
    //
    // The listening is deliberately per state: the requests are the most useful half of a dossier,
    // and `GET /api/admin/invoices` firing when you open the invoices tab is the single clearest
    // statement of what that tab is for. Collected across the whole route they would be attributed
    // to all six tabs equally, which says nothing about any of them.
    if (WITH_STATES && observed.states?.length) {
      for (const st of observed.states) {
        const stateRequests = [];
        const onStateRequest = (req) => {
          try {
            const url = new URL(req.url());
            if (url.origin !== new URL(BASE).origin) return;
            if (!url.pathname.startsWith('/api/')) return;
            stateRequests.push({ method: req.method(), path: url.pathname });
          } catch { /* a malformed URL is not evidence of anything */ }
        };
        page.on('request', onStateRequest);
        try {
          const reached = await openState(page, BASE, target.route, st, { param: observed.stateParam ?? 'tab' });
          if (!reached) {
            // Not stored, and said out loud. `/admin/my-pay` has states nested inside another tab
            // that cannot be reached from the outside — a dossier written anyway would be the
            // PARENT tab's inventory filed under the child's name, and nothing downstream could
            // tell. A visible skip is a piece of work somebody can schedule; a wrong row is not.
            console.log(`        · ${st.key.padEnd(20)} could not reach it — not derived`);
            continue;
          }
          const stateObserved = await page.evaluate(OBSERVE);
          if (stateObserved.controls.length === 0 && stateObserved.headings.length === 0) {
            console.log(`        · ${st.key.padEnd(20)} nothing observable — not derived`);
            continue;
          }
          const stateRes = await page.request.fetch(`${BASE}/api/admin/design/dossier/derive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: {
              base: BASE,
              stateKey: st.key,
              observation: {
                route: target.route,
                ...stateObserved,
                // The tab strip is on screen from inside every tab, so the walk finds all six again
                // from each of them. Stored, `/admin/settings?tab=billing` would claim to have six
                // states of its own and the page list would draw tabs nested inside tabs, forever.
                // A state's states are the route's states, and the route already records them.
                states: [],
                requests: stateRequests,
                problem: null,
              },
            },
          });
          const stateBody = await stateRes.json().catch(() => null);
          if (!stateRes.ok()) throw new Error(stateBody?.error ?? `api ${stateRes.status()}`);
          console.log(`        · ${st.key.padEnd(20)} ✓ ${String(stateBody.dossier.elementCount).padStart(3)} elements · ${stateBody.checklist.generated} checklist items`);
        } catch (stateErr) {
          console.log(`        · ${st.key.padEnd(20)} — ${stateErr.message.split('\n')[0].slice(0, 50)}`);
        } finally {
          try { page.off('request', onStateRequest); } catch { /* the tab is already gone */ }
        }
      }
    }
  } catch (err) {
    failed.push({ route: target.route, why: err.message.split('\n')[0].slice(0, 70) });
    console.log(`—  ${err.message.split('\n')[0].slice(0, 60)}`);
    try { page.off('request', onRequest); } catch { /* the tab is already gone */ }
    await freshPage();
    continue;
  } finally {
    try { page.off('request', onRequest); } catch { /* replaced by freshPage() */ }
  }
}

await browser.close();

console.log(`\n  ── ${done.length} derived · ${failed.length} not derived · ${skipped.length} not a page ──\n`);
if (failed.length) {
  for (const f of failed) console.log(`    ${f.route.padEnd(46)} ${f.why}`);
  console.log('');
}
if (skipped.length) {
  console.log('  Routes that forward somewhere else — nothing to derive, and nothing wrong:');
  for (const sk of skipped) console.log(`    ${sk.route.padEnd(46)} ${sk.why}`);
  console.log('');
}
// Said out loud rather than left in the data: a dossier is only half a dossier until somebody
// writes what the page is FOR, and nothing in a measurement can produce that sentence.
console.log('  Every page above now has a measured inventory and a generated checklist.');
console.log('  The written half — purpose, summary, audience — is at /admin/design/dossiers.\n');
process.exit(failed.length > 0 ? 1 : 0);
