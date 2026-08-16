// scripts/check-job-field-tab.mjs — drive the job Field Work tab, which no sweep can reach.
//
// C0d2 of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// Both standing sweeps take their routes from `lib/admin/route-registry.ts` and then drop anything
// parameterised — `qa-sweep.ts` and `ui-align-audit.mjs` both filter on `!h.includes('[')`, because
// a route with an `[id]` in it needs a real record to visit. That is the right default and it means
// **`/admin/jobs/[id]/field` has never been visited by either of them.**
//
// So C0d2 shipped a compose box onto a page that 0 findings across 130 routes says nothing about.
// The doc's own working note is the reason this file exists rather than a claim that the sweeps
// covered it: *"Drive the surface, don't only measure it."*
//
// Checks the three things that would actually be wrong: the page renders, the compose control is
// present and reachable, and the phone width does not overflow.
//
// Usage: npx tsx --env-file=.env.local scripts/check-job-field-tab.mjs --job <uuid> [--base URL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3100';
const JOB = arg('--job');
const EMAIL = arg('--as') ?? 'jacobmaddux@starr-surveying.com';

if (!JOB) {
  console.error('--job <uuid> is required');
  process.exit(2);
}

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) {
  console.error('AUTH_SECRET is not set — cannot mint a session.');
  process.exit(2);
}

const token = await encode({
  token: { email: EMAIL, name: 'Field tab check', sub: EMAIL },
  secret,
  salt: 'authjs.session-token',
  maxAge: 60 * 60,
});

const findings = [];
const browser = await chromium.launch();

for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies([{
    name: 'authjs.session-token', value: token,
    domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
  }]);
  const page = await ctx.newPage();

  page.on('pageerror', (e) => findings.push({ width, kind: 'pageerror', detail: String(e).slice(0, 200) }));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Same carve-out the sweep makes, for the same reason: a prefetch the navigation cancelled.
    if (/Failed to fetch RSC payload/.test(t)) return;
    findings.push({ width, kind: 'console', detail: t.slice(0, 200) });
  });
  page.on('response', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE)) return;
    if (r.status() >= 500) findings.push({ width, kind: 'request', detail: `HTTP ${r.status()} ${u.replace(BASE, '')}` });
  });

  const url = `${BASE}/admin/jobs/${JOB}/field`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  // The page fetches its manifest after mount; the compose box renders with the notes section.
  await page.waitForTimeout(1500);

  // 1. The compose control exists and can be typed into. A textarea that renders but is not
  //    reachable is the "authored but not wired" shape this repo keeps producing.
  const box = page.getByLabel('New job note');
  const visible = await box.isVisible().catch(() => false);
  if (!visible) {
    findings.push({ width, kind: 'missing', detail: 'the New job note textarea is not visible' });
  } else {
    await box.fill('scratch — not saved');
    const btn = page.getByRole('button', { name: /Add note/i });
    if (!(await btn.isEnabled().catch(() => false))) {
      findings.push({ width, kind: 'disabled', detail: 'Add note stayed disabled with text typed' });
    }
    // Deliberately NOT clicked: this runs against the live database, and a QA note on a real job is
    // litter somebody has to find and delete. The enabled state is what was in doubt.
    await box.fill('');
  }

  // 2. Horizontal overflow — the phone-width failure this codebase keeps regressing.
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  if (overflow > 1) {
    findings.push({ width, kind: 'overflow', detail: `document scrolls ${overflow}px horizontally` });
  }

  await ctx.close();
}

await browser.close();

if (findings.length === 0) {
  console.log(`\n  /admin/jobs/${JOB}/field — clean at 1440 and 390\n`);
} else {
  console.log(`\n  ${findings.length} finding(s)\n`);
  for (const f of findings) console.log(`  ${String(f.width).padStart(4)}  ${f.kind.padEnd(10)} ${f.detail}`);
  console.log('');
}
process.exitCode = findings.length ? 1 : 0;
