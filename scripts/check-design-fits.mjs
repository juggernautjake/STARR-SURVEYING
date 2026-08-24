// scripts/check-design-fits.mjs — does the editor fit the window it is given?
//
//   node --env-file=.env.local scripts/check-design-fits.mjs --base http://127.0.0.1:3015
//
// Phase E of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"please make sure the editor really fits in the browser window. In the right side of the
// page it seems like elements are going off of the screen when the window scale is just at 100%.
// Please make sure everything, all of the tools, the side panel, the forward and backward and other
// buttons and everything fit on the page correctly."*
//
// ── WHY THIS MEASURES RATHER THAN LOOKS ─────────────────────────────────────────────────────────
//
// "Something is off the right edge" is easy to see and hard to attribute: the culprit might be the
// panel, its parent, a min-width three levels up, or a grid track that will not shrink. Screenshots
// show the symptom. This walks the editor's chrome and reports, for every interactive control and
// every panel, how far past the viewport its right edge sits — so the fix goes where the overflow
// starts instead of where it shows.
//
// Anything inside `.dsx__artboard` is EXCLUDED. The artboard is a fixed-size canvas that is meant
// to be larger than the window and scrolled; an element at x=1400 on a 1440-wide mockup is correct.
// The chrome around it is what has to fit.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = (arg('--base') ?? 'http://127.0.0.1:3015').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

/** Real laptop and desktop widths at 100% zoom. 1280 is the floor this editor promises to work at:
 *  it is the narrowest common laptop, and the owner's complaint is at "just 100%". */
// 1024 and 1152 are here because "100% zoom" is not a width: Windows display scaling at 125% on a
// 1440p screen leaves ~1152 CSS pixels, and at 150% on 1080p it leaves 1280. The owner's window is
// almost certainly narrower than the monitor it is on.
const WIDTHS = [1024, 1152, 1280, 1440, 1536, 1920];
/** A pixel or two past the edge is a rounding artefact of a scrollbar, not a layout bug. */
const SLOP = 2;

const token = await encode({ token: { email: AS, name: 'Fit check', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch();
let problems = 0;

console.log(`\n  ${BASE} — does the editor fit?\n`);

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('[data-testid="ds-create"]', { timeout: 60_000 });
  await page.fill('.dsx-home__new-row input', `Fit ${width}`);
  await page.click('[data-testid="ds-create"]');
  await page.waitForSelector('.dsx__artboard', { timeout: 60_000 });
  await page.waitForTimeout(800);
  const designId = new URL(page.url()).pathname.split('/').pop();

  // MEASURE THE STATE PEOPLE ARE ACTUALLY IN.
  //
  // The first version of this check opened a blank design with every panel closed and reported a
  // clean bill of health at all four widths, while the owner was looking at things hanging off the
  // right edge. An empty editor is not the editor: the panels are the widest things in it, and the
  // inspector only exists once something is selected. So: place an element, select it, and open
  // every panel that has a toggle before measuring anything.
  // On a narrow window the palette starts collapsed so the artboard is not squeezed into nothing.
  // Opening it is part of reaching the palette, not a workaround for it.
  const paletteToggle = page.locator('button[aria-pressed][title*="palette"]').first();
  if (await paletteToggle.count() && (await paletteToggle.getAttribute('aria-pressed')) === 'false') {
    await paletteToggle.click(); await page.waitForTimeout(250);
  }
  await page.fill('[data-testid="ds-palette-search"]', 'button');
  await page.waitForTimeout(150);
  const first = page.locator('[data-testid^="ds-palette-item-"]').first();
  if (await first.count()) { await first.click(); await page.waitForTimeout(200); }
  // ── UNDO AND REDO, BY DOING THEM ──────────────────────────────────────────────────────────────
  //
  // Owner: *"please make sure I can use ctrl + z to undo and ctrl + y to redo edits and stuff."*
  // The handlers exist in the source; that is not the same as the keystroke reaching them, so this
  // presses the keys and counts the elements.
  const before = await page.locator('.dsx__el').count();
  // Focus has to leave any panel field first. The editor deliberately ignores Ctrl+Z while the
  // caret is in a text box — undo there belongs to the browser, and hijacking it would make typing
  // a name a trap. Opening the panels above parks focus in one of those fields, so this blurs the
  // way clicking the canvas does for a person. (The first version of this check skipped that and
  // reported "Ctrl+Z did not undo" against an editor where it works perfectly.)
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  await page.locator('.dsx__canvas').click({ position: { x: 8, y: 8 } }).catch(() => {});
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const afterUndo = await page.locator('.dsx__el').count();
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(250);
  const afterRedo = await page.locator('.dsx__el').count();
  if (before > 0 && afterUndo !== before - 1) { console.log(`     ✗ Ctrl+Z did not undo (${before} → ${afterUndo})`); problems += 1; }
  if (before > 0 && afterRedo !== before) { console.log(`     ✗ Ctrl+Y did not redo (${afterUndo} → ${afterRedo})`); problems += 1; }

  await page.locator('.dsx__el').first().click({ timeout: 5_000 }).catch(() => {});
  for (const name of ['Theme', 'Notes', 'Checks', 'Layers']) {
    const toggle = page.locator(`button:has-text("${name}")`).first();
    if (await toggle.count()) { await toggle.click({ timeout: 3_000 }).catch(() => {}); await page.waitForTimeout(150); }
  }
  await page.waitForTimeout(400);

  const found = await page.evaluate((slop) => {
    const vw = document.documentElement.clientWidth;
    const out = { vw, docScrollWidth: document.documentElement.scrollWidth, overflowing: [], clipped: [] };
    const label = (el) => {
      const t = (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 32);
      const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${t ? ` “${t}”` : ''}`;
    };
    // Every control and panel in the chrome. The artboard is excluded: it is a canvas that is
    // MEANT to exceed the window and scroll.
    const nodes = document.querySelectorAll(
      '.dsx button, .dsx select, .dsx input, .dsx label, .dsx [role="button"], '
      + '.dsx__bar, .dsx__body, .dsx__right, .dsx__actions, .dsx__tools, .dsx__modes, '
      + '.dsx__export, .dsx__menu, .dsx-theme, .dsx-lay, .dsx__checks, .dsx__notes',
    );
    nodes.forEach((el) => {
      if (el.closest('.dsx__artboard')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;         // not rendered; nothing to measure
      if (getComputedStyle(el).visibility === 'hidden') return;
      if (r.right > vw + slop) out.overflowing.push({ what: label(el), right: Math.round(r.right), over: Math.round(r.right - vw) });
      if (r.left < -slop) out.clipped.push({ what: label(el), left: Math.round(r.left) });
    });
    return out;
  }, SLOP);

  // ── THE ARTBOARD IS WHAT HAS TO FIT ───────────────────────────────────────────────────────────
  //
  // "Nothing past the right edge" is necessary and not sufficient: the chrome fitted perfectly at
  // 1152px while the design sat three-quarters off screen, because the canvas had 383px to show a
  // 1080px artboard. This is the assertion that would have caught it.
  const artboard = await page.evaluate(() => {
    const art = document.querySelector('.dsx__artboard');
    const canvas = document.querySelector('.dsx__canvas');
    if (!art || !canvas) return null;
    const a = art.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    return { artW: Math.round(a.width), canvasW: Math.round(c.width), fits: a.width <= c.width + 1 };
  });
  if (artboard && !artboard.fits) {
    console.log(`  ── ${width}px ── ✗ the artboard is ${artboard.artW}px in a ${artboard.canvasW}px canvas — the design is what is cut off`);
    problems += 1;
  }

  // ── EVERY ELEMENT IS ACTUALLY VISIBLE ─────────────────────────────────────────────────────────
  //
  // Owner: *"all of the button elements are properly visible in the editor version of the page and
  // that all elements are properly visible."* Zero height, zero width, or transparent-on-transparent
  // all look like "nothing was placed".
  const invisible = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.dsx__el').forEach((wrap) => {
      const inner = wrap.querySelector('.dsx__el-inner > *');
      if (!inner) { bad.push('an element rendered nothing at all'); return; }
      const r = inner.getBoundingClientRect();
      const s = getComputedStyle(inner);
      const name = (typeof inner.className === 'string' ? inner.className : '').split(/\s+/)[0] || inner.tagName;
      if (r.width < 1 || r.height < 1) bad.push(`${name} rendered ${Math.round(r.width)}×${Math.round(r.height)}`);
      else if (s.visibility === 'hidden' || s.opacity === '0' || s.display === 'none') bad.push(`${name} is present but not visible`);
    });
    return bad;
  });
  for (const b of invisible) { console.log(`     ✗ ${b}`); problems += 1; }

  const horizontal = found.docScrollWidth > found.vw + SLOP;
  const bad = found.overflowing.length + found.clipped.length + (horizontal ? 1 : 0);
  problems += bad;

  console.log(`  ── ${width}px ──`);
  if (horizontal) console.log(`     ✗ the document scrolls sideways: ${found.docScrollWidth}px of content in ${found.vw}px`);
  for (const o of found.overflowing.slice(0, 12)) console.log(`     ✗ ${o.what} — ${o.over}px past the right edge`);
  for (const c of found.clipped.slice(0, 6)) console.log(`     ✗ ${c.what} — starts ${-c.left}px left of the window`);
  if (found.overflowing.length > 12) console.log(`     …and ${found.overflowing.length - 12} more past the edge`);
  if (bad === 0) console.log('     ✓ every tool, panel and button is inside the window');
  console.log('');

  await page.request.fetch(`${BASE}/api/admin/design/${designId}`, { method: 'DELETE' }).catch(() => {});
  await ctx.close();
}

await browser.close();
console.log(problems === 0 ? '  The editor fits at every width tested.\n' : `  ${problems} fit problem(s).\n`);
process.exit(problems > 0 ? 1 : 0);
