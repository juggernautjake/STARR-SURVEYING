// scripts/check-receipt-periods.mjs — drive the day/week/month/year row and the carousel entry point.
//
// Owner, 2026-08-17: *"review the receipts for a given day, week, month, year in a carousel …
// arrows for navigating forward and backward … The access point to this receipt viewer should be
// obvious … make sure this all looks good for both pc and mobile devices."*
//
// ── WHY A BROWSER ───────────────────────────────────────────────────────────────────────────────
//
// `lib/receipts/periods.ts` has 19 tests and they prove the arithmetic. None of them can prove the
// buttons are wired to it, that the lit state follows the dates, or that the row does not overflow a
// 390px phone — and "authored but not wired" is this repo's most common defect. Read-only: it clicks
// filters and reads text, and never touches a receipt.
//
// Usage: node --env-file=.env.local scripts/check-receipt-periods.mjs [--base URL]

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
  token: { email: AS, name: 'Receipt period check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();

async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addCookies([{
    name: 'authjs.session-token', value: token,
    domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
  }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => bad(`page error @${width}: ${String(e).slice(0, 160)}`));
  await page.goto(`${BASE}/admin/receipts`, { waitUntil: 'networkidle', timeout: 120000 });
  return { ctx, page };
}

const dates = (page) => page.evaluate(() => {
  const i = [...document.querySelectorAll('input[type="date"]')];
  return { from: i[0]?.value ?? null, to: i[1]?.value ?? null };
});

const litPreset = (page) => page.evaluate(() => {
  const g = document.querySelector('[aria-label="Show a whole day, week, month or year"]');
  const on = [...(g?.querySelectorAll('button') ?? [])].find((b) => b.getAttribute('aria-pressed') === 'true');
  return on?.textContent?.trim() ?? null;
});

// ── 1440: the whole row, and the arithmetic behind the arrows ─────────────────────────────────
console.log(`\n  ${BASE}/admin/receipts @1440\n`);
const { ctx, page } = await open(1440, 900);

const presets = page.locator('[aria-label="Show a whole day, week, month or year"] button');
const n = await presets.count();
if (n === 4) ok('four presets render: Day / Week / Month / Year');
else bad(`expected 4 presets, found ${n}`);

// Default is this month, so Month should already be lit — the lit state is DERIVED from the dates,
// which is the thing a stored-state version would get wrong.
const lit0 = await litPreset(page);
if (lit0 === 'Month') ok('Month is lit on load, derived from the default range');
else bad(`expected Month lit on load, got ${lit0}`);

// Month → the range must be a whole real month, last day included.
await presets.filter({ hasText: 'Month' }).click();
await page.waitForTimeout(400);
const m = await dates(page);
const lastDay = new Date(Number(m.from.slice(0, 4)), Number(m.from.slice(5, 7)), 0).getDate();
if (m.from.endsWith('-01') && Number(m.to.slice(8, 10)) === lastDay) {
  ok(`Month = ${m.from} → ${m.to} (real last day, ${lastDay})`);
} else bad(`Month gave ${m.from} → ${m.to}, expected the 1st to day ${lastDay}`);

const label = page.locator('[aria-live="polite"]').first();
const monthLabel = (await label.textContent())?.trim();
if (/This month/.test(monthLabel ?? '')) ok(`label reads "${monthLabel}"`);
else bad(`label read "${monthLabel}", expected it to name the current month`);

// The forward arrow must be DEAD on the current period — a receipt cannot be filed for next month.
const next = page.locator('button[aria-label^="Next"]');
if (await next.isDisabled()) ok('the forward arrow is disabled on the current period');
else bad('the forward arrow is live on the current period, so it can page into an empty future');

// Back one month, and the label + dates must both move.
await page.locator('button[aria-label^="Previous"]').click();
await page.waitForTimeout(400);
const prev = await dates(page);
const prevLabel = (await label.textContent())?.trim();
if (prev.from < m.from && prev.from.endsWith('-01')) ok(`← stepped to ${prevLabel} (${prev.from} → ${prev.to})`);
else bad(`← left the range at ${prev.from} → ${prev.to}`);
if (await next.isDisabled()) bad('the forward arrow stayed disabled after stepping back');
else ok('the forward arrow woke up once off the current period');

// Week must be Monday-to-Sunday, matching the hours week.
await presets.filter({ hasText: 'Week' }).click();
await page.waitForTimeout(400);
const w = await dates(page);
const dow = new Date(`${w.from}T12:00:00Z`).getUTCDay();
if (dow === 1) ok(`Week starts on a Monday (${w.from}), matching /admin/my-hours`);
else bad(`Week starts on day ${dow} (${w.from}); the hours week starts Monday`);
const span = (new Date(`${w.to}T12:00:00Z`) - new Date(`${w.from}T12:00:00Z`)) / 86400000;
if (span === 6) ok('Week spans 7 inclusive days');
else bad(`Week spans ${span + 1} days`);

// Day.
await presets.filter({ hasText: 'Day' }).click();
await page.waitForTimeout(400);
const d = await dates(page);
if (d.from === d.to) ok(`Day is a single date (${d.from})`);
else bad(`Day gave ${d.from} → ${d.to}`);
if ((await label.textContent())?.trim() === 'Today') ok('and says "Today" rather than printing a date');
else bad(`Day label read "${(await label.textContent())?.trim()}"`);

// ── The carousel entry point, which the owner asked to be obvious ─────────────────────────────
// Checked BEFORE the custom-range step below. Getting that order wrong once already produced a
// false finding: the custom range matched no receipts, the button correctly read "Nothing to
// review", and the check reported the entry point missing. A probe can manufacture the absence it
// then reports.
const cta = page.getByRole('button', { name: 'Open the receipt carousel' });
if (await cta.count() > 0) {
  const t = (await cta.first().textContent())?.trim();
  const box = await cta.first().boundingBox();
  ok(`carousel entry point reads "${t}"`);
  // Above the fold and above the filter row, or it is not obvious.
  if (box && box.y < 600) ok(`and sits ${Math.round(box.y)}px down the page, in the period row`);
  else bad(`the carousel button is ${Math.round(box?.y ?? -1)}px down — below the fold`);
} else bad('no carousel button — the viewer has no obvious way in');

// And it must actually OPEN. Moving a control is exactly when the handler gets left behind, and a
// button that looks right and does nothing is worse than one that was never moved. Back to Month
// first, because Day may legitimately hold no receipts and a disabled button proves nothing.
await presets.filter({ hasText: 'Month' }).click();
await page.waitForTimeout(900);

// …and onto a tab that actually holds rows. The default tab is `pending`, which is legitimately
// empty most of the time — that is the queue being clear, not a defect, and asserting against it
// would be the second self-inflicted finding in this file.
const tabWithRows = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('nav button')];
  const hit = btns.find((b) => {
    const n = Number(b.textContent?.match(/(\d+)\s*$/)?.[1] ?? 0);
    return n > 0;
  });
  if (hit) hit.click();
  return hit?.textContent?.trim() ?? null;
});
await page.waitForTimeout(1200);
if (tabWithRows) ok(`switched to a populated tab: "${tabWithRows}"`);

if (await cta.isDisabled()) {
  bad(`the carousel button is disabled on "${tabWithRows}", which reports rows`);
} else {
  await cta.click();
  await page.waitForTimeout(1200);
  const view = page.locator('.rcv__stage, .rcv__panel, [class*="rcv__"]').first();
  if (await view.count() > 0) {
    ok('clicking it opens the carousel');
    // The two things the owner asked to see in there.
    const body = (await page.locator('body').innerText()).toLowerCase();
    if (/confiden/.test(body)) ok('and the confidence score is on screen');
    else bad('the carousel opened without a confidence score');
    if (/line items/.test(body)) ok('and the line items section is on screen');
    else bad('the carousel opened without the line items section');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } else bad('the carousel button no longer opens the viewer after being moved');
}

// Typing a date by hand that is NOT a preset must drop the lit state and hide the arrows — the
// buttons follow the dates, not the last click.
await page.locator('input[type="date"]').nth(1).fill('2026-08-19');
await page.waitForTimeout(500);
const litCustom = await litPreset(page);
if (litCustom === null) ok('a hand-typed range lights nothing — no button claims a range it is not');
else bad(`a hand-typed range still shows ${litCustom} lit`);
if (await page.locator('button[aria-label^="Previous"]').count() === 0) {
  ok('and the arrows are gone, since "the month before this" is meaningless for a custom range');
} else bad('the arrows survive on a custom range, where a step has no defined meaning');

await ctx.close();

// ── 390: the same row on a phone, and nothing may overflow ────────────────────────────────────
console.log(`\n  ${BASE}/admin/receipts @390 (phone)\n`);
const m390 = await open(390, 844);

const over = await m390.page.evaluate(() => {
  const row = document.querySelector('[aria-label="Show a whole day, week, month or year"]')?.parentElement;
  if (!row) return { missing: true };
  const r = row.getBoundingClientRect();
  return {
    missing: false,
    overflows: r.right > window.innerWidth + 1,
    docOverflows: document.documentElement.scrollWidth > window.innerWidth + 1,
    height: Math.round(r.height),
  };
});
if (over.missing) bad('the period row is absent at 390px');
else {
  if (!over.overflows) ok(`the period row fits 390px (it is ${over.height}px tall, so it wrapped)`);
  else bad('the period row runs off the right edge at 390px');
  if (!over.docOverflows) ok('and the page itself does not scroll sideways');
  else bad('the page scrolls sideways at 390px');
}

const tap = await m390.page.evaluate(() => {
  const b = [...document.querySelectorAll('[aria-label="Show a whole day, week, month or year"] button')];
  return b.map((x) => Math.round(x.getBoundingClientRect().height));
});
if (tap.every((h) => h >= 30)) ok(`preset buttons are ${tap.join('/')}px tall — thumb-sized`);
else bad(`preset buttons are only ${tap.join('/')}px tall`);

await m390.ctx.close();
await browser.close();

console.log(`\n  ${findings.length === 0 ? 'CLEAN' : `${findings.length} finding(s)`}\n`);
process.exit(findings.length === 0 ? 0 : 1);
