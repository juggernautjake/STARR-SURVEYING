// scripts/audit-mobile.mjs — does anything actually overflow, at a phone width? (P11-1)
//
// The presentation phase opened with "audit the matrix and write down what is actually broken", because
// this pass has repeatedly found plan items describing a state the code left behind months ago. This is
// that audit, as a script, so every later P11 slice starts from evidence instead of a guess.
//
// THE DETECTOR IS THE INTERESTING PART, and getting it wrong is how you "fix" working code. It now lives
// in `scripts/lib/overflow.mjs`, shared with `contact-sheet.mjs` — the two carried separate copies and
// only one had learned the whole lesson, which is how the IG library page came to be reported as broken
// when it is not. Read that file for the four things that are NOT overflow.
//
// Usage:
//   node scripts/audit-mobile.mjs                    → default pages at 390px
//   node scripts/audit-mobile.mjs --base http://localhost:3001 --widths 360,390,414,768
//   DND_SESSION=… node scripts/audit-mobile.mjs      → measures the SIGNED-IN app (see below)
//
// It EXITS NON-ZERO when it finds real overflow, so it can gate a change; it prints the offending
// selectors and their right edges so the next slice knows where to look.
import { chromium } from 'playwright';
// One shared detector — see that file for the four things that are NOT overflow, two of which this
// script reported as overflow on the IG library page.
import { detectOverflow } from './lib/overflow.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const BASE = arg('base', 'http://localhost:3001');
const WIDTHS = arg('widths', '390').split(',').map((n) => Number(n.trim())).filter(Boolean);
// P11-7 widened this from eight routes to the app's real surface. `--pages` still overrides.
//
// The dynamic ones carry seeded ids: a route template cannot be visited, and the pages most likely to
// overflow are exactly the ones with real content in them. Swap the ids if the seed changes — an id that
// 404s shows up as an `HTTP 404` line rather than passing quietly.
const CHAR = arg('character', 'ca000000-0000-4000-8000-000000000f09');
const CAMPAIGN = arg('campaign', '1a2200aa-0000-4000-8000-0000000000c1');
const PAGES = arg('pages', [
  '/dnd',
  '/dnd/characters',
  '/dnd/characters/new',
  `/dnd/characters/${CHAR}`,
  `/dnd/characters/${CHAR}/levels`,
  `/dnd/characters/${CHAR}/builder`,
  `/dnd/campaigns/${CAMPAIGN}`,
  `/dnd/campaigns/${CAMPAIGN}/manage`,
  '/dnd/library',
  '/dnd/library/pathfinder2e',
  '/dnd/library/dnd5e-2024',
  '/dnd/library/dnd5e-2014',
  '/dnd/library/intuitive-games',
  '/dnd/content',
  '/dnd/content/new',
  '/dnd/profile',
  '/dnd/suggestions',
  '/dnd/login',
].join(',')).split(',');

// THE SESSION COOKIE, and it changes what this tool measures. Without it every page renders for a
// signed-out visitor: the hub is a marketing shell rather than your characters, `/dnd/profile` is a login
// prompt, and a sheet is read-only with no pickers. An earlier "no real overflow anywhere" was therefore a
// statement about pages with far less on them than a real user sees. Pass `--cookie "…"` or DND_SESSION.
const SESSION = arg('cookie', process.env.DND_SESSION || '');
if (!SESSION) console.log('(no --cookie / DND_SESSION — measuring SIGNED-OUT pages, which are not the app)');

const browser = await chromium.launch();
let failures = 0;

// `--self-test` — CAN THIS PROBE STILL FAIL? The detector got stricter twice (scroll containers, then
// closed `<details>` and inline union rects), and each time the honest reading of "no overflow found"
// depends on it still being able to find some. A check that cannot fail reports exactly what a passing
// check reports. So: inject a real offender and two decoys it must keep ignoring, on a real page.
if (process.argv.includes('--self-test')) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (SESSION) await ctx.addCookies([{ name: 'dnd_session', value: SESSION, domain: new URL(BASE).hostname, path: '/' }]);
  const p = await ctx.newPage();
  await p.goto(`${BASE}${PAGES[0]}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(1500);
  const before = (await p.evaluate(detectOverflow)).count;
  await p.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'width:900px;height:20px';
    document.body.appendChild(d);
  });
  const withReal = (await p.evaluate(detectOverflow)).count;
  await p.evaluate(() => {
    const det = document.createElement('details');
    det.innerHTML = '<summary>s</summary><div style="width:900px;height:20px">hidden</div>';
    document.body.appendChild(det);
    const fx = document.createElement('div');
    fx.style.cssText = 'position:fixed;left:0;width:900px;height:20px';
    document.body.appendChild(fx);
  });
  const withDecoys = (await p.evaluate(detectOverflow)).count;
  await ctx.close();
  await browser.close();
  const ok = withReal === before + 1 && withDecoys === withReal;
  console.log(`self-test: baseline ${before} · +real ${withReal} · +decoys ${withDecoys} → ${ok ? 'PASS' : 'FAIL'}`);
  console.log(ok
    ? '  catches genuine overflow; ignores a closed <details> and a fixed element.'
    : '  the detector is either blind or over-eager — fix it before trusting any sweep.');
  process.exit(ok ? 0 : 1);
}

for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  if (SESSION) {
    await context.addCookies([{ name: 'dnd_session', value: SESSION, domain: new URL(BASE).hostname, path: '/' }]);
  }
  const page = await context.newPage();
  console.log(`\n=== ${width}px ===`);

  for (const path of PAGES) {
    try {
      // NOT `networkidle`. Now that character and campaign routes are in the list, that never fires: those
      // sheets hold a realtime channel open, so the network is never idle and the navigation times out at
      // 45s having actually loaded fine. `domcontentloaded` plus a settle is both faster and honest about
      // what it is waiting for.
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // Panels mount progressively; measuring too early reports a half-built page as clean. Longer than the
      // old 600ms because the sheets are the slowest thing here and a half-built page measures as passing.
      await page.waitForTimeout(1500);
      const r = await page.evaluate(detectOverflow);
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
