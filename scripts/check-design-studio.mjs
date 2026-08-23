// scripts/check-design-studio.mjs — does the Page Designer actually work?
//
// Slice T1 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
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
import { readFileSync } from 'node:fs';

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
  // Wait for the list, not for a number of milliseconds. A flat 400ms passed against a production
  // build and reported "the design is not in the list (found 0)" against a dev server, where the
  // route still has to compile — a green check that goes red on a slower machine and blames the
  // app for it. Measured: 0 cards at 400ms, 15 at 1500ms, the API answering 200 the whole time.
  await page.waitForSelector('.dsx-home__card', { timeout: 30_000 }).catch(() => {});
  const listed = await page.locator('.dsx-home__card', { hasText: name }).count();
  if (listed === 1) ok('it appears in the designs list');
  else bad(`the design is not in the list (found ${listed})`);

  // ── Undo, which is the feature people miss loudest when it is absent ─────────────────────────
  //
  // Including the property that matters most and is easiest to get wrong: a DRAG is one undo step,
  // not sixty. An editor where Ctrl+Z rewinds a drag one pixel at a time has undo in name only.
  //
  // Back into the editor first. The previous step left the browser on the designs LIST, where
  // Ctrl+Z is correctly a no-op — the first run of this reported "undo changed nothing" and was
  // testing the wrong page.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
  await page.waitForTimeout(600);

  // Do something first. A freshly opened design has an empty history and Ctrl+Z is correctly a
  // no-op — the first version of this test pressed undo on a just-loaded page and reported a bug
  // that was the test's own.
  const beforeUndo = await page.locator('.dsx__el').count();
  await page.fill('[data-testid="ds-palette-search"]', 'rectangle');
  await page.waitForTimeout(250);
  await page.click('[data-testid="ds-palette-item-shape.rectangle"]');
  await page.waitForTimeout(250);
  const afterPlace = await page.locator('.dsx__el').count();
  if (afterPlace !== beforeUndo + 1) bad(`placing before the undo test added ${afterPlace - beforeUndo} elements`);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  const afterUndo = await page.locator('.dsx__el').count();
  if (afterUndo === beforeUndo) ok(`undo works (${afterPlace} → ${afterUndo} elements)`);
  else bad(`Ctrl+Z left ${afterUndo} elements, expected ${beforeUndo}`);

  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(350);
  if (await page.locator('.dsx__el').count() === afterPlace) ok('and redo puts it back');
  else bad('redo did not restore the element');

  // Leave the design as it was found, so the drag test below works on the same two elements.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);

  // One drag, then one undo, and the element must be back where it started.
  const dragBox = await page.locator('.dsx__el').nth(1).boundingBox();
  const posBefore = await page.evaluate(() => {
    const el = document.querySelectorAll('.dsx__el')[1];
    return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  });
  await dragBy(page, { x: dragBox.x + dragBox.width / 2, y: dragBox.y + dragBox.height / 2 }, 120, 80);
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  const posAfter = await page.evaluate(() => {
    const el = document.querySelectorAll('.dsx__el')[1];
    return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  });
  if (posAfter.left === posBefore.left && posAfter.top === posBefore.top) {
    ok('and one drag is ONE undo — the whole move comes back in a single step');
  } else {
    bad(`after one undo the element sits at ${posAfter.left},${posAfter.top}, not back at ${posBefore.left},${posBefore.top}`);
  }

  // ── Export: the handoff, which is the whole point ────────────────────────────────────────────
  //
  // The owner exports these and hands them back for building. If the buttons do nothing, or the
  // spec comes out without the app's real class names in it, the tool has failed at the only job
  // that matters — and nothing in the unit tests would notice.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
  await page.waitForTimeout(500);

  const downloads = [];
  page.on('download', (d) => downloads.push(d));

  const exportVia = async (label) => {
    downloads.length = 0;
    await page.hover('.dsx__export');
    await page.waitForTimeout(250);
    await page.click(`text=${label}`);
    await page.waitForTimeout(2500);
    return downloads.map((d) => d.suggestedFilename());
  };

  const specFiles = await exportVia('Spec for Claude (JSON + brief)');
  if (specFiles.length >= 2) ok(`the spec exports (${specFiles.join(', ')})`);
  else bad(`exporting the spec produced ${specFiles.length} file(s), expected 2`);

  const specDownload = downloads.find((d) => d.suggestedFilename().endsWith('.json'));
  if (specDownload) {
    const spec = JSON.parse(readFileSync(await specDownload.path(), 'utf8'));
    const desktop = spec.views?.desktop?.elements ?? [];
    if (desktop.length) ok(`the spec lists ${desktop.length} desktop element(s)`);
    else bad('the spec has no desktop elements in it');

    const named = desktop.filter((e) => e.classes?.length);
    if (named.length) ok(`and ${named.length} name the app's real classes — e.g. .${named[0].classes[0]}`);
    else bad('no element in the spec names a real class; the export cannot say what to build with');

    if (spec.views?.mobile) ok('and both views are in the one file');
    else bad('the spec is missing the mobile view');
  }

  const htmlFiles = await exportVia('HTML + CSS files');
  const htmlCount = htmlFiles.filter((f) => f.endsWith('.html')).length;
  const cssCount = htmlFiles.filter((f) => f.endsWith('.css')).length;
  if (htmlCount >= 2 && cssCount >= 1) ok(`HTML exports (${htmlCount} html + ${cssCount} css)`);
  else bad(`HTML export produced ${htmlCount} html and ${cssCount} css files`);

  const pngFiles = await exportVia('Image (PNG) of this view');
  if (pngFiles.some((f) => f.endsWith('.png'))) ok('and the canvas captures to a PNG');
  else bad('the PNG export produced nothing — the capture is failing');

  // ── The contract checks, and dismissing one (§10, Q1–Q3) ─────────────────────────────────────
  //
  // The rule being verified is that a dismissal is a DECISION, not a mute button: it needs a
  // reason, it survives a save, and the reason reaches the exported brief. A checker whose
  // dismissals evaporate is one nobody uses twice.
  await page.locator('[data-testid="ds-palette-search"]').fill('button.admin');
  await page.waitForTimeout(250);
  await page.locator('[data-testid="ds-palette-item-button.admin"]').first().click();
  await page.waitForTimeout(200);
  const badId = await page.locator('.dsx__el').last().getAttribute('data-testid');
  await page.locator(`[data-testid="${badId}"]`).click();
  await page.waitForTimeout(150);

  const heightField = page.locator('.dsx-ins__cell', { hasText: 'H' }).locator('input').first();
  if (await heightField.count()) {
    await heightField.fill('24');
    await heightField.blur();
    await page.waitForTimeout(350);
  }

  const warnBadge = page.locator('.dsx__foot .dsx__tool--warn');
  if (await warnBadge.count()) ok('a control under the tap floor is reported in the footer');
  else bad('shrinking a button below 40px produced no contract finding');

  await page.locator('.dsx__foot .dsx__tool', { hasText: /to fix|Checks/ }).click();
  await page.waitForSelector('.dsx__checks');
  const finding = await page.locator('.dsx__check--must .dsx__check-msg').first().textContent().catch(() => '');
  if (/40px/.test(finding ?? '')) ok('and it quotes the shared threshold from contract.json');
  else bad(`the finding did not name the 40px rule — "${finding}"`);

  await page.locator('.dsx__check .dsx__tool', { hasText: 'Not a problem' }).first().click();
  await page.locator('.dsx__check-why input').fill('the icon sits inside a 48px hit area');
  await page.locator('.dsx__check-why button', { hasText: 'Save' }).click();
  await page.waitForTimeout(350);
  if (await page.locator('.dsx__check--answered').count() === 1) ok('a finding can be dismissed, with a reason');
  else bad('dismissing the finding did not move it to the answered list');

  await page.locator('.dsx__tool--primary', { hasText: 'Save' }).first().click();
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dsx__artboard');
  await page.locator('.dsx__foot .dsx__tool', { hasText: /to fix|Checks/ }).click();
  await page.waitForSelector('.dsx__checks');
  const keptReason = await page.locator('.dsx__check-reason').first().textContent().catch(() => '');
  if (/48px hit area/.test(keptReason ?? '')) ok('and the dismissal survives a save and a reload');
  else bad('the dismissal did not survive a reload — it has to live in the saved document');

  const briefFiles = await exportVia('Spec for Claude (JSON + brief)');
  if (briefFiles.includes('PROMPT.md')) ok('the brief still exports with the decision in it');
  else bad('PROMPT.md did not export after dismissing a finding');

  await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // ── Clean up: delete it ──────────────────────────────────────────────────────────────────────
  page.once('dialog', (d) => void d.accept());
  await page.locator('.dsx-home__card', { hasText: name }).locator('button.is-danger').click();
  // Deleting now refreshes TWO data sources — the designs list and the page walkthrough, which
  // shows each route's designs — so the row does not disappear within 300ms any more. Waiting for
  // the row to go rather than for a fixed time is right regardless of how many fetches it grows to.
  const gone = await page.locator('.dsx-home__card', { hasText: name })
    .waitFor({ state: 'detached', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (gone) ok('and it can be deleted');
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
