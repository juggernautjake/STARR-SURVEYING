// scripts/check-design-themes.mjs — does a theme actually reach the elements, and the export?
//
//   node --env-file=.env.local scripts/check-design-themes.mjs --base http://127.0.0.1:3211
//
// Phases T, P and V of docs/planning/completed/DESIGN_THEMES_2026-08-23.md.
//
// The colour maths is unit-tested. What those tests cannot see is the claim the whole design rests
// on: that setting CSS custom properties on the artboard re-paints the app's real elements inside
// it. That is either true in a browser or the entire approach is wrong, and it cannot be asserted
// any other way — so it is measured on a real element's computed style, before and after.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = (arg('--base') ?? 'http://127.0.0.1:3211').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const problems = [];
const check = (c, d, x) => { console.log(`  ${c ? '✓' : '✗'} ${d}${!c && x ? ` — ${x}` : ''}`); if (!c) problems.push(d); };

const token = await encode({ token: { email: AS, name: 'Theme check', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1750, height: 1150 }, acceptDownloads: true });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => check(false, `page error: ${String(e).slice(0, 140)}`));

console.log(`\n  ${BASE} — themes, palettes and comparing versions\n`);

await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="ds-create"]', { timeout: 30_000 });
const name = `Theme probe ${Date.now() % 100000}`;
await page.fill('.dsx-home__new-row input', name);
await page.locator('.dsx-home__new-row input').nth(1).fill('/admin/jobs');
await page.click('[data-testid="ds-create"]');
await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
const designId = new URL(page.url()).pathname.split('/').pop();

// A card and a button: two elements whose colours come from different token families.
for (const id of ['card.basic', 'button.admin', 'text.page-title']) {
  await page.fill('[data-testid="ds-palette-search"]', id);
  await page.waitForTimeout(200);
  const item = page.locator(`[data-testid="ds-palette-item-${id}"]`);
  if (await item.count()) { await item.first().click(); await page.waitForTimeout(150); }
}

/** The computed colours of the real elements on the artboard. */
const colours = () => page.evaluate(() => {
  const out = {};
  document.querySelectorAll('.dsx__el .dsx__el-inner > *').forEach((el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/)[0];
    if (!cls) return;
    const s = getComputedStyle(el);
    out[cls] = { background: s.backgroundColor, color: s.color, border: s.borderTopColor };
  });
  const art = getComputedStyle(document.querySelector('.dsx__artboard'));
  out['_artboard'] = { background: art.backgroundColor };
  return out;
});

const before = await colours();
check(Object.keys(before).length >= 3, 'the test elements rendered', Object.keys(before).join(', '));

// ── Applying a theme ────────────────────────────────────────────────────────────────────────────
await page.locator('.dsx__foot .dsx__tool', { hasText: /Theme/ }).click();
await page.waitForSelector('.dsx-theme', { timeout: 10_000 });
check(true, 'the theme panel opens');

const presets = await page.locator('.dsx-theme__preset').count();
check(presets >= 5, `it offers starting points (${presets})`);

await page.locator('.dsx-theme__preset', { hasText: 'Slate dark' }).click();
await page.waitForTimeout(600);

const after = await colours();

// THE claim: the app's real elements re-paint because they already read these variables.
const cardChanged = before['admin-card']?.background !== after['admin-card']?.background;
check(cardChanged, 'a catalogued card re-paints under the theme',
  `${before['admin-card']?.background} → ${after['admin-card']?.background}`);

const textChanged = before['job-detail__name']?.color !== after['job-detail__name']?.color;
check(textChanged, 'and so does a catalogued heading, from a different token family',
  `${before['job-detail__name']?.color} → ${after['job-detail__name']?.color}`);

check(before._artboard.background !== after._artboard.background, 'and the page surface itself');

// ── Generating one from a colour ────────────────────────────────────────────────────────────────
await page.locator('.dsx-theme__field input[type="color"]').first().evaluate((el) => {
  el.value = '#B91C6B';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
const swatches = await page.locator('.dsx-theme__swatch').count();
check(swatches >= 6, `a palette previews before it is applied (${swatches} swatches)`);

await page.locator('.dsx-theme__builder button', { hasText: 'Apply' }).click();
await page.waitForTimeout(700);
const generated = await colours();
check(generated['admin-card']?.background !== after['admin-card']?.background,
  'generating a theme from a colour re-paints everything again');

// The guard: whatever it generated must be readable.
const unreadable = await page.locator('.dsx-theme__problems li').count();
check(unreadable === 0, 'and the generated theme has no unreadable pairs',
  `${unreadable} reported`);

// ── It survives a save, and reaches the export ─────────────────────────────────────────────────
await page.locator('.dsx__tool--primary', { hasText: 'Save' }).first().click();
await page.waitForTimeout(1800);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
await page.waitForTimeout(900);
const reloaded = await colours();
check(reloaded['admin-card']?.background === generated['admin-card']?.background,
  'the theme survives a save and a reload',
  `${generated['admin-card']?.background} vs ${reloaded['admin-card']?.background}`);

const downloads = [];
page.on('download', async (d) => {
  let text = '';
  try { const s = await d.createReadStream(); for await (const c of s) text += c; } catch { /* binary */ }
  downloads.push({ name: d.suggestedFilename(), text });
});
await page.hover('.dsx__export');
await page.waitForTimeout(250);
await page.locator('.dsx__menu button', { hasText: 'HTML' }).first().click();
await page.waitForTimeout(3500);
const html = downloads.find((d) => /desktop\.html$/.test(d.name));
check(!!html && /--theme-bg-surface:/.test(html.text),
  'and the exported HTML carries it, so the file matches the canvas',
  html ? '(no theme block in the file)' : '(no html downloaded)');

// ── Comparing versions ──────────────────────────────────────────────────────────────────────────
// A second version of the same page, so there is something to compare.
await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.dsx-home__card', { timeout: 20_000 });
await page.locator('.dsx-home__card', { hasText: name }).locator('button[title*="Duplicate"]').click();
await page.waitForTimeout(2500);

await page.goto(`${BASE}/admin/design/compare?route=/admin/jobs`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const columns = await page.locator('.dsx-compare__col').count();
check(columns >= 2, `the compare board shows every version side by side (${columns})`);

const rendered = await page.locator('.dsx-compare__col .dsx__el').count();
check(rendered > 0, 'and each preview renders the real elements, not a stored picture', `${rendered} elements`);

// One theme across all of them — the reason versions and themes are one feature.
await page.locator('.dsx-compare__field select').last().selectOption({ label: 'All in Ocean' });
await page.waitForTimeout(700);
const themedAll = await page.evaluate(() =>
  [...document.querySelectorAll('.dsx-compare__board-art')].map((el) => getComputedStyle(el).backgroundColor));
check(themedAll.length >= 2 && new Set(themedAll).size === 1,
  'and one theme can be applied across every version at once', themedAll.join(' / '));

await page.request.fetch(`${BASE}/api/admin/design/${designId}`, { method: 'DELETE' }).catch(() => {});
await browser.close();

console.log(problems.length
  ? `\n✗ ${problems.length} problem(s):\n${problems.map((p) => `   · ${p}`).join('\n')}\n`
  : '\n✓ Themes reach the real elements, survive a save, reach the export, and compare across versions.\n');
process.exit(problems.length ? 1 : 0);
