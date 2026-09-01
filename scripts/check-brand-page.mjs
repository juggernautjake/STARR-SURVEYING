// scripts/check-brand-page.mjs — does /admin/branding actually RENDER what it declares?
//
//   npm run build && npx next start -p 3016 -H 127.0.0.1
//   node --env-file=.env.local scripts/check-brand-page.mjs http://127.0.0.1:3016 _qa
//
// ── WHY A STATIC CHECK WAS NOT ENOUGH ───────────────────────────────────────────────────────────
//
// `brand-classes.test.ts` proves every class used in a `className` has a CSS RULE. The eleven-
// palette theme sweep proves nothing on the page is an unthemed island or unreadable. Both were
// green, and the primary button on the upload tab was rendering PURE WHITE.
//
// Neither could see it, for the same reason: they check that rules exist and that colours are
// readable. Neither resolves the CASCADE. `button.brand-btn` is (0,1,1) and `.brand-btn--primary`
// is (0,1,0), so the element rule won regardless of order and `--theme-accent` never reached the
// button. A white button on a white card is neither missing a rule nor unreadable.
//
// So this opens the real page in a real browser and reads `getComputedStyle`. That is the only
// instrument that can answer "what actually ended up on this element".
//
// ── THE ASSERTIONS ARE COMPARATIVE ON PURPOSE ───────────────────────────────────────────────────
//
// "the primary button is not transparent" was the first version and it PASSED against the white
// button. A check that asks "is something painted here" cannot tell a filled button from an
// unfilled one. Asking whether it differs from the panel behind it is the question that matters.
//
// Read-only: it navigates, measures, and issues one GET. It changes nothing.
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3015';
const OUT = process.argv[3] ?? '_qa';
fs.mkdirSync(OUT, { recursive: true });

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }
const token = await encode({
  token: { email: 'jacobmaddux@starr-surveying.com', name: 'Brand QA', sub: 'jacobmaddux@starr-surveying.com' },
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

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

const TABS = ['overview', 'logos', 'colours', 'type', 'pairings', 'blocks', 'downloads', 'upload'];

for (const tab of TABS) {
  await page.goto(`${BASE}/admin/branding?tab=${tab}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // ── CONTROL: are we on the page at all? ────────────────────────────────────────────────────
  // A 403, a redirect to sign-in or an error boundary all render "cleanly". Every assertion below
  // is worthless without this one.
  const shell = await page.locator('.brand-portal').count();
  const activeTab = await page.locator('.brand-portal__tab--active').innerText().catch(() => '');
  const chars = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().length;
  check(`[${tab}] the portal rendered`, shell === 1, { shell, activeTab, chars });
  check(`[${tab}] the tab strip says we are on it`, activeTab.length > 0, activeTab);
  check(`[${tab}] the page is not near-empty`, chars > 400, { chars });

  await page.screenshot({ path: `${OUT}/branding-${tab}.png`, fullPage: true });
}

// ── THE UPLOAD TAB, WHICH IS THE ONE WITH 39 NEW RULES ─────────────────────────────────────────
await page.goto(`${BASE}/admin/branding?tab=upload`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

/** Computed style for the first element with a class, or null if it is not on the page. */
async function computed(sel, props) {
  return page.evaluate(([s, ps]) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
  }, [sel, props]);
}

const drop = await computed('.brand-drop', ['border-style', 'border-width', 'border-radius', 'display', 'padding-top']);
check('the drop zone exists and is a dashed box', !!drop && drop['border-style'].includes('dashed'), drop);
check('and it is not the browser default 0px border', !!drop && parseFloat(drop['border-width']) >= 2, drop?.['border-width']);

const lede = await computed('.brand-drop__lede', ['font-weight', 'margin-top']);
check('the drop lede is styled', !!lede && Number(lede['font-weight']) >= 600, lede);

// The primary button. `.brand-btn` alone is the Blocks-tab specimen with `cursor: default`; a real
// button must have come out the other side of the element-scoped rules.
const primary = await computed('button.brand-btn--primary', ['cursor', 'background-color', 'color', 'border-radius']);
// The ground the primary button sits on. Comparing against another BUTTON was the first idea and
// it cannot be measured here: before a file is staged the drop zone holds exactly one button, so
// the secondary selector returns null and the comparison silently has nothing to compare. The
// container is always present, and "does the button stand out from what is behind it" is the same
// question asked in a way the page can actually answer.
const ground = await computed('.brand-drop', ['background-color']);
check('the primary button is a real control (pointer, not default)', primary?.cursor === 'pointer', primary);

// ── THIS IS THE ASSERTION THAT FOUND THE BUG ───────────────────────────────────────────────────
//
// "not transparent" was the first version and it PASSED against a primary button rendering pure
// white: `button.brand-btn` (0,1,1) out-specifies `.brand-btn--primary` (0,1,0), so the accent never
// reached it. A test that only asks "is something painted here" cannot tell a filled button from an
// unfilled one. Asking whether the primary differs from the SECONDARY is the question that matters,
// because that difference is the entire point of the modifier.
check('the primary button is not white', !!primary && primary['background-color'] !== 'rgb(255, 255, 255)',
  primary?.['background-color']);
check('and it stands out from the panel behind it',
  !!primary && !!ground && primary['background-color'] !== ground['background-color'],
  { primary: primary?.['background-color'], ground: ground?.['background-color'] });

// The Blocks-tab specimen must NOT have been changed by that.
await page.goto(`${BASE}/admin/branding?tab=blocks`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const specimen = await computed('span.brand-btn', ['cursor']);
check('CONTROL: the Blocks specimen span is still cursor:default', specimen?.cursor === 'default', specimen);

// ── CONTROL: a class that has no rule looks different from one that does ───────────────────────
const bogus = await page.evaluate(() => {
  const el = document.createElement('div');
  el.className = 'brand-this-class-has-no-rule';
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const out = { borderStyle: cs.borderStyle, borderWidth: cs.borderWidth };
  el.remove();
  return out;
});
// `borderStyle` comes back `solid` even on a class nothing styles, because the app's own reset sets
// a style with a zero WIDTH. The first version of this control asserted `none` and failed against a
// perfectly correct page — the probe was wrong, not the CSS. Width is the reading that means
// something: 0px is "nothing styled this", 2px is "a rule applied".
check('CONTROL: an undefined class computes to a 0px border, so the drop-zone reading means something',
  parseFloat(bogus.borderWidth) === 0, bogus);

// ── The uploaded library talks to the database that now exists ─────────────────────────────────
await page.goto(`${BASE}/admin/branding?tab=upload`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const apiStatus = await page.evaluate(async () => {
  const r = await fetch('/api/admin/branding/assets');
  return { status: r.status, body: await r.text() };
});
check('GET /api/admin/branding/assets returns 200 now the tables exist', apiStatus.status === 200, apiStatus.status);
check('and it returns an assets array', apiStatus.body.includes('"assets"'), apiStatus.body.slice(0, 160));

const errorBanner = await page.locator('.brand-note--stop').count();
check('no "could not be loaded" banner on the tab', errorBanner === 0);
const empty = await page.locator('.brand-empty').count();
check('the empty state renders instead (0 uploads)', empty === 1, { empty });

const emptyStyle = await computed('.brand-empty', ['border-style', 'padding-top', 'display']);
check('and the empty state is styled, not bare text', !!emptyStyle && emptyStyle['border-style'].includes('dashed'), emptyStyle);

// ── Checkboxes are square now, product-wide ────────────────────────────────────────────────────
const cb = await computed('.brand-check input[type="checkbox"]', ['border-radius', 'width', 'appearance']);
check('a checkbox in the admin content is NOT round', !!cb && !cb['border-radius'].includes('50%'), cb);

console.log(`\nconsole errors: ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 10)) console.log(`   ! ${e}`);

await browser.close();
console.log(`\n${fails === 0 ? 'ALL BROWSER CHECKS PASSED' : `${fails} BROWSER CHECK(S) FAILED`}  (shots in ${OUT}/)`);
process.exit(fails === 0 ? 0 : 1);
