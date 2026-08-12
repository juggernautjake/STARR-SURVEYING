// e2e/topbar-fits-a-phone.spec.ts — M5–M8. The account menu must not hang off the screen.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// The bar is `justify-content: space-between` with `.admin-topbar__right { flex-shrink: 1 }`. A long
// page title takes the room it wants, the right GROUP dutifully shrinks — and its children (clock-in,
// XP, bell, avatar) are buttons at the 40px tap floor that cannot shrink below their own padding, so
// they spill straight out of it.
//
// ── MEASURED, AND NOT WHAT THE FIRST DRAFT OF THIS FILE CLAIMED ─────────────────────────────────
//
// That draft said the avatar was drawn 6px off the right edge at 390px. Re-measured before trusting
// it, with the fix reverted, and that is not what happens. What actually happens (390 x 844, signed
// in, `flex-shrink: 1`):
//
//   /admin/hours-approval   left=160  right box=214  children need 222  last child ends at 390
//   /admin/me               left= 83  right box=222  children need 222  last child ends at 382
//
// The children overflow their box by 8px, but the bar's own 12px of right padding absorbs it, so the
// avatar lands FLUSH against the glass instead of off it. The page never scrolls sideways either, so
// nothing in the suite noticed. Narrow the viewport and the padding runs out:
//
//   320px  /admin/hours-approval   right box=166  children need 178  → 5px drawn past the edge
//
// So the mechanism was real and the number was wrong. This file asserts two widths for that reason:
// 320px is where it draws off-screen, and 390px is where it merely eats all the padding — and the
// 390px assertion is the one with teeth, because "flush against the edge" is a bug you can see and
// zero sideways scroll is a bug you cannot.
//
// ── WHAT THIS ASKS THAT NOTHING ELSE DID ────────────────────────────────────────────────────────
//
// `document.scrollWidth` stayed exactly equal to the viewport throughout, because the bar is
// `position: fixed` and CLIPS its overflow rather than extending the page. M4's audit swept twenty
// routes at 360px asking "does this scroll sideways?" and called every one clean — correctly, for the
// question it was asking. The question here is instead: **is anything drawn outside the bar's
// content box** — i.e. does anything trespass on the padding that is supposed to hold it off the
// edge. Asserting against the viewport, as the first draft did, passes with the bug in place.

import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import { encode } from '@auth/core/jwt';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3016';
const ADMIN = 'jacobmaddux@starr-surveying.com';

// A long title is the trigger, so the route with the longest one is the one worth testing — but the
// bar is shared chrome and the four pages the owner named are M5–M8, so all of them are swept rather
// than only the one that reproduced. `/admin/receipts/new` is here because it is the page a crew
// member actually opens, and `/admin/me` is the control: it passed before the fix and must still
// pass after it.
const ROUTES = [
  '/admin/hours-approval',  // M8 — the longest title, and where the spill was measured
  '/admin/my-hours',        // M8
  '/admin/me',              // M5
  '/admin/jobs',            // M6
  '/admin/receipts',        // M7
  '/admin/receipts/new',    // M7
];

// 390 = iPhone 14/15, the size the owner is holding. 320 = iPhone SE 1st gen and the floor the rest of
// the responsive CSS is written to; it is where the padding runs out and pixels leave the screen.
const WIDTHS = [390, 320];

function secret(): string {
  const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  return env.match(/^AUTH_SECRET\s*=\s*(.+)$/m)![1].replace(/^["']|["']$/g, '').trim();
}

// The cold-start allowance has to be granted in THREE places or it does nothing, and the first
// version of this file granted it in one. `expect(...).toBeVisible({ timeout: 90_000 })` cannot
// outlive the config's `timeout: 60_000` per test, and it never got the chance anyway: `page.goto`
// carries `navigationTimeout: 30_000` from the config and failed first, on a cold
// /admin/hours-approval, exactly as the comment below predicted. So: test budget, then navigation,
// then the assertion — a generous number on the innermost wait is decoration if an outer one fires.
const COLD_COMPILE_MS = 90_000;

test.describe.configure({ timeout: COLD_COMPILE_MS + 60_000 });

async function phoneContext(browser: Browser, width = 390): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const token = await encode({
    token: { email: ADMIN, name: 'E2E', sub: 'e2e' },
    secret: secret(), salt: 'authjs.session-token', maxAge: 3600,
  });
  await ctx.addCookies([{
    name: 'authjs.session-token', value: token,
    domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax',
  }]);
  return ctx;
}

// Both tests need a signed-in phone sitting on a route with its top bar painted. Keeping that in one
// place is what stops the two copies from drifting apart on the timeouts again.
async function openOnAPhone(browser: Browser, route: string, width = 390) {
  const ctx = await phoneContext(browser, width);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: COLD_COMPILE_MS });

  // A hard wait, not a conditional skip: `isVisible()` does not auto-wait, so a test written on it
  // skips itself and reports green while asserting nothing.
  await expect(page.locator('.admin-topbar')).toBeVisible({ timeout: COLD_COMPILE_MS });
  await settle(page);
  return { ctx, page };
}

// ── WHY THIS EXISTS, AND WHY THE TEST WAS FALSELY GREEN WITHOUT IT ────────────────────────────────
//
// The right group's width is not knowable at first paint. `<ClockInPill />` fetches its own state, and
// the XP link is rendered `{xp !== null && ...}` — so on a cold measurement the group is missing a
// 38px child and whatever the clock pill grows to, and it FITS. Measured immediately, the pre-fix bar
// at 390px reported zero spill; measured after the fetches land, the same bar reported 12px past the
// content edge. The test was passing on a bar the user never sees.
//
// So wait for the width to stop moving rather than for any particular child: which children appear
// depends on the account (XP can legitimately be absent), and a test that waits for a specific one
// would hang for the accounts that do not have it.
async function settle(page: import('@playwright/test').Page) {
  // A width-stability poll alone is not enough, and this is the second false green in this file: six
  // stable polls is 600ms of a still bar, and a fetch that lands at 1.5s clears that bar long after
  // the test has measured. Waiting for the network first is what makes the children present at all.
  //
  // Guarded, because the admin chrome polls for notifications and a polling page may never go idle —
  // an unguarded `networkidle` would turn a real assertion into a timeout, which is a worse failure
  // than the one it was added to prevent.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.admin-topbar__right');
      if (!el) return false;
      const w = Math.round(el.getBoundingClientRect().width);
      const win = window as unknown as { __lastW?: number; __stable?: number };
      if (win.__lastW === w) win.__stable = (win.__stable ?? 0) + 1;
      else { win.__lastW = w; win.__stable = 0; }
      // Six consecutive identical polls at 100ms — half a second of a still bar. A single repeat is
      // not enough: two async children landing back to back look stable in the gap between them.
      return (win.__stable ?? 0) >= 6;
    },
    null,
    { polling: 100, timeout: 20_000 },
  );
}

test.describe('the admin top bar fits a phone', () => {
  for (const width of WIDTHS) {
    for (const route of ROUTES) {
      test(`nothing trespasses on the bar's padding at ${width}px — ${route}`, async ({ browser }) => {
        // A dev server compiles an admin route on its first AUTHENTICATED request, and a test that is
        // flaky on a cold start is one people learn to re-run — and then its real failures get re-run
        // away too. See COLD_COMPILE_MS.
        const { ctx, page } = await openOnAPhone(browser, route, width);

        const spill = await page.evaluate(() => {
          const bar = document.querySelector('.admin-topbar')!;
          const box = bar.getBoundingClientRect();
          const padRight = parseFloat(getComputedStyle(bar).paddingRight) || 0;

          // The limit is the bar's CONTENT edge, not the viewport. That is the whole point: the
          // padding exists to hold the controls off the glass, so a control sitting in the padding is
          // already the bug — it is the state one pixel of extra content away from being clipped, and
          // measuring against the viewport reports it as fine.
          const limit = Math.min(box.right - padRight, document.documentElement.clientWidth);

          let worst = 0;
          let culprit = '';
          for (const el of bar.querySelectorAll('*')) {
            const b = el.getBoundingClientRect();
            if (!b.width || !b.height) continue;
            // Absolutely-positioned popovers (the notification panel, the account menu) are anchored
            // to the right edge on purpose and are not laid out by the bar's flex line. They open on
            // tap and have their own width rules; including them would flag the fixture, not a defect.
            if (getComputedStyle(el).position === 'absolute') continue;
            const past = b.right - limit;
            if (past > worst) {
              worst = past;
              culprit = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30) || '(no class)'}`;
            }
          }
          return { worst: Math.round(worst), culprit, limit: Math.round(limit) };
        });

        // 1px for sub-pixel rounding. At 390px the pre-fix spill was 8px into the padding; at 320px
        // 5px of it left the screen entirely.
        expect(spill.worst, `${spill.culprit} is drawn ${spill.worst}px past the bar's content edge (${spill.limit}px)`)
          .toBeLessThanOrEqual(1);

        await ctx.close();
      });
    }
  }

  test('the page title truncates instead of pushing the controls out', async ({ browser }) => {
    // The other half of the fix, and the reason it works: the title yields. Asserting the ellipsis
    // is set stops somebody "fixing" a cramped heading later by removing the truncation, which would
    // silently put the avatar back off the screen.
    const { ctx, page } = await openOnAPhone(browser, '/admin/hours-approval');

    const css = await page.evaluate(() => {
      const title = document.querySelector('.admin-topbar__title');
      const right = document.querySelector('.admin-topbar__right');
      return {
        titleOverflow: title ? getComputedStyle(title).textOverflow : null,
        // The controls must refuse to be squeezed — this is the actual one-line fix.
        rightShrink: right ? getComputedStyle(right).flexShrink : null,
      };
    });

    expect(css.titleOverflow).toBe('ellipsis');
    expect(css.rightShrink).toBe('0');

    await ctx.close();
  });
});
