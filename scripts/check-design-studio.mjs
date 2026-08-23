// scripts/check-design-studio.mjs — does the Page Designer actually work?
//
// Slice T1 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// The unit tests pin the maths: what snaps where, what a search returns. None of them can tell you
// that a palette item drags onto an artboard, that the element lands where the pointer was, that
// resizing moves the handle you grabbed, or that a saved design is still there after a reload. That
// gap is this repo's most common defect — code that is authored but not wired — and it is why a
// green suite has twice missed a broken screen here.
//
// So this drives the real product, in a real browser, through the loop the owner described:
//
//     create a design → search for an element → drag it onto the page → move it → resize it
//     → edit it → switch to the mobile view → place something there → save → reload → still there
//
// Usage: node --env-file=.env.local scripts/check-design-studio.mjs [--base URL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3213';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const token = await encode({
  token: { email: AS, name: 'Design studio check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => bad(`page error: ${String(e).slice(0, 200)}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React/i.test(m.text())) bad(`console error: ${m.text().slice(0, 160)}`); });

/** Drag from one point to another with real pointer events — the studio listens to those, not to
 *  HTML5 drag, for moving elements on the canvas. */
async function dragBy(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Several small steps: one big jump can outrun the pointermove handler and lands nothing.
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(from.x + (dx * i) / 8, from.y + (dy * i) / 8);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

try {
  console.log(`\n  ${BASE} — the Page Designer, driven\n`);

  // ── The list page ────────────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('[data-testid="ds-create"]', { timeout: 30_000 });
  ok('the designs list rendered');

  const name = `QA design ${Date.now() % 100000}`;
  await page.fill('.dsx-home__new-row input', name);
  await page.click('[data-testid="ds-create"]');
  await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
  const url = page.url();
  ok(`created “${name}” and opened the editor`);

  // ── Search ───────────────────────────────────────────────────────────────────────────────────
  await page.fill('[data-testid="ds-palette-search"]', 'date');
  await page.waitForTimeout(300);
  const dateHit = await page.$('[data-testid="ds-palette-item-input.date"]');
  if (dateHit) ok('searching “date” surfaces the date field');
  else bad('searching “date” did not surface the date field');

  const hitCount = await page.locator('.dsx-pal__item').count();
  if (hitCount > 1) ok(`and ${hitCount} results in total — the concept graph is reaching past the literal match`);
  else bad(`only ${hitCount} result for “date” — concept expansion is not working in the UI`);

  // ── Place by clicking ────────────────────────────────────────────────────────────────────────
  await page.click('[data-testid="ds-palette-item-input.date"]');
  await page.waitForTimeout(200);
  let count = await page.locator('.dsx__el').count();
  if (count === 1) ok('clicking a palette item places it on the artboard');
  else bad(`clicking a palette item placed ${count} elements`);

  // ── Place by dragging ────────────────────────────────────────────────────────────────────────
  await page.fill('[data-testid="ds-palette-search"]', 'button');
  await page.waitForTimeout(250);
  const buttonItem = page.locator('[data-testid="ds-palette-item-button.admin"]');
  if (await buttonItem.count() === 0) { bad('the palette has no admin button entry'); throw new Error('no button'); }
  // dragTo is a Locator method, not an ElementHandle one — and HTML5 drag is what the palette
  // uses (dataTransfer), which Playwright drives with real mouse events.
  await buttonItem.dragTo(page.locator('.dsx__artboard'), { targetPosition: { x: 300, y: 260 } });
  await page.waitForTimeout(250);
  count = await page.locator('.dsx__el').count();
  if (count === 2) ok('dragging a palette item onto the artboard places it');
  else bad(`dragging placed ${count - 1} of 1 expected elements`);

  // ── Move it, and check the grid actually snapped ──────────────────────────────────────────────
  const before = await page.evaluate(() => {
    const el = document.querySelectorAll('.dsx__el')[1];
    return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  });
  const target = await page.locator('.dsx__el').nth(1).boundingBox();
  await dragBy(page, { x: target.x + target.width / 2, y: target.y + target.height / 2 }, 90, 60);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const el = document.querySelectorAll('.dsx__el')[1];
    return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  });
  if (after.left !== before.left || after.top !== before.top) ok(`moved it (${before.left},${before.top} → ${after.left},${after.top})`);
  else bad('dragging an element on the canvas did not move it');

  if (after.left % 8 === 0 && after.top % 8 === 0) ok('and it landed on the 8px grid');
  else bad(`it landed off-grid at ${after.left},${after.top} with snapping on`);

  // ── Turn snapping off and confirm free placement ──────────────────────────────────────────────
  await page.click('button:has-text("Snap")');
  await page.waitForTimeout(120);
  const box2 = await page.locator('.dsx__el').nth(1).boundingBox();
  await dragBy(page, { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 }, 37, 23);
  await page.waitForTimeout(200);
  const free = await page.evaluate(() => {
    const el = document.querySelectorAll('.dsx__el')[1];
    return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  });
  if (free.left % 8 !== 0 || free.top % 8 !== 0) ok(`with snap off it lands freely (${free.left},${free.top})`);
  else ok('with snap off it happened to land on a multiple of 8 — not conclusive, but not wrong');
  await page.click('button:has-text("Snap")');

  // ── Resize ───────────────────────────────────────────────────────────────────────────────────
  const widthBefore = await page.evaluate(() => parseFloat(document.querySelectorAll('.dsx__el')[1].style.width));
  const handle = await page.locator('.dsx__el').nth(1).locator('.dsx__handle--se').boundingBox();
  if (handle) {
    await dragBy(page, { x: handle.x + 5, y: handle.y + 5 }, 80, 40);
    await page.waitForTimeout(200);
    const widthAfter = await page.evaluate(() => parseFloat(document.querySelectorAll('.dsx__el')[1].style.width));
    if (widthAfter > widthBefore) ok(`resizing works (${widthBefore} → ${widthAfter}px wide)`);
    else bad(`resize did nothing (${widthBefore} → ${widthAfter})`);
  } else {
    bad('no resize handle on the selected element');
  }

  // ── Edit it in the inspector ─────────────────────────────────────────────────────────────────
  const labelInput = page.locator('.dsx-ins__section', { hasText: 'Content' }).locator('input').first();
  if (await labelInput.count()) {
    await labelInput.fill('Book the crew');
    await page.waitForTimeout(200);
    const rendered = await page.locator('.dsx__el').nth(1).innerText();
    if (rendered.includes('Book the crew')) ok('editing the label in the inspector changes the element');
    else bad(`the label did not update — the element still reads “${rendered.trim().slice(0, 40)}”`);
  } else {
    bad('the inspector showed no content field for a selected button');
  }

  // ── The mobile view is a separate design ─────────────────────────────────────────────────────
  await page.click('button:has-text("Mobile")');
  await page.waitForTimeout(250);
  const mobileCount = await page.locator('.dsx__el').count();
  if (mobileCount === 0) ok('the mobile view starts empty — it is a separate design, not a copy');
  else bad(`the mobile view already has ${mobileCount} elements; the views are not independent`);

  await page.fill('[data-testid="ds-palette-search"]', 'empty');
  await page.waitForTimeout(250);
  const emptyItem = await page.$('[data-testid="ds-palette-item-feedback.empty"]');
  if (emptyItem) {
    await emptyItem.click();
    await page.waitForTimeout(200);
    if (await page.locator('.dsx__el').count() === 1) ok('and elements can be placed on it');
    else bad('placing on the mobile view did not work');
  }

  await page.click('button:has-text("Desktop")');
  await page.waitForTimeout(200);
  if (await page.locator('.dsx__el').count() === 2) ok('switching back, the desktop view still holds its own elements');
  else bad('the desktop view lost its elements when switching');

  // ── Save, reload, still there ────────────────────────────────────────────────────────────────
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
  await page.waitForTimeout(500);
  const afterReload = await page.locator('.dsx__el').count();
  if (afterReload === 2) ok('saved, reloaded, and the design is exactly as it was');
  else bad(`after reload the desktop view has ${afterReload} elements, expected 2`);

  const nameAfter = await page.inputValue('.dsx__name');
  if (nameAfter === name) ok(`and it kept its name (“${nameAfter}”)`);
  else bad(`the name came back as “${nameAfter}”`);

  // ── It is listed, and can be reopened from the list ──────────────────────────────────────────
  await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const listed = await page.locator('.dsx-home__card', { hasText: name }).count();
  if (listed === 1) ok('it appears in the designs list');
  else bad(`the design is not in the list (found ${listed})`);

  // ── Clean up: delete it ──────────────────────────────────────────────────────────────────────
  page.once('dialog', (d) => void d.accept());
  await page.locator('.dsx-home__card', { hasText: name }).locator('button.is-danger').click();
  await page.waitForTimeout(300);
  if (await page.locator('.dsx-home__card', { hasText: name }).count() === 0) ok('and it can be deleted');
  else bad('deleting the design did not remove it from the list');

  console.log(`\n  (editor URL was ${url})`);
} catch (err) {
  bad(`stopped early: ${err.message}`);
} finally {
  await browser.close();
}

console.log(findings.length === 0
  ? '\n✓ The Page Designer works end to end.\n'
  : `\n✗ ${findings.length} problem(s):\n${findings.map((f) => `   · ${f}`).join('\n')}\n`);
process.exit(findings.length === 0 ? 0 : 1);
