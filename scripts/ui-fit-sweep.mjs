// scripts/ui-fit-sweep.mjs — does the app FIT, on a laptop and on a phone?
//
// ── WHAT THIS MEASURES, AND WHY THESE FOUR THINGS ───────────────────────────────────────────────
//
// Owner: *"Sometimes things are sized weirdly or are not aligned or crammed together too tightly."*
//
// Most of that is a judgement a person makes by looking. Four parts of it are not judgements at all
// — they are measurements, and a browser will give them to you exactly:
//
//   overflow      the page is wider than the screen. On a phone this is the one that ruins a page:
//                 every column scrolls sideways and nothing lines up with anything.
//   escapes       the specific elements sticking out past the viewport, named, so the fix is one
//                 selector rather than a hunt. A page-level overflow number alone tells you nothing.
//   tiny type     text under 12px. Below that it stops being readable on a phone held at arm's
//                 length, whatever it looks like on a 27" monitor.
//   small targets buttons under 40px on a phone. Apple says 44, Google says 48; under 40 is a
//                 mis-tap, and a mis-tap on "Delete" is not a cosmetic problem.
//
// Everything else — alignment, rhythm, whether a card is CRAMMED — is left to the screenshots this
// writes, because that judgement belongs to eyes and not to a threshold.
//
// Usage:
//   node --env-file=.env.local scripts/ui-fit-sweep.mjs                    # measure every route
//   node --env-file=.env.local scripts/ui-fit-sweep.mjs --only jobs        # just matching routes
//   node --env-file=.env.local scripts/ui-fit-sweep.mjs --shots            # + full-page screenshots
//   node --env-file=.env.local scripts/ui-fit-sweep.mjs --routes /admin,/admin/files

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import fs from 'node:fs';
import path from 'node:path';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};
const has = (f) => process.argv.includes(f);

const BASE = arg('--base') ?? 'http://127.0.0.1:3211';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const ONLY = arg('--only');
const OUT = arg('--out') ?? 'ui-fit-shots';
const SHOTS = has('--shots');

/** A laptop and a phone. 390×844 is an iPhone 14/15; 1440×900 is the MacBook the office uses. */
const VIEWPORTS = [
  { name: 'pc', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

const MIN_FONT_PX = 12;
const MIN_TARGET_PX = 40;

function routes() {
  const explicit = arg('--routes');
  if (explicit) return explicit.split(',').map((r) => r.trim()).filter(Boolean);
  const src = fs.readFileSync('lib/admin/route-registry.ts', 'utf8');
  const found = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
  return [...new Set(found)]
    .filter((h) => h.startsWith('/') && !h.includes('[') && !h.includes(':'))
    .filter((h) => !ONLY || h.includes(ONLY))
    .sort();
}

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const token = await encode({
  token: { email: AS, name: 'UI fit sweep', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

/**
 * Runs INSIDE the page. Returns the four measurements plus a readable identity for each offender —
 * tag, id, the first two classes — because "something is 40px too wide" is not actionable and
 * ".jobs-page__filters is 40px too wide" is.
 */
const MEASURE = ({ minFont, minTarget }) => {
  const ident = (el) => {
    const cls = (el.className && typeof el.className === 'string' ? el.className : '')
      .split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`;
  };
  const visible = (el, r) => {
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  const vw = document.documentElement.clientWidth;
  const all = [...document.querySelectorAll('body *')];

  // ── Elements that stick out past the right edge ──────────────────────────────────────────────
  //
  // An element inside a container that scrolls horizontally ON PURPOSE (a wide table, a chip rail)
  // is not a defect — that is the recommended fix. So an offender only counts if no ancestor is an
  // intentional scroller.
  const scrolls = (el) => {
    const s = getComputedStyle(el);
    return (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  };
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (scrolls(p)) return true;
    return false;
  };

  const escapes = [];
  const tiny = [];
  const targets = [];

  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;

    if (r.right > vw + 2 && !inScroller(el)) {
      escapes.push({ what: ident(el), over: Math.round(r.right - vw), width: Math.round(r.width) });
    }

    const style = getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    // Only leaf-ish text: an element whose own text is what renders, not a wrapper inheriting it.
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (ownText.length > 1 && size && size < minFont) {
      tiny.push({ what: ident(el), px: Math.round(size * 10) / 10, text: ownText.slice(0, 32) });
    }

    const tag = el.tagName.toLowerCase();
    const isTarget = tag === 'button' || tag === 'select' || el.getAttribute('role') === 'button'
      || (tag === 'input' && !['hidden', 'checkbox', 'radio'].includes(el.getAttribute('type') ?? 'text'));
    if (isTarget && (r.height < minTarget || r.width < minTarget)) {
      targets.push({
        what: ident(el),
        size: `${Math.round(r.width)}×${Math.round(r.height)}`,
        label: (el.textContent ?? '').trim().slice(0, 24) || el.getAttribute('aria-label') || '',
      });
    }
  }

  // Deduplicate by identity — one repeated row class is one finding, not forty.
  const dedupe = (list, key) => {
    const seen = new Map();
    for (const item of list) if (!seen.has(item[key])) seen.set(item[key], item);
    return [...seen.values()];
  };

  return {
    docOverflow: Math.max(0, document.documentElement.scrollWidth - vw),
    escapes: dedupe(escapes, 'what').slice(0, 6),
    tiny: dedupe(tiny, 'what').slice(0, 6),
    targets: dedupe(targets, 'what').slice(0, 6),
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('dialog', (d) => void d.accept());

const list = routes();
console.log(`\n  Measuring ${list.length} route(s) at ${VIEWPORTS.map((v) => `${v.width}px`).join(' and ')}\n`);
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const report = [];

for (const route of list) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    } catch {
      console.log(`  ${route} [${vp.name}] — navigation failed`);
      continue;
    }
    // ── WAIT FOR THE PAGE, NOT FOR A DURATION (2026-08-22) ────────────────────────────────────
    //
    // This was `waitForTimeout(2200)`, and the first full run reported a perfectly clean app —
    // because every screenshot it took was of the "⏳ Loading…" splash. A fixed delay measures
    // whatever happened to be on screen when it expired, and reports the absence of findings as a
    // clean bill of health. That is the instrument manufacturing a good number.
    //
    // So: settle the network, then require actual content, and SAY SO when it never arrives rather
    // than quietly measuring a spinner.
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
    const ready = await page
      .waitForFunction(
        () => {
          const text = (document.body?.innerText ?? '').trim();
          if (/^(⏳\s*)?loading[.…]*$/i.test(text)) return false;
          return document.querySelectorAll('body *').length > 60;
        },
        null,
        { timeout: 20_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!ready) {
      console.log(`  ${route} [${vp.name}] — NEVER FINISHED LOADING (not measured)`);
      report.push({ route, vp: vp.name, notReady: true, docOverflow: 0, escapes: [], tiny: [], targets: [], score: 0 });
      continue;
    }
    // A beat for layout to settle after the last paint — fonts, images, and the shell's own
    // measure-then-position work.
    await page.waitForTimeout(600);

    const m = await page.evaluate(MEASURE, { minFont: MIN_FONT_PX, minTarget: MIN_TARGET_PX });
    const score = m.docOverflow + m.escapes.length * 10 + m.targets.length * 3 + m.tiny.length * 2;
    report.push({ route, vp: vp.name, ...m, score });

    if (SHOTS) {
      // ── HIDE THE FIXED FURNITURE BEFORE CAPTURING (2026-08-22) ──────────────────────────────
      //
      // A full-page screenshot paints `position: fixed` elements ONCE, at the scroll position the
      // capture started from — so the floating action dock, which really sits at the bottom-right
      // corner of the viewport, lands in the middle of the image on top of whatever content
      // happens to be there. Two "overlapping elements" findings came out of that before anyone
      // noticed the dock was doing nothing wrong. The screenshot is evidence; evidence that lies
      // about where things are is worse than none.
      await page.addStyleTag({
        content: '.fab-menu, .assistant-panel, .messenger-panel { visibility: hidden !important; }',
      }).catch(() => {});
      const file = `${(route.replace(/\//g, '_') || 'root').replace(/^_/, '')}__${vp.name}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true }).catch(() => {});
    }

    const flags = [];
    if (m.docOverflow > 0) flags.push(`overflow ${m.docOverflow}px`);
    if (m.escapes.length) flags.push(`${m.escapes.length} escaping`);
    if (m.targets.length) flags.push(`${m.targets.length} small targets`);
    if (m.tiny.length) flags.push(`${m.tiny.length} tiny text`);
    if (flags.length) console.log(`  ${route} [${vp.name}] — ${flags.join(', ')}`);
  }
}

// ── The ranking is the point ───────────────────────────────────────────────────────────────────
//
// A flat list of 280 measurements is not a work order. Sorted by how badly a page fails, the first
// ten lines are the afternoon's work.
const stalled = report.filter((r) => r.notReady);
if (stalled.length) {
  console.log(`\n  ── ${stalled.length} page/size combination(s) never finished loading and were NOT measured ──`);
  for (const r of stalled) console.log(`      ${r.route} [${r.vp}]`);
}
const worst = report.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
console.log(`\n  ── ${worst.length} of ${report.length - stalled.length} measured page/size combinations have something to fix ──\n`);
for (const r of worst.slice(0, 25)) {
  console.log(`  ${r.route} [${r.vp}]  score ${r.score}`);
  if (r.docOverflow) console.log(`      page is ${r.docOverflow}px wider than the screen`);
  for (const e of r.escapes) console.log(`      escapes by ${e.over}px: ${e.what} (${e.width}px wide)`);
  for (const t of r.targets) console.log(`      small target ${t.size}: ${t.what} "${t.label}"`);
  for (const t of r.tiny) console.log(`      ${t.px}px text: ${t.what} "${t.text}"`);
}

fs.writeFileSync(path.join(SHOTS ? OUT : '.', 'ui-fit-report.json'), JSON.stringify(report, null, 2));
console.log(`\n  Full data: ${path.join(SHOTS ? OUT : '.', 'ui-fit-report.json')}${SHOTS ? `, screenshots in ${OUT}/` : ''}\n`);

await browser.close();
