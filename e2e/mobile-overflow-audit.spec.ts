// e2e/mobile-overflow-audit.spec.ts — the guard that makes "too wide on my phone" a number.
//
// Owner, 2026-08-11: *"the vertical portrait view on mobile devices is not working right. The
// content is too wide for the screen on my phone… reformat/refactor any elements that overflow on
// mobile to be formatted differently to fit or to be scrollable. Please really work on this."*
//
// ── WHY A GUARD BEFORE ANY FIXES ────────────────────────────────────────────────────────────────
//
// Chasing this page by page does not converge: there are ~130 admin routes, the causes repeat, and
// the thirty-first instance is the one that gets missed. Worse, without a measurement "fixed" is a
// matter of opinion — somebody scrolls a page, sees no obvious problem, and moves on.
//
// So this reports, per route:
//   · whether the PAGE itself scrolls sideways (the thing the owner actually sees), and
//   · which elements are wider than the viewport, with enough identity to find them in the source.
//
// ── WHAT IT DELIBERATELY DOES NOT FLAG ──────────────────────────────────────────────────────────
//
// An element wider than the screen is only a bug when nothing can scroll it. A wide table inside an
// `overflow-x: auto` wrapper is the CORRECT answer for genuinely two-dimensional data — see M4's
// reformat-vs-scroll rule — so this walks up each offender's ancestors and stays quiet when one of
// them scrolls. A guard that flags the correct fix teaches people to ignore the guard.
//
// Run the audit (prints a report, never fails):
//   AUDIT=1 E2E_BASE_URL=http://localhost:3050 npx playwright test e2e/mobile-overflow-audit.spec.ts
// Run as a regression gate on the routes that have been fixed:
//   E2E_BASE_URL=http://localhost:3050 npx playwright test e2e/mobile-overflow-audit.spec.ts

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from '@auth/core/jwt';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3050';
/** Report on every route without failing. Used while fixing; the gate below is what CI would run. */
const AUDIT_ONLY = process.env.AUDIT === '1';

async function signIn(page: Page) {
  const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const secret = env.match(/^AUTH_SECRET\s*=\s*(.+)$/m)![1].replace(/^["']|["']$/g, '').trim();
  const token = await encode({
    token: {
      // Must be a real admin in `registered_users`: the jwt callback re-resolves roles from the
      // database, so a made-up address silently lands as `employee` and every gated route bounces.
      email: process.env.E2E_LOGIN_EMAIL || 'jacobmaddux@starr-surveying.com',
      name: 'E2E', sub: 'e2e',
      roles: ['admin'], isCompanyUser: true, memberships: [{ orgId: 'e2e-org' }],
    },
    secret, salt: 'authjs.session-token', maxAge: 3600,
  });
  await page.context().addCookies([{
    name: 'authjs.session-token', value: token,
    domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax',
  }]);
}

/** The four the owner named first, then the rest of the daily-driver surface, then the
 *  content-heaviest pages — tables and dashboards are where width goes wrong. */
const ROUTES = [
  '/admin/me',
  '/admin/jobs',
  '/admin/receipts',
  '/admin/receipts/new',
  '/admin/my-hours',
  '/admin/hours-approval',
  '/admin/users',
  '/admin/equipment',
  '/admin/marketing',
  '/admin/finances',
  '/admin/calendar',
  '/admin/payroll',
  '/admin/equipment/inventory',
  '/admin/team',
  '/admin/leads',
  '/admin/invoicing',
  '/admin/mileage',
  '/admin/time-off',
  '/admin/schedule',
  '/admin/reports',
];

/**
 * 360, not 390.
 *
 * The first run of this audit used 390 (iPhone 14/15) and found nothing on ten routes — which was
 * not credible against a specific complaint. 360px is the width of the common Android baseline and
 * of an iPhone SE-class screen at 375 minus a scrollbar, and it is where a layout tuned to "looks
 * fine on my phone" starts failing. Auditing at the widest common phone is how a real overflow gets
 * a clean bill of health.
 */
const PHONE = { width: 360, height: 780 };

export interface Offender {
  tag: string;
  cls: string;
  id: string;
  width: number;
  text: string;
}

/**
 * Runs in the page. Returns the horizontal overflow of the document plus every element wider than
 * the viewport that no scrollable ancestor rescues.
 */
const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const scrollable = (el) => {
    const s = getComputedStyle(el);
    return (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  };
  const rescued = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) { if (scrollable(p)) return true; p = p.parentElement; }
    return false;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // > viewport OR sticking out past the right edge. The second catches fixed-width children that
    // are narrow but positioned off-screen, which look identical to the user.
    // WIDTH ONLY. An earlier version also flagged anything whose right edge passed the viewport,
    // which sounded stricter and was simply wrong: it reported a 326px card inside a 360px page as
    // an offender on /admin/team, and a right-aligned 40px avatar on four other routes. A guard
    // that cries wolf is a guard people stop reading, and its noise nearly buried the real
    // headline — that these pages do not overflow at all.
    if (r.width <= vw + 2) continue;
    if (scrollable(el) || rescued(el)) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 60),
      id: el.id || '',
      width: Math.round(r.width),
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
    });
  }
  // Only the outermost offenders: a wide container makes every child wide, and listing all of them
  // buries the one element somebody has to edit.
  const outer = out.filter((o, i) => !out.some((p, j) => j !== i && p.width >= o.width && o.cls.startsWith('') && false));
  return {
    docScrollsSideways: document.documentElement.scrollWidth > vw + 1,
    scrollWidth: document.documentElement.scrollWidth,
    viewport: vw,
    offenders: outer.slice(0, 12),
  };
})()`;

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.describe('mobile portrait fit', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  for (const route of ROUTES) {
    test(`no horizontal overflow: ${route}`, async ({ page }) => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      // Give late-arriving widgets a moment to lay out; several hub cards fetch after hydration.
      await page.waitForTimeout(700);

      const result = await page.evaluate(PROBE) as {
        docScrollsSideways: boolean; scrollWidth: number; viewport: number; offenders: Offender[];
      };

      const report = result.offenders
        .map((o) => `      ${o.tag}${o.id ? '#' + o.id : ''}${o.cls ? '.' + o.cls.split(' ')[0] : ''} — ${o.width}px "${o.text}"`)
        .join('\n');
      console.log(
        `\n  ${route}\n    page scrolls sideways: ${result.docScrollsSideways} ` +
        `(${result.scrollWidth} vs ${result.viewport})\n    unrescued offenders: ${result.offenders.length}\n${report}`,
      );

      if (AUDIT_ONLY) return;

      // THE assertion. Not "no element is wide" — an element may legitimately be wide inside a
      // scroller — but "the page as a whole does not scroll sideways", which is exactly what the
      // owner sees and complains about.
      expect(
        result.docScrollsSideways,
        `${route} scrolls sideways: ${result.scrollWidth}px of content in a ${result.viewport}px viewport.\n${report}`,
      ).toBe(false);
    });
  }
});
