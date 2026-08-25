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
import { waitForPageReady, openState, devErrorOn } from './lib/design-observe.mjs';
// The SAME rule the page list draws its "Traced before the page changed" chip from. A queue that
// showed work this tool could not see would be the conformance defect again — two copies of one
// rule, disagreeing, with a number that looked like evidence.
import { staleRoutes, routesChangedSince } from '../lib/design/staleness.ts';
// The SAME rule the studio's `lopsided-default` gap is drawn from. It was inline here first, and a
// second copy in the page list would have been two definitions that agree until somebody changes one.
import { isLopsided, lopsidedRatio } from '../lib/design/lopsided.ts';

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
// (`freshPage` is below, after the three helpers this walk leans on.)

/**
 * What a re-trace replaced, per viewport — for a route AND for each of its states.
 *
 * ── WHY THIS IS A FUNCTION NOW ──────────────────────────────────────────────────────────────────
 *
 * The note this code carries is emphatic: a re-trace replaces the record of what a page looks like,
 * and doing that silently *"is the version of this feature that helps nobody — you re-trace
 * precisely BECAUSE the page changed, and if the tool will not say how, the only way to find out is
 * to compare two screenshots by eye."*
 *
 * That rule was written for routes and never reached STATES, which have replaced their rows silently
 * ever since V4 added them. It showed: `/admin/equipment · overrides` captured 50 desktop elements
 * in one run and 42 in the next, the second overwrote the first, and nothing said a word. The only
 * reason anyone noticed is that both numbers happened to be on screen in the same session.
 *
 * A state's record is a locked default exactly like a route's. If one deserves an account of what it
 * replaced, so does the other.
 *
 * Nothing is printed when nothing moved — a first trace has no previous default, and "0 added, 0
 * removed" a hundred times would bury the rows that did.
 */
function reportChanges(changes, indent) {
  for (const change of changes ?? []) {
    const moved = change.moved ?? [];
    if (!change.added.length && !change.removed.length && !moved.length && change.before === change.after) continue;
    const bits = [];
    if (change.before !== change.after) bits.push(`${change.before} → ${change.after} elements`);
    if (change.added.length) bits.push(`+${change.added.length} new: ${change.added.slice(0, 4).join(' ')}`);
    if (change.removed.length) bits.push(`−${change.removed.length} gone: ${change.removed.slice(0, 4).join(' ')}`);
    if (moved.length) bits.push(`${moved.length} moved (worst ${moved[0].signature} by ${moved[0].by}px)`);
    console.log(`${indent}${change.view}: ${bits.join(' · ')}`);
  }
}

/**
 * Capture, then capture again, until the page stops growing.
 *
 * ── WHAT THE LOPSIDED RECORDS ACTUALLY WERE ─────────────────────────────────────────────────────
 *
 * `/admin/learn · card-bank` stored 598 desktop elements and 21 mobile ones, and the 21 are worth
 * reading: `admin-empty` — the EMPTY STATE — a search box, a title, and 617px of content against
 * desktop's 5230px. Mobile did not render a different layout. It photographed the page **before its
 * rows arrived**, and filed "nothing here" as the record of what that tab looks like.
 *
 * Everything before this waited for a PROXY and then captured once: `waitForPageReady` waits for a
 * heading or a button, `openState` waits for the right tab to be selected. Both are satisfied by a
 * shell that has not fetched anything yet. Every fixed wait in this file has been too short for
 * somebody — the route walk (4 of 51 pages), the state opener (three tabs), the re-capture — and
 * lengthening them is how you buy the same bug at a higher price.
 *
 * So stop guessing at a duration and watch the thing itself. Capture, wait, capture again; while the
 * count is still climbing the page is still arriving. Return the largest reading, because this
 * failure only ever makes a capture too small — nothing renders fewer elements by waiting.
 */
async function captureStable(page, classes, { tries = 6, gap = 1_200, settled = 2 } = {}) {
  // ── ONE FLAT READING IS NOT STABILITY ─────────────────────────────────────────────────────────
  //
  // The first version returned on the FIRST non-increase, which cannot tell "stopped growing" from
  // "has not started". Measured on the very next sweep, after this function had supposedly fixed
  // the class:
  //
  //     ⟳ job-profitability: 32 desktop vs 97 mobile — re-capturing desktop
  //     ⟳ field-team:        25 desktop vs 108 mobile — re-capturing desktop
  //
  // Both had been repaired an hour earlier, to 92 and 106.
  //
  // Requiring the count to hold across TWO consecutive gaps is the right rule — one flat reading
  // genuinely cannot tell the two apart — and it costs a finished page one extra 1.2s per capture.
  //
  // ── BUT IT DOES NOT FIX THOSE TWO PAGES, AND SAYING OTHERWISE WOULD BE THE THIRD OVERSTATEMENT ──
  //
  // Measured after the change: `job-profitability` still captured 32 on the first pass and was still
  // rescued by the asymmetry guard. Probed ALONE the same tab reaches 98 within 1200ms and holds, so
  // the reading this loop gets under a full sweep is not the reading the page gives when it is the
  // only thing running. Load changes the answer, which is exactly why no fixed gap can be the fix.
  //
  // So the honest division of labour: **this makes a cheap first attempt more often correct, and
  // `recaptureIfLopsided` is what actually rescues a slow page.** An earlier comment here claimed
  // the fix landed "on the FIRST capture rather than depending on a retry". For these pages it
  // depends on the retry, and a downstream guard quietly covering for an upstream one is how the
  // upstream problem survives being noticed.
  let best = await page.evaluate(CAPTURE, classes);
  let flat = 0;
  for (let i = 1; i < tries; i += 1) {
    await page.waitForTimeout(gap);
    const next = await page.evaluate(CAPTURE, classes);
    if (next.length > best.length) { best = next; flat = 0; continue; }
    flat += 1;
    if (flat >= settled) return best;
  }
  return best;
}

/**
 * A capture that is a fraction of its other viewport was taken too early — so take it again.
 *
 * ── THE MEASUREMENT THAT PROMPTED THIS ──────────────────────────────────────────────────────────
 *
 * Of 191 stored defaults, five had one viewport at three times the other or worse:
 *
 *     /admin/learn · card-bank                 21 desktop   598 mobile   28.5x
 *     /admin/research · data-sources           19 desktop   251 mobile   13.2x
 *     /admin/marketing · connection-uploads    28 desktop   282 mobile   10.1x
 *     /admin/hours · field-team                22 desktop   105 mobile    4.8x
 *     /admin/finances · job-profitability      29 desktop    91 mobile    3.1x
 *
 * **All five short on DESKTOP, and desktop is the viewport this walk captures first.** That is not
 * a coincidence, it is a systematic bias: the first capture happens straight after the navigation
 * and the second gets the benefit of everything the first waited through. `/admin/work` traced 70
 * desktop and 2 mobile once, and the note left behind called it "a capture taken while the page was
 * still arriving" — the same fault with the viewports the other way round.
 *
 * It is not theoretical drift either: `connection-uploads` measured 283 desktop elements when its
 * portal was traced alone, and 28 when the full sweep re-traced it. **A good record was replaced by
 * a bad one**, which is the specific harm a locked default exists to prevent.
 *
 * A page genuinely differs between 1440 and 390 — a table becomes cards, a rail collapses — so some
 * difference is expected and 3x is deliberately generous. A MULTIPLE is not layout, it is a page
 * half-drawn.
 *
 * `reopen(viewId)` puts the page back the way that viewport saw it; for a route that is a
 * navigation, for a state it is `openState`. The better of the two readings wins, because the
 * failure is always a capture that is too SMALL — nothing renders extra elements by waiting.
 */
async function recaptureIfLopsided(captures, reopen, label) {
  const d = captures.desktop?.length ?? 0;
  const m = captures.mobile?.length ?? 0;
  // The threshold used to be spelled out here. It is now `lib/design/lopsided.ts`, which the page
  // list's `lopsided-default` gap reads too — so the record this tool refuses to store and the chip
  // the studio shows a person cannot disagree about what "lopsided" means.
  if (!isLopsided(d, m)) return captures;

  const short = d < m ? 'desktop' : 'mobile';
  const before = short === 'desktop' ? d : m;
  console.log(`        ⟳ ${label}: ${d} desktop vs ${m} mobile (${lopsidedRatio(d, m).toFixed(1)}x) — re-capturing ${short}`);

  const again = await reopen(short);
  if (!again) {
    console.log(`        ⟳ ${label}: could not re-open at ${short}; keeping the first reading`);
    return captures;
  }
  if (again.length > before) {
    console.log(`        ⟳ ${label}: ${short} ${before} → ${again.length} elements`);
    return { ...captures, [short]: again };
  }
  // Said out loud rather than swallowed: if the second reading is no better, the asymmetry is real
  // and belongs to the page, and somebody should look at it rather than assume the tool handled it.
  console.log(`        ⟳ ${label}: ${short} still ${again.length} — the difference looks real`);
  return captures;
}

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

/**
 * Is this route a redirect stub? Answered by READING THE FILE, not by driving a browser at it.
 *
 * ── WHY THE FILE AND NOT THE NAVIGATION ─────────────────────────────────────────────────────────
 *
 * Three fixes went into detecting forwards by navigating: ask before the readiness check, ask on the
 * first navigation rather than after two, then wait a bounded moment because the forward is
 * CLIENT-side and the URL has not moved yet. Each was right and the third still left a flake —
 * `/admin/learn/flashcard-bank` forwards to the Learn portal's 130,000-character tab, which in dev
 * does not finish compiling inside eighty seconds, so the redirect had not happened by the time both
 * viewports gave up. The report was accurate and useless: "never finished loading" about a page that
 * does not exist.
 *
 * More timeout is the wrong answer to that. The source says so with certainty and in a millisecond:
 * a page whose body calls `redirect()` is a stub however slow its destination is. This skips the
 * navigation entirely for roughly eighty of the ninety-eight routes in a `--since` pass, which is
 * both the speed and the reliability.
 *
 * Deliberately narrow: only a `redirect(` in the page's OWN file counts. A page that redirects
 * conditionally still renders something the rest of the time, and this must not silently stop
 * tracing a real page — so the check is for the shape C9-C13 actually wrote, a stub whose whole body
 * is the forward.
 */
function redirectTargetOf(page) {
  try {
    const src = fs.readFileSync(`${page.file}/page.tsx`, 'utf8')
      .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // The stub shape: a component whose body is exactly one redirect call.
    const m = src.match(/export default function [A-Za-z]*\(\)\s*(?::\s*[A-Za-z]+\s*)?\{\s*redirect\('([^']+)'\);?\s*\}/);
    return m ? m[1] : null;
  } catch { return null; }
}

const done = [];
const failed = [];

for (const [i, target] of todo.entries()) {
  const label = `[${String(i + 1).padStart(3)}/${todo.length}] ${target.route.padEnd(42)}`;
  process.stdout.write(`  ${label}`);
  try {
    // ── READ THE FILE BEFORE DRIVING A BROWSER AT IT ────────────────────────────────────────────
    const staticTarget = redirectTargetOf(target);
    if (staticTarget) {
      const retired = [];
      for (const d of existing.filter((x) => x.route === target.route && x.status === 'default')) {
        const res = await page.request.fetch(`${BASE}/api/admin/design/${d.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: { status: 'archived' },
        });
        retired.push(res.ok() ? d.id : `${d.id} (failed: ${res.status()})`);
      }
      const to = staticTarget.split('?')[0];
      skipped.push({ route: target.route, why: `redirects to ${to} — not a page of its own${retired.length ? `, ${retired.length} design(s) retired` : ''}` });
      console.log(`—  redirects to ${to}${retired.length ? ` · retired ${retired.length} stale design(s)` : ''}`);
      continue;
    }

    const captures = {};
    let stillLoading = false;
    // Set when the dev server answered with a compile error instead of the page.
    let devError = null;
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
      // A dev error overlay passes `waitForPageReady` — it has a heading, buttons and links — and a
      // capture taken over it stores a stack trace as this route's locked default. Asked BEFORE the
      // capture, because afterwards there is nothing to distinguish it from a page.
      const broken = await devErrorOn(page);
      if (broken) { devError = broken; break; }
      captures[viewId] = await captureStable(page, classes);
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
    // Asked before `stillLoading`, for the same reason the forward check is: a compile error is a
    // MORE specific answer than "it did not settle", and reporting the vaguer one first is how the
    // stub bug hid for a week. This one is also not the app's fault, and saying so matters — the
    // route is fine, the server was mid-rebuild, and the fix is to re-run it, not to open the page.
    if (devError) {
      failed.push({ route: target.route, why: `dev server was broken — ${devError}` });
      console.log(`—  ${devError} · NOT stored`);
      continue;
    }

    if (stillLoading) {
      failed.push({ route: target.route, why: 'never finished loading — a trace here would be a spinner' });
      console.log('—  never finished loading');
      continue;
    }

    // Before storing: is one viewport a fraction of the other? See `recaptureIfLopsided`.
    Object.assign(captures, await recaptureIfLopsided(captures, async (viewId) => {
      await page.setViewportSize(VIEWPORTS[viewId]);
      await page.goto(`${BASE}${target.route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      if (!await waitForPageReady(page)) return null;
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      return captureStable(page, classes);
    }, target.route));

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
        let stDevError = null;
        for (const [viewId, size] of Object.entries(VIEWPORTS)) {
          await page.setViewportSize(size);
          // V6: the try-the-URL-then-click-then-CHECK dance is `openState` in the observer now.
          // Three tools need it and each was about to keep its own copy — which is the exact shape
          // that made every tab of /admin/settings come back as the breadcrumb one slice ago.
          if (!await openState(page, BASE, target.route, st)) break;
          // Same guard as the route capture above. A state is a second navigation, so the server can
          // break between the page and the tab — and a tab's default is exactly as wrong to fill
          // with a stack trace as a page's.
          stDevError = await devErrorOn(page);
          if (stDevError) break;
          reached = true;
          stateCaptures[viewId] = await captureStable(page, classes);
        }

        if (!reached || !stateCaptures.desktop) {
          // Two different failures, and they must not wear the same words. "Could not reach it" says
          // the tab is the problem — which is what sent an afternoon looking for a structural cause
          // behind three tabs that were merely cold. A broken server is not an unreachable tab.
          console.log(stDevError
            ? `        · ${st.key}: ${stDevError} — not stored`
            : `        · ${st.key}: could not reach it — not stored`);
          continue;
        }
        // Same guard as the route. States are where the five lopsided records actually were.
        Object.assign(stateCaptures, await recaptureIfLopsided(stateCaptures, async (viewId) => {
          await page.setViewportSize(VIEWPORTS[viewId]);
          if (!await openState(page, BASE, target.route, st)) return null;
          return captureStable(page, classes);
        }, `${st.key}`));

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
          // A state's default is a locked record like a route's, and until now it was replaced in
          // silence. See `reportChanges`.
          reportChanges(b.changes, `          ${st.key} `);
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
    reportChanges(changes, '        ');
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
