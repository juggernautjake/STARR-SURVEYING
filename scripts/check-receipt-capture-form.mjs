// scripts/check-receipt-capture-form.mjs — drive the per-receipt required fields, in a browser.
//
// Owner, 2026-08-18: *"For each receipt, before it can be submitted, the user has to put in the
// date, business name, and total amount … once the images are captured the user has to fill out the
// information before fully submitting … make sure that everything is formatted correctly and looks
// really good."*
//
// `required-fields.test.ts` proves the RULES. It cannot prove the inputs are wired to them, that the
// submit is actually refused, or that six fields per receipt do not overflow a 390px phone — and
// "authored but not wired" is this repo's most common defect.
//
// Read-only: it queues files, types into boxes, and reads what comes back. It never presses Upload
// with a valid form, so no receipt is created.
//
// Usage: node --env-file=.env.local scripts/check-receipt-capture-form.mjs [--base URL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import sharp from 'sharp';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3100';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
// Screenshots. A default that works when no flag is passed — this used to be
// `process.argv[last]`, which is the BASE URL whenever --base is the final flag, and Windows
// cannot open a path containing 'http:'. A QA script that crashes after its last check still
// leaves you without the phone pass it promised.
const OUT = arg('--out') ?? 'docs/planning/qa-evidence';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const token = await encode({
  token: { email: AS, name: 'Capture form check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

/** Two throwaway JPEGs, so the queue has something to hold. */
async function fakeReceipts() {
  const one = await sharp({ create: { width: 400, height: 900, channels: 3, background: '#ffffff' } })
    .jpeg().toBuffer();
  const two = await sharp({ create: { width: 420, height: 880, channels: 3, background: '#f2f2f2' } })
    .jpeg().toBuffer();
  return [
    { name: 'receipt-a.jpg', mimeType: 'image/jpeg', buffer: one },
    { name: 'receipt-b.jpg', mimeType: 'image/jpeg', buffer: two },
  ];
}

const browser = await chromium.launch();

async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addCookies([{
    name: 'authjs.session-token', value: token,
    domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
  }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => bad(`page error @${width}: ${String(e).slice(0, 160)}`));
  await page.goto(`${BASE}/admin/receipts/new`, { waitUntil: 'networkidle', timeout: 120000 });
  return { ctx, page };
}

/** Queue two photos through the hidden multi-file input. */
async function queueTwo(page) {
  const input = page.locator('input[type="file"][multiple]');
  await input.setInputFiles(await fakeReceipts());
  await page.waitForTimeout(1200);
}

// ── 1440 ────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n  ${BASE}/admin/receipts/new @1440\n`);
const { ctx, page } = await open(1440, 1000);
await queueTwo(page);

const cards = page.locator('ul li').filter({ has: page.locator('input[type="date"]') });
const cardCount = await cards.count();
if (cardCount === 2) ok('one card per queued receipt');
else bad(`expected 2 receipt cards, found ${cardCount}`);

// Every required field present on every card.
for (const [label, sel] of [
  ['date', 'input[type="date"]'],
  ['business name', 'input[aria-label^="Business name"]'],
  ['total', 'input[aria-label^="Total on receipt"]'],
  ['category', 'select[aria-label^="Category for receipt"]'],
  ['paid by', 'select[aria-label^="Payment method for receipt"]'],
  ['business/personal', 'select[aria-label^="Business or personal for receipt"]'],
]) {
  const n = await page.locator(sel).count();
  if (n === 2) ok(`every receipt has a ${label} field`);
  else bad(`${label}: expected 2 fields, found ${n}`);
}

// ── The gate ────────────────────────────────────────────────────────────────────────────────────
const upload = page.getByRole('button', { name: /Upload \d+ receipts?/ });
if (await upload.count() === 0) { bad('no upload button'); }
else {
  await upload.click();
  await page.waitForTimeout(600);

  const blocked = page.locator('#upload-blocked');
  if (await blocked.count() > 0) {
    const t = (await blocked.textContent())?.trim();
    ok(`submitting with empty fields is refused, and says why: "${t}"`);
    if (/date/.test(t ?? '') && /total/.test(t ?? '')) ok('and it names the fields that are missing');
    else bad(`the refusal does not name the missing fields: "${t}"`);
  } else bad('pressing Upload with every field empty was NOT refused');

  const stillNeeded = await page.locator('text=/Still needed:/').count();
  if (stillNeeded === 2) ok('and every incomplete card says what it still needs');
  else bad(`expected 2 per-card "Still needed" notes, found ${stillNeeded}`);
}

// ── Set-once bar ────────────────────────────────────────────────────────────────────────────────
const sharedCat = page.locator('select[aria-label="Category for every receipt in this batch"]');
if (await sharedCat.count() > 0) {
  await sharedCat.selectOption('fuel');
  await page.waitForTimeout(400);
  const perCard = await page.locator('select[aria-label^="Category for receipt"]').first().inputValue();
  if (perCard === 'fuel') ok('one answer fills the category on every receipt');
  else bad(`set-once category did not reach the cards (card shows "${perCard}")`);
} else bad('no set-once bar');

// ── Per-receipt override ────────────────────────────────────────────────────────────────────────
await page.locator('select[aria-label^="Category for receipt"]').nth(1).selectOption('meals');
await page.waitForTimeout(300);
const first = await page.locator('select[aria-label^="Category for receipt"]').first().inputValue();
const second = await page.locator('select[aria-label^="Category for receipt"]').nth(1).inputValue();
if (first === 'fuel' && second === 'meals') ok('and a single receipt can still differ from the stack');
else bad(`override failed: first=${first} second=${second}`);

// ── A future date is refused ────────────────────────────────────────────────────────────────────
await page.locator('input[type="date"]').first().fill('2027-01-01');
await page.waitForTimeout(400);
const futureMsg = await page.locator('text=/cannot be from tomorrow/').count();
if (futureMsg > 0) ok('a future date is rejected with a plain reason');
else bad('a future date was accepted');

// ── Filling everything clears the block ─────────────────────────────────────────────────────────
// The BROWSER's local date, not the runner's UTC. They differ for part of every day, and the form's
// `max` attribute is local — so a UTC "today" is a FUTURE date for several hours out of every
// twenty-four. That is exactly what this check reported as a page bug on its first run: the form was
// correctly rejecting tomorrow, and the harness had handed it tomorrow.
const today = await page.evaluate(() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});
for (let i = 0; i < 2; i += 1) {
  await page.locator('input[type="date"]').nth(i).fill(today);
  await page.locator('input[aria-label^="Business name"]').nth(i).fill('CEFCO');
  await page.locator('input[aria-label^="Total on receipt"]').nth(i).fill('9.03');
  await page.locator('select[aria-label^="Business or personal for receipt"]').nth(i).selectOption('business');
  await page.locator('select[aria-label^="Payment method for receipt"]').nth(i).selectOption('card');
}
await page.waitForTimeout(600);
if (await page.locator('#upload-blocked').count() === 0) ok('the block clears once every field is filled');
else {
  const t = (await page.locator('#upload-blocked').textContent())?.trim();
  bad(`still blocked after filling everything: "${t}"`);
}

// ── Formatting: nothing may overflow ────────────────────────────────────────────────────────────
const overflow1440 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (!overflow1440) ok('no sideways scroll at 1440');
else bad('the page scrolls sideways at 1440');

await page.screenshot({ path: `${OUT}/capture-1440.png`, fullPage: false });
await ctx.close();

// ── 390: the phone ──────────────────────────────────────────────────────────────────────────────
console.log(`\n  ${BASE}/admin/receipts/new @390 (phone)\n`);
const m = await open(390, 844);
await queueTwo(m.page);

const geo = await m.page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input[type="date"], input[aria-label^="Total on receipt"], select')];
  const w = window.innerWidth;
  return {
    docOverflow: document.documentElement.scrollWidth > w + 1,
    overflowing: inputs.filter((el) => el.getBoundingClientRect().right > w + 1).length,
    shortest: Math.min(...inputs.map((el) => Math.round(el.getBoundingClientRect().height))),
    count: inputs.length,
  };
});
if (!geo.docOverflow) ok('no sideways scroll at 390');
else bad('the page scrolls sideways at 390');
if (geo.overflowing === 0) ok(`all ${geo.count} controls fit inside the viewport`);
else bad(`${geo.overflowing} controls run off the right edge at 390`);
if (geo.shortest >= 32) ok(`smallest control is ${geo.shortest}px tall — thumb-sized`);
else bad(`a control is only ${geo.shortest}px tall`);

await m.page.screenshot({ path: `${OUT}/capture-390.png`, fullPage: false });
await m.ctx.close();
await browser.close();

console.log(`\n  ${findings.length === 0 ? 'CLEAN' : `${findings.length} finding(s)`}\n`);
process.exit(findings.length === 0 ? 0 : 1);
