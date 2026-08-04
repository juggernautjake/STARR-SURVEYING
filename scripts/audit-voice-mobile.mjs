// scripts/audit-voice-mobile.mjs — does the studio fit on a phone?
//
// The owner's requirement was "the backend studio and everything formats really well to mobile and
// everything can be viewed and published and recorded from the phone." This checks the measurable
// half of that: nothing may push the page wider than the viewport, and nothing may be too small to
// tap. The judgement half still needs eyes on a screenshot.
//
// ── WHY A SIDEWAYS SCROLLBAR IS THE THING TO MEASURE ────────────────────────────────────────────
//
// One 400px-wide element inside a 390px viewport does not just clip itself — it widens the document,
// so every heading on the page can now be scrolled away from and the whole layout feels broken. It is
// the single highest-value automatic check for a phone, and it is invisible on a desktop at any size.
//
// A wide element INSIDE its own `overflow-x: auto` container is fine and is not reported: that is the
// deliberate pattern for a data table, and confusing the two would train someone to ignore the output.
//
// Run:  node scripts/audit-voice-mobile.mjs --base http://localhost:3222 --user X --pass Y

import { chromium, devices } from 'playwright';

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const BASE = argValue('--base', 'http://localhost:3222');
const USER = argValue('--user', 'juggernautjake');
const PASS = argValue('--pass', '');

/** PWA W6d — a session cookie instead of the voice form login, so this measurer can be pointed at
 *  the staff app.
 *
 *  The tap-target rules below (and, more importantly, the exemptions that stop them accusing working
 *  markup) are the expensive part of this file, and they are not specific to the voice studio. The
 *  staff app is where a field crew actually works on a phone, and it had no tap-target check at all
 *  — `audit-mobile.mjs` measures overflow only. Copying these thresholds into a second script is how
 *  this repo ended up with two overflow detectors that disagreed. */
const COOKIE = argValue('--cookie', process.env.STARR_SESSION || '');
const COOKIE_NAME = argValue('--cookie-name', 'authjs.session-token');

const ROUTES = (argValue('--routes', '') || [
  '/AndrewAsh/studio',
  '/AndrewAsh/studio/guide',
  '/AndrewAsh/studio/pages',
  '/AndrewAsh/studio/inquiries',
  '/AndrewAsh/studio/invoices',
  '/AndrewAsh/studio/expenses',
  '/AndrewAsh/studio/clients',
  '/AndrewAsh/studio/contracts',
  '/AndrewAsh/studio/coaching',
  '/AndrewAsh/studio/media',
  '/AndrewAsh/studio/demos',
  '/AndrewAsh/studio/documents',
  '/AndrewAsh/studio/settings',
].join(',')).split(',').map((r) => r.trim()).filter(Boolean);

/** 44×44 CSS px is Apple's minimum and the one most often cited; Android asks for 48dp. 40 is the
 *  floor below which a control is genuinely hard to hit, so that is where this warns.
 *
 *  LINKS ARE HELD TO 24, NOT 40, and the difference is deliberate. WCAG 2.5.8 (AA) asks 24×24 for a
 *  target; 44 is the comfort figure for something being AIMED at. A list of eight reference links
 *  padded to 44 each becomes a 350px wall of whitespace, which is a worse phone page than the one
 *  that prompted the fix. Buttons and inputs get the full 40. */
const MIN_TAP_PX = 40;
const MIN_LINK_PX = 24;

const iPhone = devices['iPhone 12'];

const browser = await chromium.launch();
const context = await browser.newContext({ ...iPhone, viewport: { width: 390, height: 844 } });
const page = await context.newPage();

// Sign in, or every route redirects to the login page and the sweep measures thirteen login screens.
// W6d — a cookie is the staff app's session; the form login below is the voice studio's.
if (COOKIE) {
  await context.addCookies([
    { name: COOKIE_NAME, value: COOKIE, domain: new URL(BASE).hostname, path: '/' },
  ]);
  console.log(`(session cookie: ${COOKIE_NAME})`);
} else if (PASS) {
  const res = await page.request.post(`${BASE}/api/voice/auth/login`, {
    data: { email: USER, password: PASS },
  });
  if (!res.ok()) {
    console.log(`✗ Could not sign in as ${USER} (${res.status()}). Pass --pass.`);
    await browser.close();
    process.exit(1);
  }
}

let problems = 0;

for (const route of ROUTES) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (err) {
    console.log(`  ✗ ${route} — did not load: ${String(err).split('\n')[0]}`);
    problems++;
    continue;
  }

  if (new URL(page.url()).pathname.endsWith('/login')) {
    console.log(`  ✗ ${route} — redirected to login; not signed in`);
    problems++;
    continue;
  }

  const report = await page.evaluate(([minTap, minLink]) => {
    const vw = document.documentElement.clientWidth;

    /** True when some ancestor scrolls this axis itself — the deliberate table pattern. */
    const insideScroller = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };

    const wide = [];
    const small = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;

      if (r.right > vw + 1 && !insideScroller(el)) {
        wide.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.toString?.() || '').slice(0, 48),
          right: Math.round(r.right),
          w: Math.round(r.width),
        });
      }

      const tappable = el.matches('a[href], button, input, select, textarea, [role="button"]');

      // Two things are NOT undersized targets, and reporting them is how a sweep gets ignored:
      //
      //  · A VISUALLY HIDDEN INPUT. A drop zone is a styled <label> wrapping a 1px file input; the
      //    label is the target and it is large. Detected by opacity/clip rather than by class, so it
      //    holds for any hidden-input pattern.
      //  · AN INLINE LINK IN A SENTENCE. "the cheapest ways to get gigs" inside a paragraph cannot be
      //    44px tall without double-spacing the prose around it. WCAG 2.5.8 exempts inline links for
      //    exactly this reason.
      //  · A CHECKBOX OR RADIO WRAPPED IN ITS OWN LABEL. Clicking the label toggles the control, so
      //    the target is the label's box. Measuring the 17px box inside a 44px label reports a
      //    problem that a user cannot experience.
      const cs = getComputedStyle(el);
      const hidden = cs.opacity === '0' || cs.visibility === 'hidden' || cs.clip !== 'auto';
      const inlineInProse =
        el.tagName === 'A' && cs.display.startsWith('inline') && !!el.closest('p, li, .vaHint, .vaStudioSub');

      const labelled =
        (el.type === 'checkbox' || el.type === 'radio') &&
        (el.closest('label')?.getBoundingClientRect().height ?? 0) >= minTap;

      const floor = el.tagName === 'A' ? minLink : minTap;

      if (
        tappable &&
        r.height > 0 &&
        r.height < floor &&
        !el.closest('[hidden]') &&
        !hidden &&
        !inlineInProse &&
        !labelled
      ) {
        small.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.toString?.() || '').slice(0, 48),
          h: Math.round(r.height),
          text: (el.textContent || '').trim().slice(0, 30),
        });
      }
    }

    return {
      scrollW: document.documentElement.scrollWidth,
      clientW: vw,
      // NARROWEST FIRST. The first version printed these in DOM order and led with the fixed bottom
      // nav, which was 445px only because it is 100% of a grid that a 175px email address in a table
      // cell had stretched. The cause was the LAST line of the report. An overflow propagates
      // outward, so the smallest offender is the one to read.
      wide: wide.sort((a, b) => a.w - b.w).slice(0, 4),
      small: small.slice(0, 6),
      smallTotal: small.length,
    };
  }, [MIN_TAP_PX, MIN_LINK_PX]);

  const overflows = report.scrollW > report.clientW + 1;
  const ok = !overflows && report.smallTotal === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${route.padEnd(34)} ${report.scrollW}px doc / ${report.clientW}px screen`);

  if (overflows) {
    problems++;
    console.log(`      SIDEWAYS SCROLL — ${report.scrollW - report.clientW}px too wide:`);
    for (const w of report.wide) console.log(`        <${w.tag} class="${w.cls}"> ends at ${w.right}px`);
  }
  if (report.smallTotal) {
    problems++;
    console.log(`      ${report.smallTotal} tap target(s) below the floor (${MIN_TAP_PX}px controls / ${MIN_LINK_PX}px links):`);
    for (const s of report.small) console.log(`        <${s.tag} class="${s.cls}"> ${s.h}px "${s.text}"`);
  }
}

await browser.close();

console.log(
  problems === 0
    ? `\n✓ All ${ROUTES.length} studio routes fit 390px with no undersized controls.\n`
    : `\n${problems} problem(s) across ${ROUTES.length} routes.\n`,
);
process.exitCode = problems === 0 ? 0 : 1;
