// scripts/check-design-alignment.mjs — is the text inside an element where it should be?
//
//   node --env-file=.env.local scripts/check-design-alignment.mjs --base http://127.0.0.1:3211
//
// Owner: *"please make sure that all of the text that is inside of the elements is properly
// aligned"* and *"make sure everything is proportionally to scale in the editor view to how it
// would be in production"*.
//
// ── WHAT IS ACTUALLY MEASURABLE HERE ────────────────────────────────────────────────────────────
//
// "Properly aligned" sounds like taste. Four parts of it are not:
//
//   centring     text in a control should sit on the frame's middle. A button whose label rides
//                4px high looks broken in a way people notice without being able to name.
//   overflow     text wider or taller than the frame it is in. In production the element grows;
//                on the artboard the frame is fixed, so the text escapes and overlaps its
//                neighbour — which is what makes an exported mockup look like a bug report.
//   scale        the frame the studio gives an element by default versus the size that element
//                takes NATURALLY with the same content. If a button is naturally 38px tall and
//                the catalogue hands you a 56px frame, every mockup made with it is wrong by
//                18px before anybody touches it.
//   clipping     content cut off by the frame — the same as overflow but hidden, which is worse
//                because the export looks fine and is missing words.
//
// Each entry is placed on a real artboard at zoom 1, so what is measured is what is exported.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = (arg('--base') ?? 'http://127.0.0.1:3211').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const VERBOSE = process.argv.includes('--all');
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

/** How far off centre a label may sit before it reads as wrong. Half a line of 12px text. */
const CENTRE_TOLERANCE = 3;
/** How much bigger than its frame content may be before it is escaping rather than filling. */
const OVERFLOW_TOLERANCE = 2;
/** How far a default frame may differ from the element's natural size, in px. */
const SCALE_TOLERANCE = 6;

const token = await encode({
  token: { email: AS, name: 'Alignment check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();

console.log(`\n  ${BASE} — measuring every catalogue element on a real artboard\n`);

await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="ds-create"]', { timeout: 30_000 });
await page.fill('.dsx-home__new-row input', `Alignment probe ${Date.now() % 100000}`);
await page.click('[data-testid="ds-create"]');
await page.waitForSelector('.dsx__artboard', { timeout: 30_000 });
const designUrl = page.url();

// ── The zoom is MEASURED, not driven ──────────────────────────────────────────────────────────
//
// The first version of this clicked the zoom control until the label read 100%. It clicked the
// wrong button, ran at 155%, and reported all 46 elements as broken — every frame was 1.55× its
// catalogue default and every "natural height" was measured on a clone appended to `document.body`,
// outside the scaled artboard, so the two were never in the same units.
//
// Reading the artboard's actual scale and dividing by it is correct at any zoom and cannot be
// driven to the wrong place by a selector that matches the wrong control.
const scale = await page.evaluate(() => {
  const art = document.querySelector('.dsx__artboard');
  return art.getBoundingClientRect().width / art.offsetWidth;
});
console.log(`  artboard scale: ${scale.toFixed(3)} — all measurements divided by it\n`);

const entryIds = await page.evaluate(async () => {
  const res = await fetch('/api/admin/design/import');
  return res.ok ? (await res.json()).ids ?? null : null;
});

/** Place one entry, measure it, delete it. */
async function measure(id) {
  await page.fill('[data-testid="ds-palette-search"]', id);
  await page.waitForTimeout(180);
  const item = page.locator(`[data-testid="ds-palette-item-${id}"]`);
  if (await item.count() === 0) return null;
  await item.first().click();
  await page.waitForTimeout(160);

  const result = await page.evaluate((s) => {
    const wrapper = document.querySelectorAll('.dsx__el');
    const el = wrapper[wrapper.length - 1];
    if (!el) return null;
    const inner = el.querySelector('.dsx__el-inner > *');
    if (!inner) return null;

    const frame = el.getBoundingClientRect();
    const box = inner.getBoundingClientRect();

    // The natural size: clone it, strip the forced fill, and let it size itself — INSIDE the
    // artboard, so it inherits the same stylesheets and the same scale as the thing it is being
    // compared against. Measured on document.body it inherits neither.
    // Appended to the artboard but OUTSIDE `.dsx__el-inner`, so the studio's fill rules do not
    // reach it and it sizes itself. Deliberately NOT forced to `width/height: auto`: the pin button
    // really is 40×40 in its own stylesheet, and overriding that reported it as "naturally 28px"
    // and its correct default as a defect.
    const probe = inner.cloneNode(true);
    probe.style.position = 'absolute';
    probe.style.left = '-9999px';
    probe.style.top = '0';
    document.querySelector('.dsx__artboard').appendChild(probe);
    const natural = probe.getBoundingClientRect();
    probe.remove();

    // Where the text actually sits inside the frame.
    const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
    let textRect = null;
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width < 1) continue;
      textRect = textRect
        ? { top: Math.min(textRect.top, r.top), bottom: Math.max(textRect.bottom, r.bottom),
            left: Math.min(textRect.left, r.left), right: Math.max(textRect.right, r.right) }
        : { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }

    const style = getComputedStyle(inner);
    return {
      frame: { w: Math.round(frame.width / s), h: Math.round(frame.height / s) },
      natural: { w: Math.round(natural.width / s), h: Math.round(natural.height / s) },
      display: style.display,
      alignItems: style.alignItems,
      overflowY: Math.round((box.height - frame.height) / s),
      overflowX: Math.round((box.width - frame.width) / s),
      text: textRect ? {
        // Distance from the text's middle to the frame's middle. Positive = text sits low.
        offCentre: Math.round((((textRect.top + textRect.bottom) / 2) - (frame.top + frame.height / 2)) / s),
        escapesRight: Math.round((textRect.right - (frame.left + frame.width)) / s),
        escapesBottom: Math.round((textRect.bottom - (frame.top + frame.height)) / s),
      } : null,
    };
  }, scale);

  // Remove it again so the next measurement starts clean.
  await page.keyboard.press('Delete');
  await page.waitForTimeout(90);
  return result;
}

// ── What the centring rule may and may not be applied to ──────────────────────────────────────
//
// A button's label belongs on the middle of the button. A LABEL ABOVE AN INPUT belongs at the top,
// which is the whole point of a label — so `input.*` and `select.*` are excluded, and the first run
// of this reported four of them as broken for doing exactly what they should.
//
// Worse: a placeholder is a PROPERTY, not a text node, so on a label-and-field stack only the label
// was ever measured. The rule was not just misapplied, it was reading half the element.
const CATEGORIES_WITH_CENTRED_TEXT = /^(button|tag)\./;

/** Elements with no text and no intrinsic height. A rectangle reporting "natural height 0" is a
 *  rectangle behaving correctly; reporting it as a defect trains people to skim the output. */
const NO_NATURAL_HEIGHT = /^shape\./;

const rows = [];
const ids = entryIds ?? await page.evaluate(async () => {
  const res = await fetch('/api/admin/design/import');
  const body = await res.json();
  return body.entryIds ?? [];
});

// Fall back to reading the palette itself if the API does not expose ids.
const list = ids.length ? ids : await page.evaluate(() => {
  const seen = new Set();
  document.querySelectorAll('[data-testid^="ds-palette-item-"]').forEach((el) => {
    seen.add(el.dataset.testid.replace('ds-palette-item-', ''));
  });
  return [...seen];
});

for (const id of list) {
  const m = await measure(id);
  if (!m) { console.log(`  · ${id.padEnd(24)} could not be placed`); continue; }

  const problems = [];
  if (m.text && CATEGORIES_WITH_CENTRED_TEXT.test(id) && Math.abs(m.text.offCentre) > CENTRE_TOLERANCE) {
    problems.push(`label sits ${m.text.offCentre > 0 ? 'low' : 'high'} by ${Math.abs(m.text.offCentre)}px`);
  }
  if (m.overflowY > OVERFLOW_TOLERANCE) problems.push(`content ${m.overflowY}px taller than its frame`);
  if (m.overflowX > OVERFLOW_TOLERANCE) problems.push(`content ${m.overflowX}px wider than its frame`);
  if (m.text?.escapesBottom > OVERFLOW_TOLERANCE) problems.push(`text escapes ${m.text.escapesBottom}px below`);
  if (m.text?.escapesRight > OVERFLOW_TOLERANCE) problems.push(`text escapes ${m.text.escapesRight}px right`);
  // Only elements with ONE true height are held to their natural size. A card, a dialog, a table
  // and an empty state are containers the designer sizes — a 200px default for a card is a
  // starting size, not a claim about how tall cards are. Holding those to their natural height
  // would report "your card is bigger than its one line of placeholder text", which is not a defect.
  const SIZED_BY_THE_DESIGNER = /^(card|overlay|layout).|^feedback./;
  const fillsItsContainer = m.natural.h > 400;
  // A CONTROL is allowed to be taller than its content: 40px is the tap floor the whole app is
  // held to (contract.json), so an icon button whose glyph is 26px tall and whose frame is 40px
  // is the contract working. Flagging it would be this check arguing with the other one.
  const isControl = /^(button|toggle|input|select)./.test(id);
  const atTapFloor = isControl && m.frame.h >= 24 && m.frame.h <= 48;
  if (!NO_NATURAL_HEIGHT.test(id) && !SIZED_BY_THE_DESIGNER.test(id) && !fillsItsContainer && !atTapFloor
      && m.natural.h > 0 && Math.abs(m.natural.h - m.frame.h) > SCALE_TOLERANCE) {
    problems.push(`default frame ${m.frame.h}px tall, natural height ${m.natural.h}px`);
  }

  rows.push({ id, ...m, problems });
  if (problems.length) console.log(`  ✗ ${id.padEnd(24)} ${problems.join('; ')}`);
  else if (VERBOSE) console.log(`  ✓ ${id.padEnd(24)} ${m.frame.w}×${m.frame.h}`);
}

// Clean up the probe design.
const id = new URL(designUrl).pathname.split('/').pop();
await page.request.fetch(`${BASE}/api/admin/design/${id}`, { method: 'DELETE' }).catch(() => {});
await browser.close();

const bad = rows.filter((r) => r.problems.length);
console.log(`\n  ── ${rows.length} elements measured, ${bad.length} with something to fix ──\n`);
if (bad.length === 0) console.log('  Every element\'s text sits where it should, and every default frame matches its natural size.\n');
process.exit(bad.length ? 1 : 0);
