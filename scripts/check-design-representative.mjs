// scripts/check-design-representative.mjs — does a palette element look like the real thing?
//
//   node --env-file=.env.local scripts/check-design-representative.mjs --base http://127.0.0.1:3211
//
// Slice B4 of docs/planning/completed/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// Owner: *"Make sure all of the elements are actually representative."*
//
// ── WHY NOT A SCREENSHOT DIFF ───────────────────────────────────────────────────────────────────
//
// The obvious version renders an entry in the studio, renders the same markup on a real page, and
// compares pixels. It would fail constantly for reasons nobody cares about — a one-pixel font
// difference, a scrollbar, the artboard's own background — and a check that cries wolf is a check
// somebody deletes. It also cannot run at all for entries whose real page needs data.
//
// ── WHAT IS ACTUALLY BEING ASKED ────────────────────────────────────────────────────────────────
//
// "Representative" means the element in the palette is STYLED BY THE SAME RULES as the element on
// the page. That is checkable exactly, without pixels: take the computed style of the entry on the
// artboard, take the computed style of a real element wearing the same class on its real page, and
// compare the properties that decide what something looks like.
//
// This catches the failure that actually happens here — and has happened twice. The studio has to
// import every stylesheet its catalogue cites (see the header of Studio.tsx); when it does not, the
// element renders as an unstyled browser default while looking like a legitimate mockup. A missing
// import shows up here as "font-size 16px vs 13.6px, background transparent vs #1D3095", which is
// unambiguous and points straight at the cause.

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

/** The properties that decide whether two things look like each other. Deliberately short: colour,
 *  weight, size, shape. Not margins — the artboard positions absolutely, so margins differ by
 *  design and comparing them would be comparing the wrapper, not the element. */
const VISUAL = [
  'fontSize', 'fontWeight', 'fontFamily', 'color',
  'backgroundColor', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius',
  'textTransform', 'letterSpacing',
];

/** A difference small enough to be a rounding artefact rather than a different rule. */
function differs(a, b, prop) {
  if (a === b) return false;
  if (/^(fontSize|letterSpacing|borderTopWidth|borderTopLeftRadius)$/.test(prop)) {
    const na = parseFloat(a); const nb = parseFloat(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) > 0.75;
  }
  // Font stacks are quoted differently by different browsers' computed styles; compare the first
  // family only, which is the one that actually renders.
  if (prop === 'fontFamily') {
    const first = (v) => v.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    return first(a) !== first(b);
  }
  return true;
}

const token = await encode({ token: { email: AS, name: 'Representative check', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);

console.log(`\n  ${BASE} — is each palette element styled like the real one?\n`);

// ── 1. What the studio renders ──────────────────────────────────────────────────────────────────
const studio = await ctx.newPage();
await studio.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await studio.waitForSelector('[data-testid="ds-create"]', { timeout: 30_000 });
await studio.fill('.dsx-home__new-row input', `Representative ${Date.now() % 100000}`);
await studio.click('[data-testid="ds-create"]');
await studio.waitForSelector('.dsx__artboard', { timeout: 30_000 });
const designId = new URL(studio.url()).pathname.split('/').pop();

const entryIds = await studio.evaluate(async () => {
  const box = document.querySelector('[data-testid="ds-palette-search"]');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(box, '');
  box.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  return [...document.querySelectorAll('[data-testid^="ds-palette-item-"]')]
    .map((el) => el.dataset.testid.replace('ds-palette-item-', ''));
});

for (const id of entryIds) {
  await studio.fill('[data-testid="ds-palette-search"]', id);
  await studio.waitForTimeout(70);
  const item = studio.locator(`[data-testid="ds-palette-item-${id}"]`);
  if (await item.count()) { await item.first().click(); await studio.waitForTimeout(50); }
}

const inStudio = await studio.evaluate((props) => {
  const out = {};
  document.querySelectorAll('.dsx__el').forEach((wrapper) => {
    const inner = wrapper.querySelector('.dsx__el-inner > *');
    if (!inner) return;
    const classes = (typeof inner.className === 'string' ? inner.className : '').split(/\s+/).filter(Boolean);
    if (classes.length === 0) return;
    const s = getComputedStyle(inner);
    const parent = inner.parentElement ? getComputedStyle(inner.parentElement) : null;
    const style = {};
    // Recorded with the parent value, so a property the element INHERITS can be told from one it
    // sets. An inherited property always differs between an artboard and a real container, and
    // reporting that forever is how a check becomes noise.
    for (const p of props) style[p] = { value: s[p], inherited: !!parent && parent[p] === s[p] };
    // Keyed by the FULL class list, so a variant is not compared against its base.
    out[classes.join(' ')] = style;
  });
  return out;
}, VISUAL);

console.log(`  ${Object.keys(inStudio).length} element(s) rendered on the artboard\n`);

// ── 2. What the app renders, on the routes the entries cite ─────────────────────────────────────
//
// One page per route, and every catalogued class looked for on it. A class that does not appear on
// its own cited route is not a failure of this check — the page may need data, or the element may
// only appear in a state — so it is counted as "not seen" and reported separately from "differs".
const app = await ctx.newPage();
const ROUTES = ['/admin/jobs', '/admin/employees', '/admin/learn', '/admin/work', '/admin/users', '/admin/hours-approval'];
const inApp = {};

for (const route of ROUTES) {
  await app.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
  await app.waitForTimeout(2200);
  const found = await app.evaluate((props) => {
    const out = {};
    document.querySelectorAll('.admin-layout__content *').forEach((el) => {
      const classes = (typeof el.className === 'string' ? el.className : '')
        .split(/\s+/).filter((c) => c && !/^jsx-/.test(c));
      if (classes.length === 0) return;
      const key = classes.join(' ');
      if (out[key]) return;
      const s = getComputedStyle(el);
      const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
      const style = {};
      for (const p of props) style[p] = { value: s[p], inherited: !!parent && parent[p] === s[p] };
      out[key] = style;
    });
    return out;
  }, VISUAL);
  Object.assign(inApp, found);
}

console.log(`  ${Object.keys(inApp).length} distinct class signature(s) seen across ${ROUTES.length} real pages\n`);

// ── 3. Compare ──────────────────────────────────────────────────────────────────────────────────
const problems = [];
let compared = 0;
let notSeen = 0;

for (const [classes, studioStyle] of Object.entries(inStudio)) {
  const realStyle = inApp[classes];
  if (!realStyle) { notSeen += 1; continue; }
  compared += 1;
  const wrong = VISUAL.filter((p) => {
    const mine = studioStyle[p];
    const theirs = realStyle[p];
    // Inherited in BOTH places means neither element sets it — the difference is the container,
    // and an artboard has no container. `.admin-page-header__star` inherits 12.48px from the header
    // strip in the app and 16px from the artboard, and neither is wrong.
    if (mine.inherited && theirs.inherited) return false;
    return differs(mine.value, theirs.value, p);
  });
  if (wrong.length) {
    problems.push({
      classes,
      detail: wrong.map((p) => `${p}: studio ${studioStyle[p].value} vs app ${realStyle[p].value}`),
    });
  }
}

for (const p of problems) {
  console.log(`  ✗ .${p.classes.split(' ').join('.')}`);
  for (const d of p.detail) console.log(`      ${d}`);
}

await studio.request.fetch(`${BASE}/api/admin/design/${designId}`, { method: 'DELETE' }).catch(() => {});
await browser.close();

console.log(`\n  ── ${compared} compared against the live app, ${problems.length} styled differently ──`);
console.log(`     (${notSeen} not present on the sampled routes — nothing to compare against)\n`);
if (problems.length === 0 && compared > 0) {
  console.log('  Every element the app actually renders is styled the same way in the palette.\n');
}
process.exit(problems.length ? 1 : 0);
