// scripts/check-document-viewer.mjs — is the whole page really on screen?
//
//   npm run build && npx next start -p 3016 -H 127.0.0.1
//   node --env-file=.env.local scripts/check-document-viewer.mjs http://127.0.0.1:3016 <projectId>
//
// Owner: *"the default view should show the full image/page each time the user opens a image/file
// or clicks between pages."*
//
// ── WHAT ONLY A BROWSER CAN ANSWER ──────────────────────────────────────────────────────────────
//
// `viewer-fit.ts` is tested against numbers, and `SourceDocumentViewer` is tested for calling it.
// Neither answers the owner's actual question, which is geometric: after the viewer opens, is the
// whole page inside the container? Every assertion here reads `getBoundingClientRect` on the real
// image after the real transform, against a real county scan.
//
// Each one carries its control. The most important is the one that measures what the OLD default
// would have done to THIS page — without it, "the page fits" is also true of a viewer that was
// never broken, and the check proves nothing about the fix.
//
// ── PICK A PROJECT ON STAGE 1; DO NOT MOVE ONE THERE ────────────────────────────────────────────
//
// `DocumentUploadPanel` — the surface that mounts the viewer — is on the Property Information
// stage. Pointing this at a project on stage 2 finds zero rows, and the obvious repair is to click
// "Back to Property Information". **Do not.** That opens a "Revert workflow step?" confirmation and
// moves a real project backwards. An audit that changes what it is auditing is not an audit. Query
// for `status = 'upload'` and pass that id.
//
// Otherwise read-only: it opens the viewer, turns pages, rotates, zooms and toggles the shortcut
// list. All of that is view state; nothing is written.
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3016';
// A project with 17 documents that is ON STAGE 1 — see the header. Override with argv[3].
const PROJECT = process.argv[3] ?? '6588a845-faf4-4f47-9e60-5011ea000a54';
fs.mkdirSync('_qa', { recursive: true });

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
const token = await encode({
  token: { email: 'jacobmaddux@starr-surveying.com', name: 'Viewer QA', sub: 'jacobmaddux@starr-surveying.com' },
  secret, salt: 'authjs.session-token', maxAge: 3600,
});

let fails = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  → ${JSON.stringify(detail)}`}`);
  if (!ok) fails++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/admin/research/${PROJECT}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// ── THE PROJECT HAS TO BE ON STAGE 1 ALREADY, AND THAT IS NOT A DETAIL ────────────────────────
//
// `DocumentUploadPanel` — the surface that mounts `SourceDocumentViewer` — lives on the PROPERTY
// INFORMATION stage. The first run of this pointed at a project sitting on stage 2 and found zero
// rows on a project holding 35 documents.
//
// The obvious fix was to click "Back to Property Information". **Do not.** That opens a "Revert
// workflow step?" confirmation and MOVES A REAL PROJECT BACKWARDS. An audit that changes the thing
// it is auditing is not an audit — the same rule this repository already writes down for
// Approve/Demote/Ban on the employee screens. So the project is chosen for the state it is in.
//
// The documents accordion may be collapsed.
const toggle = page.locator('.research-upload__docs-toggle, [class*="doc"][class*="toggle"]').first();
if (await toggle.count() > 0) { await toggle.click().catch(() => {}); await page.waitForTimeout(900); }

const viewButtons = page.locator('.research-upload__doc-view');
const n = await viewButtons.count();
check('CONTROL: the project page rendered document rows with a view button', n > 0, { viewButtons: n });
if (n === 0) {
  await page.screenshot({ path: '_qa/viewer-noRows.png', fullPage: true });
  console.log('\nno document rows — cannot proceed');
  await browser.close();
  process.exit(1);
}

/** Geometry of the image vs its container, read from the live DOM. */
async function geometry() {
  return page.evaluate(() => {
    const c = document.querySelector('.research-viewer__img-container');
    const img = c?.querySelector('img');
    if (!c || !img) return null;
    const cr = c.getBoundingClientRect();
    const ir = img.getBoundingClientRect();   // post-transform: what is actually on screen
    return {
      container: { w: Math.round(cr.width), h: Math.round(cr.height) },
      drawn: { w: Math.round(ir.width), h: Math.round(ir.height) },
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      // 2px of slack for sub-pixel layout.
      insideW: ir.width <= cr.width + 2,
      insideH: ir.height <= cr.height + 2,
      zoomLabel: document.querySelector('.research-viewer__img-zoom-info')?.textContent?.trim() ?? '',
    };
  });
}

// ── open the first document that is an IMAGE, which is what the fit is about ──────────────────
let opened = false;
for (let i = 0; i < Math.min(n, 12) && !opened; i++) {
  await viewButtons.nth(i).click();
  await page.waitForTimeout(1800);
  if (await page.locator('.research-viewer__img-container img').count() > 0) { opened = true; break; }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
check('an image document opened in the viewer', opened);
if (!opened) { await browser.close(); process.exit(1); }

await page.waitForTimeout(1200);
const onOpen = await geometry();
await page.screenshot({ path: '_qa/viewer-open.png' });
check('CONTROL: the image is real and was measured', !!onOpen && onOpen.natural.w > 0, onOpen);

// ── THE BUG THE OWNER REPORTED ─────────────────────────────────────────────────────────────────
check('on open, the WHOLE page is inside the container', !!onOpen && onOpen.insideW && onOpen.insideH, onOpen);
check('and the zoom readout says it is at fit', (onOpen?.zoomLabel ?? '').includes('fit'), onOpen?.zoomLabel);

// CONTROL: would this have caught the old behaviour? At zoom 1 a portrait scan overflows.
const wouldHaveFailed = await page.evaluate(() => {
  const c = document.querySelector('.research-viewer__img-container');
  const img = c.querySelector('img');
  const laidOutW = Math.min(c.clientWidth, img.naturalWidth);
  const laidOutH = laidOutW * (img.naturalHeight / img.naturalWidth);
  return { laidOutH, containerH: c.clientHeight, overflowsAtZoom1: laidOutH > c.clientHeight + 2 };
});
check('CONTROL: at the OLD default of zoom 1 this same page overflowed', wouldHaveFailed.overflowsAtZoom1, wouldHaveFailed);

// ── the page change, which is the half the owner described ─────────────────────────────────────
const nextBtn = page.locator('.research-viewer__img-toolbar-left button', { hasText: 'Next' });
if (await nextBtn.count() > 0 && await nextBtn.isEnabled()) {
  await nextBtn.click();
  await page.waitForTimeout(1500);
  const afterNext = await geometry();
  check('after clicking to the next page, it is fitted again',
    !!afterNext && afterNext.insideW && afterNext.insideH, afterNext);
  check('and the readout still says fit', (afterNext?.zoomLabel ?? '').includes('fit'), afterNext?.zoomLabel);
} else {
  console.log('SKIP  next-page (single-page document)');
}

// ── rotate ─────────────────────────────────────────────────────────────────────────────────────
const rotateBtn = page.locator('.research-viewer__img-toolbar-right button[title*="Rotate right"]');
check('the viewer has a rotate control', await rotateBtn.count() > 0);
if (await rotateBtn.count() > 0) {
  await rotateBtn.click();
  await page.waitForTimeout(900);
  const rotated = await geometry();
  await page.screenshot({ path: '_qa/viewer-rotated.png' });
  check('after a quarter turn the page is STILL inside the container',
    !!rotated && rotated.insideW && rotated.insideH, rotated);
  const angle = await page.locator('.research-viewer__img-zoom-info', { hasText: '°' }).innerText().catch(() => '');
  check('and the angle is shown', angle.includes('90'), angle);

  // CONTROL: without re-fitting, a turn at the previous scale would have overflowed — or not, and
  // saying which is the honest reading for THIS image.
  const wouldOverflow = await page.evaluate(() => {
    const c = document.querySelector('.research-viewer__img-container');
    const img = c.querySelector('img');
    const laidOutW = Math.min(c.clientWidth, img.naturalWidth);
    const laidOutH = laidOutW * (img.naturalHeight / img.naturalWidth);
    const flatFit = Math.min(c.clientWidth / laidOutW, c.clientHeight / laidOutH, 1);
    return { turnedW: laidOutH * flatFit, turnedH: laidOutW * flatFit, cw: c.clientWidth, ch: c.clientHeight };
  });
  console.log(`      note: at the flat fit, turned, this page would be ${Math.round(wouldOverflow.turnedW)}×${Math.round(wouldOverflow.turnedH)} in ${wouldOverflow.cw}×${wouldOverflow.ch}`);

  await rotateBtn.click(); await rotateBtn.click(); await rotateBtn.click(); // back to 0
  await page.waitForTimeout(700);
}

// ── the rest of the controls ───────────────────────────────────────────────────────────────────
const dl = page.locator('.research-viewer__img-download');
check('there is a download link', await dl.count() > 0);
const dlAttrs = await dl.first().evaluate((a) => ({ download: a.getAttribute('download'), href: (a.getAttribute('href') || '').slice(0, 40) })).catch(() => null);
check('with a real filename, not the storage key', !!dlAttrs?.download && /\.(png|jpe?g)$/i.test(dlAttrs.download), dlAttrs);

check('there is a full-screen control', await page.locator('button[title*="Full screen"]').count() > 0);
check('there is a fit control', await page.locator('button[title*="Fit the whole page"]').count() > 0);
check('there is a 1:1 control', await page.locator('button[title*="Actual size"]').count() > 0);

// ── the keyboard, on the real page ─────────────────────────────────────────────────────────────
await page.locator('.research-viewer__img-container').click({ position: { x: 5, y: 5 } });
await page.keyboard.press('+'); await page.waitForTimeout(500);
const zoomedIn = await geometry();
check('the + key zooms in', !!zoomedIn && zoomedIn.drawn.w > onOpen.drawn.w - 1,
  { before: onOpen.drawn, after: zoomedIn?.drawn });
check('and the readout drops "fit" once you leave it', !(zoomedIn?.zoomLabel ?? '').includes('fit'), zoomedIn?.zoomLabel);

await page.keyboard.press('0'); await page.waitForTimeout(700);
const backToFit = await geometry();
check('the 0 key returns to fit', !!backToFit && backToFit.insideW && backToFit.insideH && backToFit.zoomLabel.includes('fit'), backToFit);

// The shortcut panel, derived from VIEWER_SHORTCUTS.
await page.locator('.research-viewer__key-toggle').click();
await page.waitForTimeout(400);
const keyItems = await page.locator('.research-viewer__key-hint-item').count();
check('the shortcut list opens and is populated from the shared map', keyItems >= 9, { keyItems });
await page.screenshot({ path: '_qa/viewer-shortcuts.png' });

// A modifier must reach the browser, not the viewer.
const beforeCtrl = await geometry();
await page.keyboard.press('Control+0');
await page.waitForTimeout(400);
const afterCtrl = await geometry();
check('Ctrl+0 is NOT swallowed by the viewer', JSON.stringify(beforeCtrl?.drawn) === JSON.stringify(afterCtrl?.drawn),
  { before: beforeCtrl?.drawn, after: afterCtrl?.drawn });

console.log(`\npage errors: ${errors.length}`);
for (const e of errors.slice(0, 6)) console.log(`   ! ${e}`);
await browser.close();
console.log(`\n${fails === 0 ? 'ALL VIEWER CHECKS PASSED' : `${fails} VIEWER CHECK(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
