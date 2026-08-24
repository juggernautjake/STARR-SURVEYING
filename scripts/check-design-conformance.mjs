// scripts/check-design-conformance.mjs — how far apart the design and the page are, in numbers.
//
//   node --env-file=.env.local scripts/check-design-conformance.mjs --base http://127.0.0.1:3016
//   node --env-file=.env.local scripts/check-design-conformance.mjs --only /admin/jobs
//   node --env-file=.env.local scripts/check-design-conformance.mjs --which default   # the P4 proof
//   node --env-file=.env.local scripts/check-design-conformance.mjs --write           # record it
//
// Phases R3 + P4 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// ── THE TWO QUESTIONS THIS ANSWERS ──────────────────────────────────────────────────────────────
//
//   --which active   *"is the served page the active version yet?"* — the closest honest answer to
//                    the request that an active design become the served page. Nothing here changes
//                    the app; it measures the distance between the specification and the product.
//   --which default  *"is the default still a 1:1 trace?"* — a default CLAIMS to be a record of what
//                    is served, and a claim nothing checks is a claim that quietly stops being true
//                    the next time somebody ships a change to that page.
//
// Only the second gets a pass/fail. An active design differing from the page is the normal state of
// a proposal; scoring that as a failure would make every unbuilt improvement look like a defect,
// and a check that fails for doing its job is one people turn off.
//
// `--write` records the run in `lib/design/conformance.generated.json`, which the vitest gate reads
// (a browser cannot run in vitest, and asserting against a jsdom approximation would be exactly the
// class of lie this whole phase exists to prevent).

import fs from 'node:fs';
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import { CAPTURE } from './lib/design-capture.mjs';
import { waitForPageReady } from './lib/design-observe.mjs';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = (arg('--base') ?? 'http://127.0.0.1:3015').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const ONLY = arg('--only');
const WHICH = arg('--which') ?? 'both';
const LIMIT = Number(arg('--limit') ?? 0);
const WRITE = process.argv.includes('--write');
const RECORD_PATH = 'lib/design/conformance.generated.json';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

const token = await encode({
  token: { email: AS, name: 'Conformance check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 4 * 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
await ctx.addCookies([{
  name: 'authjs.session-token', value: token,
  domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax',
}]);
let page = await ctx.newPage();

// The third walk in this system to need it. These loops share one tab, and a route that forwards
// leaves a navigation pending that fails every route after it — in the tracer that turned one bad
// page into seventy-four reported failures. A fresh tab after any failure keeps a run honest.
async function freshPage() {
  try { await page.close(); } catch { /* already gone — that is why we are here */ }
  page = await ctx.newPage();
}

const indexRes = await page.request.fetch(`${BASE}/api/admin/design/import`);
if (!indexRes.ok()) {
  console.error(`  Could not read the catalogue index (${indexRes.status()}).`);
  await browser.close();
  process.exit(1);
}
const { classes } = await indexRes.json();

const listRes = await page.request.fetch(`${BASE}/api/admin/design`);
const designs = listRes.ok() ? (await listRes.json()).designs ?? [] : [];

// Only routes that have something to compare against. Walking a page with no design would produce
// a row saying nothing, 138 times.
const wantDefault = WHICH === 'default' || WHICH === 'both';
const wantActive = WHICH === 'active' || WHICH === 'both';
const routes = [...new Set(designs
  .filter((d) => d.route && ((wantActive && d.status === 'active') || (wantDefault && d.status === 'default')))
  .map((d) => d.route))]
  .filter((r) => !ONLY || r === ONLY)
  .sort();
const todo = LIMIT > 0 ? routes.slice(0, LIMIT) : routes;

console.log(`\n  ${BASE} — comparing ${todo.length} page(s) against their ${WHICH} design(s)\n`);

const record = { measuredAt: new Date().toISOString(), base: BASE, which: WHICH, routes: {} };
let failures = 0;

for (const [i, route] of todo.entries()) {
  process.stdout.write(`  [${String(i + 1).padStart(3)}/${todo.length}] ${route.padEnd(42)}`);
  try {
    // ── ONE RETRY, AND WHY IT IS NOT CHEATING ─────────────────────────────────────────────────
    //
    // A full sweep produced twenty failing views. Ten of them passed at 100% when re-run one at a
    // time, minutes later, against the same app and the same stored default — `/admin/weather`
    // reported 116 elements missing on a capture that had found TWO elements on the whole page.
    // That is not a stale trace, it is a capture taken while the page was still assembling, and
    // filing it as drift buries the routes that really did drift.
    //
    // So a failing view is measured a second time and the better reading is kept. This can only
    // hide a defect that fails once and passes once — and a default that matches its page on one
    // of two consecutive captures is not a default anybody needs to go and re-trace. What it
    // cannot hide is a real difference, because a real difference is there both times.
    const capture = async () => {
      const captures = {};
      for (const [viewId, size] of Object.entries(VIEWPORTS)) {
        await page.setViewportSize(size);
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // WAIT FOR THE PAGE, NOT FOR A NUMBER. This was the last fixed wait left in the system, and
      // it was in the one script whose entire job is to say whether a default is still true: a
      // capture taken 2.2s in is missing whatever had not arrived, and every element it missed is
      // reported as "in the default but not on the page — the trace is stale". `/admin/jobs`, four
      // minutes after being traced from this very app, scored 95% and named four elements that were
      // on the screen the whole time. A check that manufactures staleness is worse than no check,
      // because the number looks like evidence.
        await waitForPageReady(page);
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        captures[viewId] = await page.evaluate(CAPTURE, classes);
      }
      const res = await page.request.fetch(`${BASE}/api/admin/design/conformance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { route, which: WHICH, desktop: captures.desktop, mobile: captures.mobile },
      });
      const body = await res.json();
      if (!res.ok()) throw new Error(body?.error ?? `api ${res.status()}`);
      return body;
    };

    let body = await capture();
    const total = (b) => (b.reports ?? []).reduce((sum, r) => sum + (r.report?.score ?? 0), 0);
    if ((body.reports ?? []).some((r) => r.verdict && !r.verdict.ok)) {
      const second = await capture();
      if (total(second) > total(body)) body = second;
    }

    record.routes[route] = body.reports.map((r) => ({
      kind: r.kind,
      view: r.report.view,
      designId: r.report.designId,
      designName: r.report.designName,
      score: r.report.score,
      designElements: r.report.designElements,
      pageElements: r.report.pageElements,
      matched: r.report.matched,
      missing: r.report.findings.filter((f) => f.kind === 'missing').length,
      moved: r.report.findings.filter((f) => f.kind === 'moved').length,
      resized: r.report.findings.filter((f) => f.kind === 'resized').length,
      extra: r.report.findings.filter((f) => f.kind === 'extra').length,
      verdict: r.verdict ?? null,
      // The worst ten, so the record is actionable without being a transcript of the page.
      worst: r.report.findings.slice(0, 10).map((f) => ({ kind: f.kind, signature: f.signature, note: f.note })),
    }));

    const lines = record.routes[route]
      .map((r) => `${r.kind}/${r.view} ${String(r.score).padStart(3)}%`)
      .join(' · ');
    const failed = record.routes[route].filter((r) => r.verdict && !r.verdict.ok);
    failures += failed.length;
    console.log(`${failed.length ? '!' : '✓'}  ${lines}`);
    for (const f of failed) console.log(`        default/${f.view}: ${f.verdict.why}`);
  } catch (err) {
    console.log(`—  ${err.message.split('\n')[0].slice(0, 60)}`);
    record.routes[route] = [{ error: err.message.split('\n')[0].slice(0, 120) }];
    await freshPage();
  }
}

await browser.close();

if (WRITE) {
  fs.writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\n  Written to ${RECORD_PATH}`);
}

console.log(`\n  ── ${todo.length} page(s) compared · ${failures} default(s) no longer 1:1 ──\n`);
// Exits non-zero only on a DEFAULT that has stopped being a faithful trace. An active design that
// differs from the page is the normal state of a proposal, and failing on it would make this check
// something people stop running.
process.exit(failures > 0 ? 1 : 0);
