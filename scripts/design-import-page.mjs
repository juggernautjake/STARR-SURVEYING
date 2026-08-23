// scripts/design-import-page.mjs — open a real page as an editable design.
//
//   node --env-file=.env.local scripts/design-import-page.mjs --route /admin/jobs
//   node --env-file=.env.local scripts/design-import-page.mjs --route /admin/jobs --name "Jobs — today"
//
// Slice M1 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md (§13).
//
// Drives a signed-in browser to the route at BOTH breakpoints, measures every element the catalogue
// might recognise, and posts the result to /api/admin/design/import — which does the matching
// against the real catalogue and creates the design. It then prints the part that is arguably worth
// more than the import: **every element on that page the catalogue cannot name**, which is a
// coverage gap the page itself reported rather than something anybody had to notice.
//
// The two viewports are captured SEPARATELY and become two independent views, because a responsive
// page genuinely is two layouts — importing the desktop capture into both would hand the owner a
// mobile design that never existed.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = (arg('--base') ?? 'http://127.0.0.1:3211').replace(/\/$/, '');
const ROUTE = arg('--route');
const NAME = arg('--name');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';

if (!ROUTE) {
  console.error('Usage: node scripts/design-import-page.mjs --route /admin/jobs [--base URL] [--name "…"]');
  process.exit(2);
}
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

/**
 * Runs INSIDE the page.
 *
 * Keeps a node if the catalogue might know it (it wears one of the catalogue's classes) or if it is
 * a leaf that carries text or takes input. Everything else is layout scaffolding, which is the part
 * a mockup is redrawing anyway — see the note at the top of lib/design/import.ts about why this
 * walk is deliberately lossy.
 */
const CAPTURE = (known) => {
  const knownClasses = new Set(known);
  const LEAF = new Set(['button', 'a', 'input', 'select', 'textarea', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'td', 'th', 'li', 'strong', 'code']);
  const out = [];
  const scrollY = window.scrollY;

  const depthOf = (el) => { let d = 0; for (let p = el.parentElement; p; p = p.parentElement) d += 1; return d; };

  // ── Only the PAGE, not the shell it sits in ───────────────────────────────────────────────────
  //
  // The first run of this imported 17 sidebar links, the topbar title and the XP pill into a mockup
  // of /admin/jobs. The sidebar is identical on all 147 admin routes and is not what anybody is
  // redesigning when they redesign the jobs page — and 30 nodes of chrome buries the 34 that are
  // actually the page. `.admin-layout__content` is the app's own name for "the page part", the
  // same boundary `forms.css` is scoped to.
  const root = document.querySelector('.admin-layout__content') ?? document.body;
  const origin = root.getBoundingClientRect();

  for (const el of root.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    // Off-screen furniture — a closed drawer, a print block — is not what the page looks like.
    if (r.bottom + scrollY < 0 || r.right < 0) continue;

    const classes = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean);
    const tag = el.tagName.toLowerCase();
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // A visible surface — a card, a panel, a toolbar — is an element even when it is a bare div.
    const transparent = /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i;
    const paints = !transparent.test(style.backgroundColor)
      || (parseFloat(style.borderTopWidth) > 0 && !transparent.test(style.borderTopColor));

    const catalogueMightKnowIt = classes.some((c) => knownClasses.has(c));
    const isContentLeaf = LEAF.has(tag) && (ownText.length > 0 || ['input', 'select', 'textarea'].includes(tag));
    if (!catalogueMightKnowIt && !isContentLeaf && !paints) continue;

    out.push({
      tag,
      classes,
      // A placeholder is what an empty field SAYS, and an imported field with no words in it is a
      // grey box that tells the next reader nothing.
      text: ownText || el.getAttribute('placeholder') || '',
      // Relative to the content root, not the window: with the sidebar included in the origin,
      // every imported element would land 240px to the right of where it belongs, and the mobile
      // and desktop views would not even share a coordinate space.
      rect: {
        x: Math.round(r.left - origin.left),
        y: Math.round(r.top - origin.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      styles: {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        background: style.backgroundColor,
        radius: style.borderTopLeftRadius,
      },
      paints,
      depth: depthOf(el),
    });
    // A hard ceiling. A page with 900 kept nodes is a page this tool cannot help with anyway, and
    // silently truncating would be worse than saying so — the caller reports the cap.
    if (out.length >= 600) break;
  }
  return out;
};

const token = await encode({
  token: { email: AS, name: 'Design import', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();

console.log(`\n  Tracing ${ROUTE} at ${VIEWPORTS.desktop.width}px and ${VIEWPORTS.mobile.width}px\n`);

// The catalogue's class index, so the walk can filter as it goes rather than posting 1,200 nodes.
const indexRes = await page.request.fetch(`${BASE}/api/admin/design/import`);
if (!indexRes.ok()) {
  console.error(`  Could not read the catalogue index (${indexRes.status()}). Is the server running and the account an admin or developer?`);
  await browser.close();
  process.exit(1);
}
const { classes, entries } = await indexRes.json();
console.log(`  ${entries} catalogue entries, ${classes.length} distinct classes to look for`);

const captures = {};
for (const [viewId, size] of Object.entries(VIEWPORTS)) {
  await page.setViewportSize(size);
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  // Admin pages fetch after mount; capturing the loading splash would import a spinner.
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  captures[viewId] = await page.evaluate(CAPTURE, classes);
  console.log(`  ${viewId}: ${captures[viewId].length} candidate node(s)${captures[viewId].length >= 600 ? ' (hit the 600 cap — the design will be partial)' : ''}`);
}

const res = await page.request.fetch(`${BASE}/api/admin/design/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  data: { route: ROUTE, name: NAME, desktop: captures.desktop, mobile: captures.mobile },
});
const body = await res.json().catch(() => null);
await browser.close();

if (!res.ok()) {
  console.error(`\n  Import failed (${res.status()}): ${body?.error ?? 'no reason given'}`);
  process.exit(1);
}

const { doc, coverage } = body;
console.log(`\n  ✓ Created “${doc.name}”`);
console.log(`    ${BASE}/admin/design/${doc.id}\n`);
console.log(`    desktop: ${coverage.desktop.kept} element(s) kept, ${coverage.desktop.dropped} dropped as scaffolding`);
console.log(`    mobile:  ${coverage.mobile.kept} element(s) kept, ${coverage.mobile.dropped} dropped as scaffolding`);

if (coverage.gaps.length) {
  console.log(`\n  ── ${coverage.gaps.length} thing(s) on this page the catalogue cannot name ──\n`);
  console.log('  These are curation gaps, reported by the page itself rather than noticed by someone.');
  console.log('  Each is a candidate for lib/design/catalogue/curated/.\n');
  for (const gap of coverage.gaps.slice(0, 25)) {
    const times = gap.count > 1 ? ` ×${gap.count}` : '';
    console.log(`    ${gap.tag}.${gap.classes.split(' ').join('.')}${times}${gap.sample ? `   “${gap.sample}”` : ''}`);
  }
  if (coverage.gaps.length > 25) console.log(`\n    …and ${coverage.gaps.length - 25} more.`);
} else {
  console.log('\n  Every element on this page matched a catalogue entry.');
}
console.log('');
