// scripts/check-design-fidelity.mjs — is the editor 1:1 with the page?
//
//   node --import tsx --env-file=.env.local scripts/check-design-fidelity.mjs --base http://127.0.0.1:3015
//   node --import tsx --env-file=.env.local scripts/check-design-fidelity.mjs --write   # refresh the record
//
// Phase F of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"make sure the editing view of each page is true to the actual elements and sizes of the
// elements on the page. I don't want it so that we build everything out in the editor, like it, and
// then set it to active, only to find out that it built everything weirdly in a way that did not
// represent the actual planned page."*
//
// ── WHAT THE EXISTING CHECKS DO NOT ANSWER ──────────────────────────────────────────────────────
//
// `check-design-representative.mjs` compares computed style against six hard-coded routes, so most
// of the catalogue is never compared to anything — it last reported "9 compared, 41 not present on
// the sampled routes" and called that a pass. `check-design-alignment.mjs` compares an element's
// default frame against its natural size ON THE ARTBOARD, so it can be perfectly self-consistent
// and still describe something that looks nothing like the page.
//
// Neither measures SIZE against the real page, which is the half the owner named.
//
// This walks routes until every element in the palette has been found on a page that really renders
// it, then compares three things per entry:
//
//   STYLE    the visual properties — colour, weight, size, shape
//   HEIGHT   the rendered height, which is intrinsic for nearly every component and is what makes
//            a mockup feel right or wrong
//   FRAME    the DEFAULT frame the palette hands you when you drag the element out, against the
//            real element's height. This is the one that decides whether a page assembled in the
//            editor is the size of the page it is standing in for.
//
// ── WHICH DIMENSIONS ARE WORTH COMPARING, AND HOW THAT IS DECIDED ───────────────────────────────
//
// Not every dimension is a property of the element. A `width: 100%` input is as wide as its form; a
// card is as tall as what is in it. Comparing those against an artboard frame measures the form and
// the content, not the input and the card.
//
// The first version of this compared height always, on the assumption that height is intrinsic. It
// reported `card.basic` as "editor 200, page 598" and `overlay.dialog` the same — both correct
// numbers, neither a defect. Guessing per property does not work either, because `.admin-card` is
// content-driven and `.admin-btn` is not, and nothing in the CSS says which.
//
// So VARIANCE decides. Every instance of an element is measured, on every route where it appears.
// A dimension that lands on the same number everywhere is a property of the element and is
// compared. One that ranges from 200 to 598 is a property of the content, and is reported as a
// RANGE rather than as a pass or a failure — which is also the more useful thing to know when you
// are choosing a default frame for it.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = (arg('--base') ?? 'http://127.0.0.1:3015').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const WRITE = process.argv.includes('--write');
const OUT = 'lib/design/fidelity.generated.json';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

/** The properties that decide whether two things look like each other. Short on purpose: colour,
 *  weight, size, shape. Not margin — the artboard positions absolutely, so margins differ by design
 *  and comparing them would be comparing the wrapper. */
const VISUAL = [
  'fontSize', 'fontWeight', 'fontFamily', 'color',
  'backgroundColor', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius',
  'textTransform', 'letterSpacing',
];

/** Half a line of 12px text: below this, two numbers are the same number rounded differently. */
const SIZE_TOLERANCE = 3;
/** How many sightings before a dimension's spread means anything. Two agreeing instances can agree
 *  by accident; four rarely do. */
const MIN_SAMPLES = 4;

/** Is this dimension a property of the element, or of whatever is inside it?
 *
 *  Intrinsic if every sighting lands within tolerance of the same number. Reported as a range
 *  otherwise — a card that is 200px on one page and 598px on another has no "correct" height to
 *  compare against, and pretending it does produces a failure nobody can act on. */
function dimension(values) {
  const seen = values.filter((v) => Number.isFinite(v) && v > 0);
  if (seen.length === 0) return { intrinsic: false, reason: 'never measured' };
  const min = Math.min(...seen);
  const max = Math.max(...seen);
  const sorted = [...seen].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (seen.length < MIN_SAMPLES) {
    // Too few sightings to trust either way. Compared, because the alternative is to never check
    // the rare elements — but flagged, so a failure here is read as "look at this" and not as a
    // verdict.
    return { intrinsic: true, value: median, min, max, samples: seen.length, lowConfidence: true };
  }
  if (max - min > SIZE_TOLERANCE) {
    return { intrinsic: false, reason: 'content-driven', min, max, median, samples: seen.length };
  }
  return { intrinsic: true, value: median, min, max, samples: seen.length };
}

function differs(a, b, prop) {
  if (a === b) return false;
  if (/^(fontSize|letterSpacing|borderTopWidth|borderTopLeftRadius)$/.test(prop)) {
    const na = parseFloat(a); const nb = parseFloat(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) > 0.75;
  }
  if (prop === 'fontFamily') {
    const first = (v) => v.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    return first(a) !== first(b);
  }
  return true;
}

// ── The catalogue, imported directly rather than scraped from the DOM ───────────────────────────
//
// A named import fails here: tsx's CJS interop resolves the module after the binding is checked.
// The dynamic form works and is the reason this script runs under `--import tsx`.
const { ENTRIES } = await import('../lib/design/catalogue/index.ts');
const PAGES = JSON.parse(fs.readFileSync('lib/design/pages.generated.json', 'utf8'));

/** An entry's ROOT class — the first class of its outermost node. A composite entry names classes
 *  that live on four different nodes, and demanding all of them makes it unmatchable; the root is
 *  what identifies it. Same rule the drift ratchet settled on. */
function rootClassOf(entry) {
  const m = /^\s*<\w+[^>]*class="([^"]+)"/.exec(entry.html);
  return m ? m[1].split(/\s+/)[0] : entry.classes[0];
}

/** Routes to try, best first: the ones entries cite, then every admin page. The walk stops as soon
 *  as every entry has been seen, so the long tail costs nothing on a healthy catalogue. */
function candidateRoutes() {
  const cited = [];
  for (const e of ENTRIES) for (const u of (e.usage ?? [])) if (!cited.includes(u.route)) cited.push(u.route);
  const admin = PAGES.routes
    .filter((p) => p.area === 'admin' && !p.dynamic)
    .map((p) => p.route);
  return [...cited, ...admin.filter((r) => !cited.includes(r))];
}

const token = await encode({ token: { email: AS, name: 'Fidelity check', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);

console.log(`\n  ${BASE} — is the editor 1:1 with the pages?\n`);

// ── 1. What the editor renders, and at what size ────────────────────────────────────────────────
const studio = await ctx.newPage();
await studio.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await studio.waitForSelector('[data-testid="ds-create"]', { timeout: 60_000 });
await studio.fill('.dsx-home__new-row input', `Fidelity ${Date.now() % 100000}`);
await studio.click('[data-testid="ds-create"]');
await studio.waitForSelector('.dsx__artboard', { timeout: 60_000 });
const designId = new URL(studio.url()).pathname.split('/').pop();

// The artboard is transform-scaled to fit the window. Every measurement taken inside it is divided
// by this, or the editor is compared to the app in two different units — a mistake this project has
// already made once, and it makes everything look 25% wrong.
const scale = await studio.evaluate(() => {
  const art = document.querySelector('.dsx__artboard');
  return art.getBoundingClientRect().width / art.offsetWidth;
});
console.log(`  artboard scale ${scale.toFixed(3)} — divided out of every measurement\n`);

for (const entry of ENTRIES) {
  await studio.fill('[data-testid="ds-palette-search"]', entry.id);
  await studio.waitForTimeout(70);
  const item = studio.locator(`[data-testid="ds-palette-item-${entry.id}"]`);
  if (await item.count()) { await item.first().click(); await studio.waitForTimeout(50); }
}

const inStudio = await studio.evaluate(({ props, scale }) => {
  const out = {};
  document.querySelectorAll('.dsx__el').forEach((wrapper) => {
    const inner = wrapper.querySelector('.dsx__el-inner > *');
    if (!inner) return;
    const classes = (typeof inner.className === 'string' ? inner.className : '').split(/\s+/).filter(Boolean);
    if (classes.length === 0) return;
    const s = getComputedStyle(inner);
    const parent = inner.parentElement ? getComputedStyle(inner.parentElement) : null;
    const style = {};
    // Recorded WITH the parent's value, so a property the element inherits can be told from one it
    // sets. An inherited property always differs between an artboard and a real container, and
    // reporting that forever is how a check becomes noise nobody reads.
    for (const p of props) style[p] = { value: s[p], inherited: !!parent && parent[p] === s[p] };
    const r = inner.getBoundingClientRect();
    out[classes.join(' ')] = {
      style,
      height: Math.round((r.height / scale) * 10) / 10,
      width: Math.round((r.width / scale) * 10) / 10,
      frame: {
        w: Math.round(wrapper.getBoundingClientRect().width / scale),
        h: Math.round(wrapper.getBoundingClientRect().height / scale),
      },
    };
  });
  return out;
}, { props: VISUAL, scale });

const signatures = Object.keys(inStudio);
console.log(`  ${signatures.length} element(s) placed on the artboard\n`);

// ── 2. What the app renders, walking routes until everything has been seen ──────────────────────
const app = await ctx.newPage();
const inApp = {};
const seenOn = {};
/** Every sighting of every signature, so the SPREAD of a dimension can decide whether that
 *  dimension is a property of the element or of whatever happened to be inside it. */
const samples = {};
const routes = candidateRoutes();
let visited = 0;

for (const route of routes) {
  // Stop when everything has been seen ENOUGH times to judge its spread, not at first sight: one
  // sample cannot tell an intrinsic height from a coincidence.
  const undersampled = signatures.filter((sig) => (samples[sig]?.length ?? 0) < MIN_SAMPLES);
  if (undersampled.length === 0) break;
  visited += 1;
  try {
    await app.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await app.waitForTimeout(1800);
    await app.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    const found = await app.evaluate((props) => {
      const out = {};
      document.querySelectorAll('.admin-layout__content *').forEach((el) => {
        const classes = (typeof el.className === 'string' ? el.className : '')
          .split(/\s+/).filter((c) => c && !/^jsx-/.test(c));
        if (classes.length === 0) return;
        const key = classes.join(' ');
        if (out[key]) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;   // hidden: measuring it measures nothing
        const s = getComputedStyle(el);
        const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
        const style = {};
        for (const p of props) style[p] = { value: s[p], inherited: !!parent && parent[p] === s[p] };
        out[key] = {
          style,
          height: Math.round(r.height * 10) / 10,
          width: Math.round(r.width * 10) / 10,
          // Shrink-to-fit means the width is the element's OWN. Stretched means it is the
          // container's — and a form field measured on six pages inside the same 236px form looks
          // perfectly consistent while telling you nothing about the field.
          shrinkToFit: /^inline/.test(s.display) && s.width !== '100%' && s.flexGrow === '0'
                       && s.alignSelf !== 'stretch',
        };
      });
      return out;
    }, VISUAL);
    for (const [sig, data] of Object.entries(found)) {
      // The FIRST sighting fixes the style (they agree across routes, and if they do not, that is
      // the redefinition problem and a different check's job). Every sighting feeds the size
      // sample, because the spread is what says whether a dimension means anything.
      if (!inApp[sig]) { inApp[sig] = data; seenOn[sig] = route; samples[sig] = []; }
      samples[sig].push({ route, height: data.height, width: data.width, shrinkToFit: data.shrinkToFit });
    }
    const nowMissing = signatures.filter((sig) => !inApp[sig]).length;
    process.stdout.write(`\r  walked ${String(visited).padStart(3)} route(s) — ${signatures.length - nowMissing}/${signatures.length} elements located   `);
  } catch { /* a route that will not load cannot teach us anything; the next one might */ }
}
console.log('\n');

// ── 3. Compare ──────────────────────────────────────────────────────────────────────────────────
const record = {};
const problems = [];
let verified = 0;
let notSeen = 0;

for (const entry of ENTRIES) {
  const root = rootClassOf(entry);
  const sig = signatures.find((s) => s.split(/\s+/)[0] === root);
  if (!sig) continue;
  const mine = inStudio[sig];
  const theirs = inApp[sig];

  if (!theirs) {
    notSeen += 1;
    record[entry.id] = { signature: sig, status: 'not-seen', route: null,
      why: 'no admin route rendered this exact class signature while the check ran' };
    continue;
  }

  const diffs = [];
  for (const p of VISUAL) {
    const a = mine.style[p]; const b = theirs.style[p];
    // Inherited in BOTH places means neither element sets it: the difference is the container, and
    // an artboard has no container. Not a defect, and reporting it forever trains people to skim.
    if (a.inherited && b.inherited) continue;
    if (differs(a.value, b.value, p)) diffs.push({ what: p, editor: a.value, page: b.value });
  }
  const shots = samples[sig] ?? [];
  const h = dimension(shots.map((s) => s.height));
  const w = dimension(shots.map((s) => s.width));

  // ── WIDTH NEEDS BOTH SIGNALS, NOT EITHER ──────────────────────────────────────────────────────
  //
  // Consistency alone is not enough for width. Every text input on /admin/jobs/new sits in the same
  // 236px form, so six sightings agree perfectly and the number still describes the form. The
  // element also has to be shrink-to-fit — sizing itself rather than being sized — before its width
  // is a fact about the element. Height needs only consistency, because a container almost never
  // dictates it.
  const widthIsOwn = shots.length > 0 && shots.every((s) => s.shrinkToFit);

  if (h.intrinsic && Math.abs(mine.height - h.value) > SIZE_TOLERANCE) {
    diffs.push({ what: 'height', editor: mine.height, page: h.value, lowConfidence: h.lowConfidence });
  }
  if (widthIsOwn && w.intrinsic && Math.abs(mine.width - w.value) > SIZE_TOLERANCE) {
    diffs.push({ what: 'width', editor: mine.width, page: w.value, lowConfidence: w.lowConfidence });
  }
  // The frame is what you get when you DRAG the thing out of the palette. If it does not match the
  // real element, every page assembled in the editor is the wrong size before anybody has touched
  // anything — which is the owner's whole concern in one number.
  //
  // For a content-driven element there is no single right answer, so the frame is only wrong if it
  // falls outside the range the app actually renders.
  if (h.intrinsic) {
    if (Math.abs(mine.frame.h - h.value) > SIZE_TOLERANCE) {
      diffs.push({ what: 'default frame height', editor: mine.frame.h, page: h.value, lowConfidence: h.lowConfidence });
    }
  } else if (Number.isFinite(h.min) && (mine.frame.h < h.min - SIZE_TOLERANCE || mine.frame.h > h.max + SIZE_TOLERANCE)) {
    diffs.push({ what: 'default frame height', editor: mine.frame.h, page: `${h.min}–${h.max} (content-driven)` });
  }

  record[entry.id] = {
    signature: sig,
    route: seenOn[sig],
    status: diffs.length ? 'differs' : 'verified',
    height: h,
    width: w,
    frame: mine.frame,
    editorSize: { width: mine.width, height: mine.height },
    diffs,
  };
  if (diffs.length) problems.push({ id: entry.id, label: entry.label, route: seenOn[sig], diffs });
  else verified += 1;
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
console.log(`  ── ${verified} verified against a real page · ${problems.length} differ · ${notSeen} never seen ──\n`);
for (const p of problems) {
  console.log(`    ${p.id}  (${p.label})  on ${p.route}`);
  for (const d of p.diffs) console.log(`        ${d.what}: editor ${d.editor}  ·  page ${d.page}`);
}
if (notSeen > 0) {
  console.log('\n  Never seen on any admin route (needs data, a state, or is genuinely unused):');
  for (const [id, r] of Object.entries(record)) if (r.status === 'not-seen') console.log(`    ${id}`);
}

if (WRITE) {
  const payload = {
    measuredAt: new Date().toISOString(),
    base: BASE,
    routesWalked: visited,
    tolerancePx: SIZE_TOLERANCE,
    summary: { verified, differs: problems.length, notSeen },
    entries: record,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\n  Written to ${OUT}`);
}

await studio.request.fetch(`${BASE}/api/admin/design/${designId}`, { method: 'DELETE' }).catch(() => {});
await browser.close();
console.log('');
process.exit(problems.length > 0 && !WRITE ? 1 : 0);
