// scripts/check-design-drawing.mjs — does the sketch layer actually draw, fill, save and export?
//
//   node --env-file=.env.local scripts/check-design-drawing.mjs --base http://127.0.0.1:3211
//
// Phase D of docs/planning/in-progress/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// The geometry and the flood fill are unit-tested in `__tests__/design/drawing.test.ts`. What those
// cannot see is the half that only exists in a browser: whether a pointer drag reaches the canvas at
// all, whether the drawing survives a save and a reload, and whether it comes out in the PNG. That
// last one matters most — a drawing that is on screen and absent from the export is the worst
// possible outcome, because the file looks finished.

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

const token = await encode({ token: { email: AS, name: 'Drawing check', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => check(false, `page error: ${String(e).slice(0, 120)}`));

console.log(`\n  ${BASE} — the drawing tools, driven\n`);

await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="ds-create"]', { timeout: 30_000 });
await page.fill('.dsx-home__new-row input', `Drawing probe ${Date.now() % 100000}`);
await page.click('[data-testid="ds-create"]');
await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
const designId = new URL(page.url()).pathname.split('/').pop();

// ── The layer is inert until you ask for it ─────────────────────────────────────────────────────
const layer = page.locator('[data-testid="ds-drawing-layer"]');
check(await layer.count() > 0, 'the drawing layer is mounted');
check(await page.locator('.dsx-draw.is-active').count() === 0,
  'and it does NOT take the pointer in select mode — otherwise nothing could ever be selected');

await page.locator('.dsx__mode', { hasText: 'Draw' }).click();
await page.waitForTimeout(300);
check(await page.locator('.dsx-draw.is-active').count() === 1, 'switching to Draw hands it the pointer');
check(await page.locator('.dsx__draw-tools').count() === 1, 'and the drawing tools appear');

const toolCount = await page.locator('.dsx__draw-tool').count();
check(toolCount >= 11, `all the tools are offered (${toolCount})`, `${toolCount} found`);

/** Drag on the artboard in artboard coordinates. */
async function drag(from, to, steps = 10) {
  const box = await page.locator('.dsx__artboard').boundingBox();
  const s = box.width / (await page.evaluate(() => document.querySelector('.dsx__artboard').offsetWidth));
  await page.mouse.move(box.x + from.x * s, box.y + from.y * s);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(box.x + (from.x + (to.x - from.x) * i / steps) * s, box.y + (from.y + (to.y - from.y) * i / steps) * s);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(220);
}

/** How many pixels on the committed canvas are not transparent. */
const inkCount = () => page.evaluate(() => {
  const canvas = document.querySelector('.dsx-draw__canvas');
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 8) n += 1;
  return n;
});

check(await inkCount() === 0, 'the canvas starts empty');

// ── Freehand ────────────────────────────────────────────────────────────────────────────────────
await drag({ x: 80, y: 120 }, { x: 320, y: 240 }, 14);
const afterFreehand = await inkCount();
check(afterFreehand > 100, 'a freehand drag leaves ink', `${afterFreehand} px`);

// ── A closed shape, then the bucket ─────────────────────────────────────────────────────────────
await page.locator('.dsx__draw-tool[aria-label="Rectangle"]').click();
await drag({ x: 420, y: 120 }, { x: 700, y: 320 });
const afterRect = await inkCount();
check(afterRect > afterFreehand, 'dragging out a rectangle draws it', `${afterRect} px`);

await page.locator('.dsx__draw-tool[aria-label="Fill a closed shape"]').click();
// Click INSIDE the rectangle.
const box = await page.locator('.dsx__artboard').boundingBox();
const scale = box.width / (await page.evaluate(() => document.querySelector('.dsx__artboard').offsetWidth));
await page.mouse.click(box.x + 560 * scale, box.y + 220 * scale);
await page.waitForTimeout(500);
const afterFill = await inkCount();
check(afterFill > afterRect + 1000, 'the fill bucket fills the closed rectangle', `${afterRect} → ${afterFill} px`);

// It must NOT have flooded the whole canvas — the rectangle is roughly 280×200 of a 1440×900 board.
const total = await page.evaluate(() => {
  const c = document.querySelector('.dsx-draw__canvas');
  return c.width * c.height;
});
check(afterFill < total * 0.35, 'and it stayed inside the shape rather than flooding the board',
  `${Math.round((afterFill / total) * 100)}% of the canvas`);

// ── Undo ────────────────────────────────────────────────────────────────────────────────────────
await page.locator('.dsx__mode', { hasText: 'Select' }).click();
await page.keyboard.press('Control+z');
await page.waitForTimeout(500);
const afterUndo = await inkCount();
check(afterUndo < afterFill, 'Ctrl+Z undoes the fill', `${afterFill} → ${afterUndo} px`);

// ── Save, reload, still there ───────────────────────────────────────────────────────────────────
await page.locator('.dsx__tool--primary', { hasText: 'Save' }).first().click();
await page.waitForTimeout(1800);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
await page.waitForTimeout(1200);
const afterReload = await inkCount();
check(afterReload > 100, 'the drawing survives a save and a reload', `${afterReload} px`);

// ── And it reaches the export ───────────────────────────────────────────────────────────────────
const downloads = [];
page.on('download', async (d) => {
  let text = '';
  const stream = await d.createReadStream();
  for await (const chunk of stream) text += chunk;
  downloads.push({ name: d.suggestedFilename(), text });
});
await page.hover('.dsx__export');
await page.waitForTimeout(250);
await page.locator('.dsx__menu button', { hasText: 'HTML' }).first().click();
await page.waitForTimeout(3000);
const html = downloads.find((d) => /desktop\.html$/.test(d.name));
check(!!html && /class="ds-sketch"/.test(html.text), 'the exported HTML carries the sketch layer',
  html ? '(no ds-sketch in the file)' : '(no desktop html downloaded)');

downloads.length = 0;
await page.hover('.dsx__export');
await page.waitForTimeout(250);
await page.locator('.dsx__menu button', { hasText: 'Image' }).first().click();
await page.waitForTimeout(4000);
const svg = downloads.find((d) => d.name.endsWith('.svg'));
check(!!svg && /<image /.test(svg.text), 'and the captured image includes it rather than dropping it silently',
  svg ? '(no <image> in the svg)' : '(no svg downloaded)');

await page.request.fetch(`${BASE}/api/admin/design/${designId}`, { method: 'DELETE' }).catch(() => {});
await browser.close();

console.log(problems.length
  ? `\n✗ ${problems.length} problem(s):\n${problems.map((p) => `   · ${p}`).join('\n')}\n`
  : '\n✓ Draw, fill, undo, save, reload, export — all of it.\n');
process.exit(problems.length ? 1 : 0);
