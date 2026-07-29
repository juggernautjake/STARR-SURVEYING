// scripts/audit-mobile.mjs — does anything actually overflow, at a phone width? (P11-1)
//
// The presentation phase opened with "audit the matrix and write down what is actually broken", because
// this pass has repeatedly found plan items describing a state the code left behind months ago. This is
// that audit, as a script, so every later P11 slice starts from evidence instead of a guess.
//
// THE DETECTOR IS THE INTERESTING PART, and getting it wrong is how you "fix" working code:
//
//   · An element only counts if it escapes the VIEWPORT **and** no ancestor is a horizontal scroll
//     container. A first version without that second clause reported 152 offenders on the rules library —
//     every cell of five `overflow-x: auto` data tables that scroll perfectly well. Wide tables on a phone
//     are supposed to scroll.
//   · `position: fixed` elements are skipped. A floating dock or FAB is anchored to the viewport by
//     definition and is not a layout defect.
//   · The page is measured after `networkidle` AND a settle delay, because these sheets mount their panels
//     progressively and a measurement taken too early reports a half-built page.
//
// Usage:
//   node scripts/audit-mobile.mjs                    → default pages at 390px
//   node scripts/audit-mobile.mjs --base http://localhost:3001 --widths 360,390,414,768
//
// It EXITS NON-ZERO when it finds real overflow, so it can gate a change; it prints the offending
// selectors and their right edges so the next slice knows where to look.
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const BASE = arg('base', 'http://localhost:3001');
const WIDTHS = arg('widths', '390').split(',').map((n) => Number(n.trim())).filter(Boolean);
const PAGES = arg('pages', [
  '/dnd',
  '/dnd/characters',
  '/dnd/library',
  '/dnd/library/pathfinder2e',
  '/dnd/library/dnd5e-2024',
  '/dnd/content',
  '/dnd/content/new',
  '/dnd/profile',
].join(',')).split(',');

/** Runs in the page. Returns real, non-scrollable overflow only. */
const DETECT = () => {
  const inScroller = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
      p = p.parentElement;
    }
    return false;
  };
  const bad = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (getComputedStyle(el).position === 'fixed') return;
    if (r.right > window.innerWidth + 2 && !inScroller(el)) {
      bad.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 40),
        right: Math.round(r.right),
        width: Math.round(r.width),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
      });
    }
  });
  // Deduplicated by selector+edge: one 500px-wide row reports its every descendant otherwise, and a
  // hundred lines of the same defect is a list nobody reads.
  const seen = new Set();
  const unique = bad.filter((b) => {
    const k = `${b.tag}.${b.cls}@${b.right}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    docScrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    count: bad.length,
    offenders: unique.sort((a, b) => b.right - a.right).slice(0, 6),
  };
};

const browser = await chromium.launch();
let failures = 0;

for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  console.log(`\n=== ${width}px ===`);

  for (const path of PAGES) {
    try {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
      // Panels mount progressively; measuring too early reports a half-built page as clean.
      await page.waitForTimeout(600);
      const r = await page.evaluate(DETECT);
      const status = res && res.status() >= 400 ? `HTTP ${res.status()}` : '';
      if (r.count === 0 && !status) {
        console.log(`  ok    ${path}`);
      } else {
        failures += 1;
        console.log(`  FAIL  ${path} ${status} — ${r.count} overflowing (doc ${r.docScrollWidth} vs ${r.viewport})`);
        for (const o of r.offenders) {
          console.log(`          ${o.tag}.${o.cls || '(no class)'} w=${o.width} right=${o.right} "${o.text}"`);
        }
      }
    } catch (e) {
      failures += 1;
      console.log(`  ERROR ${path} — ${e.message.split('\n')[0]}`);
    }
  }
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} page/width combination(s) with real overflow.` : '\nNo real overflow found.');
process.exitCode = failures ? 1 : 0;
