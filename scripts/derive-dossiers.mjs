// scripts/derive-dossiers.mjs — measure what every page does, and what is on it.
//
//   node --env-file=.env.local scripts/derive-dossiers.mjs --base http://127.0.0.1:3016
//   node --env-file=.env.local scripts/derive-dossiers.mjs --only /admin/jobs
//   node --env-file=.env.local scripts/derive-dossiers.mjs --area admin --limit 20
//   node --env-file=.env.local scripts/derive-dossiers.mjs --missing     # only pages with none
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
import { OBSERVE, waitForPageReady } from './lib/design-observe.mjs';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = (arg('--base') ?? 'http://127.0.0.1:3015').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const AREA = arg('--area') ?? 'admin';
const ONLY = arg('--only');
const LIMIT = Number(arg('--limit') ?? 0);
const MISSING_ONLY = process.argv.includes('--missing');

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
const existing = new Set(((await existingRes.json()).dossiers ?? [])
  .filter((d) => d.elementCount > 0)
  .map((d) => d.route));

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
const todo = LIMIT > 0 ? wanted.slice(0, LIMIT) : wanted;

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

    let problem = null;
    const status = response?.status() ?? 0;
    if (status >= 400) problem = `the page answered ${status}`;
    if (!problem && !ready) problem = 'still loading after 25s — a dossier here would describe a spinner';
    const landedOn = new URL(page.url()).pathname;
    // A forwarding stub is not a page with a missing dossier; it is not a page. Counted as a
    // failure it left four routes permanently in the "not derived" list with nothing to do.
    if (!problem && landedOn !== target.route) {
      skipped.push({ route: target.route, why: `redirects to ${landedOn}` });
      console.log(`—  redirects to ${landedOn} — not a page of its own`);
      continue;
    }

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
