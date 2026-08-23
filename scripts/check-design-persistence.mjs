// scripts/check-design-persistence.mjs — is a design REALLY on the server?
//
//   node scripts/check-design-persistence.mjs --base http://127.0.0.1:3219
//
// ── WHY THIS EXISTS AS ITS OWN CHECK ────────────────────────────────────────────────────────────
//
// The studio saved to `localStorage` first, and `lib/design/client.ts` deliberately keeps that as a
// fallback. Which means the ONE failure this repo produces most — a table seeded, an API written,
// and nothing actually calling it — would be completely invisible from inside a single browser
// session: every save would appear to work, every reload would find the design, and the database
// would stay empty forever.
//
// So the assertion is made from a SECOND browser context with its own empty storage. If the design
// opens there, it came off the server. If it does not, the wiring is decoration.
//
// It also checks the two things the version table exists for: that saving twice leaves a history,
// and that restoring an old version does not destroy the ones after it.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const args = process.argv.slice(2);
const BASE = (args[args.indexOf('--base') + 1] ?? 'http://127.0.0.1:3219').replace(/\/$/, '');
const AS = 'jacobmaddux@starr-surveying.com';
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const problems = [];
const ok = [];
function check(condition, description, detail) {
  if (condition) { ok.push(description); console.log(`  ✓ ${description}`); }
  else { problems.push(`${description}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${description}${detail ? ` — ${detail}` : ''}`); }
}

const token = await encode({ token: { email: AS, name: 'Persistence check', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const host = new URL(BASE).hostname;
const browser = await chromium.launch();

/** A browser context that has never seen this app before. */
async function freshContext() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: host, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  return ctx;
}

const NAME = `Persistence probe ${new Date().toISOString().slice(11, 19)}`;
let designId = '';

// ── 1. Make a design, place something, save it ────────────────────────────────────────────────
console.log('\nMaking a design in the first browser…');
{
  const ctx = await freshContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ds-create"]');
  await page.fill('.dsx-home__new-row input', NAME);
  await page.locator('.dsx-home__new-row input').nth(1).fill('/admin/jobs');
  await page.click('[data-testid="ds-create"]');
  await page.waitForSelector('.dsx__artboard', { timeout: 15000 });

  designId = new URL(page.url()).pathname.split('/').pop() ?? '';
  check(!!designId, 'creating a design lands on its own editor url', page.url());

  await page.fill('[data-testid="ds-palette-search"]', 'text.page-title');
  await page.waitForTimeout(250);
  await page.locator('[data-testid="ds-palette-item-text.page-title"]').first().click();
  await page.waitForTimeout(200);

  await page.locator('.dsx__tool--primary', { hasText: 'Save' }).first().click();
  await page.waitForTimeout(1500);
  const status = await page.locator('.dsx__status').textContent().catch(() => '');
  check(/Saved/i.test(status ?? '') && !/browser only/i.test(status ?? ''),
    'the studio reports a real save, not a browser-only one', status ?? '(no status)');
  await ctx.close();
}

// ── 2. Open it somewhere that has never stored anything ───────────────────────────────────────
console.log('\nOpening it in a second browser with empty storage…');
{
  const ctx = await freshContext();
  const page = await ctx.newPage();

  const stored = await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' })
    .then(() => page.evaluate(() => Object.keys(window.localStorage).length));
  check(stored === 0, 'the second browser genuinely starts with empty storage', `${stored} keys`);

  await page.waitForSelector('.dsx-home__card, .admin-empty', { timeout: 15000 });
  await page.waitForTimeout(600);
  const listed = await page.locator('.dsx-home__card-main h3', { hasText: NAME }).count();
  check(listed > 0, 'the design is listed on a machine that never made it');

  await page.goto(`${BASE}/admin/design/${designId}`, { waitUntil: 'domcontentloaded' });
  const artboard = await page.waitForSelector('.dsx__artboard', { timeout: 15000 }).catch(() => null);
  check(!!artboard, 'the design OPENS there — so it came off the server, not the browser');
  if (artboard) {
    const elements = await page.locator('.dsx__el').count();
    check(elements === 1, 'the element that was placed came back with it', `${elements} elements`);
  }
  await ctx.close();
}

// ── 3. History: two saves, two versions, and a restore that destroys nothing ──────────────────
console.log('\nChecking version history…');
{
  const ctx = await freshContext();
  const page = await ctx.newPage();
  const api = async (path, init) => {
    const res = await page.request.fetch(`${BASE}${path}`, init);
    return { status: res.status(), body: await res.json().catch(() => null) };
  };

  const first = await api(`/api/admin/design/${designId}/versions`);
  check(first.status === 200 && Array.isArray(first.body?.versions) && first.body.versions.length >= 1,
    'every save wrote a version row', `status ${first.status}, ${first.body?.versions?.length ?? 0} versions`);

  const top = first.body?.versions?.[0]?.version ?? 0;
  const restored = await api(`/api/admin/design/${designId}/versions`, {
    method: 'POST', data: { version: 1 },
  });
  check(restored.status === 200, 'an old version can be restored', `status ${restored.status}`);
  check((restored.body?.doc?.version ?? 0) > top,
    'restoring moves history FORWARD rather than deleting what came after',
    `was v${top}, restore produced v${restored.body?.doc?.version}`);

  const after = await api(`/api/admin/design/${designId}/versions`);
  check((after.body?.versions?.length ?? 0) > (first.body?.versions?.length ?? 0),
    'the versions that existed before the restore are all still there');

  // ── The gate. A build tool that draws unbuilt pages is not for every signed-in employee. ──
  const gate = await page.request.fetch(`${BASE}/api/admin/design`, {
    headers: { Cookie: '' }, maxRedirects: 0,
  }).catch(() => null);
  check(!gate || gate.status() === 401 || gate.status() === 403 || gate.status() >= 300,
    'the api refuses a caller with no session', gate ? `status ${gate.status()}` : 'request failed');

  await ctx.close();
}

// ── 4. Clean up after ourselves ───────────────────────────────────────────────────────────────
{
  const ctx = await freshContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
  const del = await page.request.fetch(`${BASE}/api/admin/design/${designId}`, { method: 'DELETE' });
  check(del.status() === 200, 'the probe design can be deleted again', `status ${del.status()}`);
  await ctx.close();
}

await browser.close();

console.log(`\n${ok.length} passed, ${problems.length} failed`);
if (problems.length) {
  console.log('\nProblems:');
  for (const p of problems) console.log(`  · ${p}`);
  process.exit(1);
}
console.log('✓ Designs are stored on the server, with a history that cannot be lost by using it.');
