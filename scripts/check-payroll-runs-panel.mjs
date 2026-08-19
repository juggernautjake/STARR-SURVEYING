// scripts/check-payroll-runs-panel.mjs — the retired payroll engine, seen in a browser (S9c).
//
// `one-pay-model.test.ts` proves the ROUTE is closed and that nothing POSTs to it. It cannot prove
// that the panel a person actually opens still renders, that the button they used to press is gone,
// or that the link replacing it goes anywhere — and "authored but not wired" is this repo's most
// common defect.
//
// Read-only: it loads /admin/payroll, reads the panel, and calls the closed endpoint directly to see
// the refusal. It presses no button that changes a run's status.
//
// Usage: node --env-file=.env.local scripts/check-payroll-runs-panel.mjs [--base URL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3100';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const token = await encode({
  token: { email: AS, name: 'Payroll panel check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{
  name: 'authjs.session-token', value: token,
  domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
}]);
const page = await ctx.newPage();
page.on('pageerror', (e) => bad(`page error: ${String(e).slice(0, 200)}`));

console.log(`\n  ${BASE}/admin/payroll (Payroll tab)\n`);
await page.goto(`${BASE}/admin/payroll`, { waitUntil: 'networkidle', timeout: 180000 });

// The panel lives behind the "payroll" tab.
const tab = page.getByRole('button', { name: /payroll runs/i }).first();
if (await tab.count()) { await tab.click(); await page.waitForTimeout(1500); }

const panel = page.locator('.payroll-runs');
if (await panel.count()) ok('the runs panel renders');
else bad('the runs panel did not render at all');

const body = (await panel.count()) ? await panel.innerText() : await page.locator('body').innerText();

// ── The button that could only fail ─────────────────────────────────────────────────────────────
const newRunBtn = page.getByRole('button', { name: /new payroll run/i });
if (await newRunBtn.count() === 0) ok('"New Payroll Run" is gone');
else bad('"New Payroll Run" is still on screen — pressing it can only produce an error dialog');

const dateInputs = await panel.locator('input[type="date"]').count();
if (dateInputs === 0) ok('the create form is gone with it');
else bad(`the create form is still there (${dateInputs} date inputs)`);

// ── What replaced it ────────────────────────────────────────────────────────────────────────────
const payoutLink = page.locator('a[href="/admin/payouts"]');
const linkCount = await payoutLink.count();
if (linkCount >= 1) ok(`${linkCount} link(s) to /admin/payouts`);
else bad('nothing on the panel points at where payroll now happens');

if (/retired payroll engine/i.test(body)) ok('the panel says what it is now for');
else bad('the panel does not explain that this engine is retired');

// The link must be a real, reachable page — a dead link is the same defect wearing a URL.
if (linkCount >= 1) {
  const res = await page.request.get(`${BASE}/admin/payouts`);
  if (res.ok()) ok(`/admin/payouts answers ${res.status()}`);
  else bad(`/admin/payouts answers ${res.status()}`);
}

// ── The closed endpoint, asked directly ─────────────────────────────────────────────────────────
const post = await page.request.post(`${BASE}/api/admin/payroll/runs`, {
  data: { pay_period_start: '2026-08-10', pay_period_end: '2026-08-16' },
});
if (post.status() === 410) ok('POST /api/admin/payroll/runs answers 410');
else bad(`POST /api/admin/payroll/runs answered ${post.status()}, expected 410`);
const posted = await post.json().catch(() => ({}));
if (String(posted.error ?? '').includes('/admin/payouts') || posted.where === '/admin/payouts') {
  ok('the refusal names where payroll happens now');
} else {
  bad(`the refusal does not name the surviving path: ${JSON.stringify(posted).slice(0, 200)}`);
}

// GET must still work — the history is the reason the route survives at all.
const get = await page.request.get(`${BASE}/api/admin/payroll/runs`);
if (get.ok()) {
  const data = await get.json();
  ok(`GET still lists history (${(data.runs ?? []).length} run(s))`);
} else {
  bad(`GET answered ${get.status()} — the history is unreachable`);
}

// ── Completing a run with no stubs ──────────────────────────────────────────────────────────────
//
// Asked with an id that matches nothing, deliberately: a missing run has no stubs, so it takes the
// same branch as the real draft in the database without touching it. Sending this at the real row
// would risk flipping the firm's only payroll run to `completed` if the guard were wrong, and that
// is the exact record the guard exists to prevent.
const empty = await page.request.put(`${BASE}/api/admin/payroll/runs`, {
  data: { id: '00000000-0000-0000-0000-0000000000ff', status: 'completed' },
});
if (empty.status() === 409) ok('completing a run with no stubs is refused (409)');
else bad(`completing a stubless run answered ${empty.status()}, expected 409`);
const emptyBody = await empty.json().catch(() => ({}));
if (/no pay stubs/i.test(String(emptyBody.error ?? ''))) ok('and it says why, in a sentence');
else bad(`the refusal does not explain itself: ${JSON.stringify(emptyBody).slice(0, 160)}`);

// ── Does that refusal actually reach the screen? ────────────────────────────────────────────────
//
// The response is intercepted in the browser, so the real server never sees this one either. What
// is being tested is the panel: it used to discard the PUT response, so a refusal arrived as
// nothing at all and the only reading was "the button is broken".
page.on('dialog', (d) => d.accept());
await page.route('**/api/admin/payroll/runs', async (route) => {
  if (route.request().method() !== 'PUT') return route.continue();
  await route.fulfill({
    status: 409,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'This run has no pay stubs, so completing it would credit nobody.' }),
  });
});

const complete = page.getByRole('button', { name: /complete & credit balances/i }).first();
if (await complete.count()) {
  await complete.click();
  await page.waitForTimeout(800);
  const box = page.locator('.payroll-runs__error');
  if (await box.count() && /no pay stubs/i.test(await box.innerText())) {
    ok('the refusal is rendered on the panel');
    const styled = await box.evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.borderTopWidth !== '0px' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    });
    if (styled) ok('and it is styled, not unstyled body text');
    else bad('the error box has no styling — the rule is not in a stylesheet this page loads');
  } else {
    bad('the refusal never reached the screen');
  }
} else {
  console.log('  · no draft run on screen, so the rendered-refusal check was skipped');
}
await page.unroute('**/api/admin/payroll/runs');

// ── The phone, since the panel lost a form and gained a paragraph ───────────────────────────────
const phone = await ctx.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(`${BASE}/admin/payroll`, { waitUntil: 'networkidle', timeout: 180000 });
const phoneTab = phone.getByRole('button', { name: /payroll runs/i }).first();
if (await phoneTab.count()) { await phoneTab.click(); await phone.waitForTimeout(1500); }
const overflow = await phone.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow <= 0) ok('no horizontal overflow at 390px');
else bad(`${overflow}px of horizontal overflow at 390px`);

await page.screenshot({ path: 'docs/planning/qa-evidence/payroll-runs-retired-1440.png', fullPage: false });
await phone.screenshot({ path: 'docs/planning/qa-evidence/payroll-runs-retired-390.png', fullPage: false });

await browser.close();
console.log(`\n  ${findings.length === 0 ? 'ALL CLEAR' : `${findings.length} finding(s)`}\n`);
process.exit(findings.length === 0 ? 0 : 1);
