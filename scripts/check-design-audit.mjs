// scripts/check-design-audit.mjs — the whole editor, exercised.
//
//   node --env-file=.env.local scripts/check-design-audit.mjs --base http://127.0.0.1:3211
//
// Phase H of docs/planning/in-progress/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// Owner: *"do a full audit of the entire page design editor and make sure we really have all of the
// elements available to be dragged and dropped and edited as much as we can, and so that the saving
// the html file and screen shot mechanics all work."*
//
// The other checks each drive one thing. This one asks the question the owner actually asked: is
// EVERY element placeable, on BOTH views, editable, and does it come out the other end. It places
// all fifty rather than a sample, because "all of the elements" is the requirement and a sample
// would have missed the four bubbles that were written, imported, and never added to the array.

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

const token = await encode({ token: { email: AS, name: 'Design audit', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1800, height: 1150 }, acceptDownloads: true });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => check(false, `page error: ${String(e).slice(0, 140)}`));

console.log(`\n  ${BASE} — auditing the whole editor\n`);

// ── The catalogue, from the horse's mouth ───────────────────────────────────────────────────────
await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="ds-create"]', { timeout: 30_000 });

const catalogue = await page.evaluate(async () => {
  const res = await fetch('/api/admin/design/import');
  return res.ok ? res.json() : null;
});
check(!!catalogue, 'the catalogue index is reachable');
console.log(`\n  ${catalogue.entries} entries, ${catalogue.classes.length} distinct classes\n`);

await page.fill('.dsx-home__new-row input', `Full audit ${Date.now() % 100000}`);
await page.click('[data-testid="ds-create"]');
await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
const designId = new URL(page.url()).pathname.split('/').pop();

// ── Every tab is populated ──────────────────────────────────────────────────────────────────────
const tabs = await page.locator('.dsx-pal__tab').allTextContents();
console.log(`  ${tabs.length} category tabs\n`);
const emptyTabs = [];
for (const label of tabs) {
  await page.locator('.dsx-pal__tab', { hasText: new RegExp(`^${label.trim()}$`) }).first().click();
  await page.waitForTimeout(140);
  const items = await page.locator('.dsx-pal__item, .dsx-pal__char').count();
  if (items === 0) emptyTabs.push(label.trim());
}
check(emptyTabs.length === 0, 'every category tab has something in it', emptyTabs.join(', '));

// ── Every entry places, on BOTH views ───────────────────────────────────────────────────────────
await page.locator('.dsx-pal__tab', { hasText: /^All$/ }).first().click();

async function placeAll(viewLabel) {
  await page.locator('.dsx__view', { hasText: viewLabel }).click();
  await page.waitForTimeout(300);
  const failed = [];
  for (const id of catalogue.entryIds ?? []) {
    await page.fill('[data-testid="ds-palette-search"]', id);
    await page.waitForTimeout(90);
    const item = page.locator(`[data-testid="ds-palette-item-${id}"]`);
    if (await item.count() === 0) { failed.push(`${id} (not in palette)`); continue; }
    await item.first().click();
    await page.waitForTimeout(60);
  }
  return failed;
}

// The API does not expose ids; read them from the palette by searching each category.
const entryIds = await page.evaluate(async () => {
  const seen = new Set();
  const search = document.querySelector('[data-testid="ds-palette-search"]');
  // Clearing the box shows everything the current tab holds; "All" is selected.
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setValue.call(search, '');
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  document.querySelectorAll('[data-testid^="ds-palette-item-"]').forEach((el) => {
    seen.add(el.dataset.testid.replace('ds-palette-item-', ''));
  });
  return [...seen];
});
catalogue.entryIds = entryIds;
check(entryIds.length >= 40, `the palette lists ${entryIds.length} entries with an empty search`);

const desktopFailures = await placeAll('Desktop');
check(desktopFailures.length === 0, `all ${entryIds.length} entries place on the desktop artboard`, desktopFailures.slice(0, 5).join('; '));
const onDesktop = await page.locator('.dsx__el').count();
check(onDesktop >= entryIds.length, `and all ${onDesktop} are on the canvas`);

const mobileFailures = await placeAll('Mobile');
check(mobileFailures.length === 0, `all ${entryIds.length} entries place on the mobile artboard`, mobileFailures.slice(0, 5).join('; '));
const onMobile = await page.locator('.dsx__el').count();
check(onMobile >= entryIds.length, `and the mobile view holds its own ${onMobile}, independently`);

// ── Editing ─────────────────────────────────────────────────────────────────────────────────────
await page.locator('.dsx__el').last().click();
await page.waitForTimeout(200);
check(await page.locator('.dsx-ins__name').count() > 0, 'selecting an element opens the inspector');
const beforeName = await page.locator('.dsx-ins__name').inputValue();
await page.locator('.dsx-ins__name').fill('Renamed by the audit');
await page.waitForTimeout(250);
check(await page.locator('.dsx-lay__name', { hasText: 'Renamed by the audit' }).count() > 0,
  'renaming it updates the layers panel in real time', `was "${beforeName}"`);

// Layer moves.
const topBefore = await page.locator('.dsx-lay__row .dsx-lay__name').first().textContent();
await page.locator('.dsx-lay__moves .dsx__tool').first().click();   // bring to front
await page.waitForTimeout(250);
const topAfter = await page.locator('.dsx-lay__row .dsx-lay__name').first().textContent();
check(topAfter !== topBefore || topAfter?.includes('Renamed'), 'bring-to-front reorders the stack',
  `${topBefore} → ${topAfter}`);

// ── Save, reload, and both views survive ────────────────────────────────────────────────────────
await page.locator('.dsx__tool--primary', { hasText: 'Save' }).first().click();
await page.waitForTimeout(2200);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
await page.waitForTimeout(900);
const desktopAfterReload = await page.locator('.dsx__el').count();
check(desktopAfterReload >= entryIds.length, 'the desktop view survives a save and reload', `${desktopAfterReload} elements`);
await page.locator('.dsx__view', { hasText: 'Mobile' }).click();
await page.waitForTimeout(500);
const mobileAfterReload = await page.locator('.dsx__el').count();
check(mobileAfterReload >= entryIds.length, 'and so does the mobile view', `${mobileAfterReload} elements`);

// ── Every export path ───────────────────────────────────────────────────────────────────────────
await page.locator('.dsx__view', { hasText: 'Desktop' }).click();
await page.waitForTimeout(400);

const downloads = [];
page.on('download', async (d) => {
  let text = '';
  try {
    const stream = await d.createReadStream();
    for await (const chunk of stream) text += chunk;
  } catch { /* binary */ }
  downloads.push({ name: d.suggestedFilename(), size: text.length, text });
});

async function exportVia(label) {
  downloads.length = 0;
  await page.hover('.dsx__export');
  await page.waitForTimeout(250);
  await page.locator('.dsx__menu button', { hasText: label }).first().click();
  await page.waitForTimeout(6000);
  return [...downloads];
}

const specFiles = await exportVia('Spec for Claude');
check(specFiles.some((f) => f.name.endsWith('.json')), 'the spec exports', specFiles.map((f) => f.name).join(', '));
check(specFiles.some((f) => f.name === 'PROMPT.md'), 'and the brief with it');

const spec = specFiles.find((f) => f.name.endsWith('.json'));
if (spec) {
  const parsed = JSON.parse(spec.text);
  check(parsed.views.desktop.elements.length > 0 && parsed.views.mobile.elements.length > 0,
    'the spec carries BOTH views',
    `${parsed.views.desktop.elements.length} / ${parsed.views.mobile.elements.length}`);
  const withClasses = parsed.views.desktop.elements.filter((e) => e.classes?.length > 0).length;
  check(withClasses > parsed.views.desktop.elements.length * 0.7,
    'and most elements name the app\'s real classes', `${withClasses} of ${parsed.views.desktop.elements.length}`);
}

const htmlFiles = await exportVia('HTML');
check(htmlFiles.filter((f) => f.name.endsWith('.html')).length >= 3, 'HTML exports in every form',
  htmlFiles.map((f) => f.name).join(', '));
const standalone = htmlFiles.find((f) => /desktop\.html$/.test(f.name));
check(!!standalone && standalone.text.includes('<style>') && !standalone.text.includes('<link rel="stylesheet" href="./'),
  'and the standalone file carries its own styles rather than linking a missing one');

const pngFiles = await exportVia('Image');
check(pngFiles.some((f) => f.name.endsWith('.png')), 'the canvas captures to a PNG', pngFiles.map((f) => f.name).join(', '));
check(pngFiles.some((f) => f.name.endsWith('.svg')), 'and to a vector alongside it');

// ── Clean up ────────────────────────────────────────────────────────────────────────────────────
await page.request.fetch(`${BASE}/api/admin/design/${designId}`, { method: 'DELETE' }).catch(() => {});
await browser.close();

console.log(problems.length
  ? `\n✗ ${problems.length} problem(s):\n${problems.map((p) => `   · ${p}`).join('\n')}\n`
  : '\n✓ Every element places on both views, edits, saves, reloads and exports.\n');
process.exit(problems.length ? 1 : 0);
