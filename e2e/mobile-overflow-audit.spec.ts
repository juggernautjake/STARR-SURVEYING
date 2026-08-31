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
import { PROBE, OCCLUSION_PROBE, scrollToTheEnd, type Offender } from './_responsive-probes';

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
  // F6 — the file explorer. A row of five grid columns plus a search box, eight filter chips and a
  // breadcrumb is the shape most likely to fail at phone width, and it had never been audited.
  '/admin/files',
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

// The probes and the scroll-to-the-end helper live in `_responsive-probes.ts` — the research
// portal's own responsive pass (E3) runs the same three, and a second hand-written copy of a DOM
// probe is the copy that stops being maintained and goes on reporting clean.

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

  // M6 named `/admin/jobs/[id]`, which cannot go in the static list because the id is data. Resolving
  // one at runtime is the difference between auditing the job detail page and auditing the job LIST
  // twice — and the detail page is the one with the tabs, the file manager and the team panel on it.
  //
  // It skips rather than fails when the account has no jobs: a guard that goes red on an empty
  // database teaches people to ignore red.
  test('no horizontal overflow and nothing stranded: /admin/jobs/[id]', async ({ page }) => {
    await page.goto(`${BASE}/admin/jobs`, { waitUntil: 'networkidle' });
    // The live list is EMPTY on this account and that is not a bug: the `jobs` table holds two rows and
    // both carry a `deleted_at`, so every non-trash view correctly excludes them. Skipping on that
    // basis would have left the job detail page — tabs, file manager, team panel — unaudited on a
    // technicality, so the trash view supplies a fallback id. Layout is layout; a tombstoned job
    // renders the same components, and this test reads only.
    const probe = await page.evaluate(async () => {
      const fetchList = async (qs: string) => {
        const res = await fetch(`/api/admin/jobs?${qs}`);
        const text = await res.text();
        let body: unknown = null;
        try { body = JSON.parse(text); } catch { /* the excerpt is the diagnosis */ }
        const list = Array.isArray(body) ? body : ((body as { jobs?: unknown[] })?.jobs ?? []);
        return { status: res.status, list, excerpt: text.slice(0, 160) };
      };
      const live = await fetchList('limit=1');
      if ((live.list[0] as { id?: string })?.id) {
        return { id: (live.list[0] as { id: string }).id, source: 'live', status: live.status, excerpt: '' };
      }
      // `deleted=true`, not `deleted=1` — the route compares the string exactly, so `1` silently
      // reads as false and returns the ordinary (empty) list.
      const trashed = await fetchList('limit=1&deleted=true');
      return {
        id: (trashed.list[0] as { id?: string })?.id ?? null,
        source: 'soft-deleted', status: trashed.status, excerpt: trashed.excerpt,
      };
    });
    console.log(`  job detail audit: id from the ${probe.source} list (${probe.status})${probe.id ? '' : ` — ${probe.excerpt}`}`);
    const id = probe.id;
    test.skip(!id, 'the jobs table is empty on this account, so there is no detail page to audit');

    await page.goto(`${BASE}/admin/jobs/${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const result = await page.evaluate(PROBE) as {
      docScrollsSideways: boolean; scrollWidth: number; viewport: number; offenders: Offender[];
    };
    const report = result.offenders
      .map((o) => `      ${o.tag}${o.id ? '#' + o.id : ''}${o.cls ? '.' + o.cls.split(' ')[0] : ''} — ${o.width}px "${o.text}"`)
      .join('\n');
    console.log(`\n  /admin/jobs/${id}\n    page scrolls sideways: ${result.docScrollsSideways}\n    unrescued offenders: ${result.offenders.length}\n${report}`);

    await scrollToTheEnd(page);
    const hits = await page.evaluate(OCCLUSION_PROBE) as Array<{ cls: string; text: string; by: string }>;

    if (AUDIT_ONLY) return;
    expect(result.docScrollsSideways, `the job detail page scrolls sideways:\n${report}`).toBe(false);
    expect(hits.length, `the job detail page strands: ${hits.map((h) => `"${h.text}"`).join(', ')}`).toBe(0);
  });

  /**
   * M5 — the hub hero, and the third shape of "does not fit" in this file.
   *
   * Not overflow, and not occlusion: DEAD SPACE. `.hub-greeting > div:first-child` carries
   * `padding-right: 14rem` so the heading cannot slide under the absolutely-positioned Enter Work Mode
   * button — correct on desktop, and the button is returned to normal flow below 768px, where the
   * reservation was never undone. On a 390px phone that is 224px removed from a ~318px card, leaving
   * the heading about 94px and wrapping "Good night, Audit." down three lines.
   *
   * The audit U-7 comment in AdminMe.css records fixing this exact symptom once already. It came back
   * because the later change reserved room for a child that had moved. So the assertion is about the
   * ratio, not the wrap: a text column must actually get most of the box it lives in.
   */
  test('the hub heading gets most of its card, not a sliver: /admin/me', async ({ page }) => {
    await page.goto(`${BASE}/admin/me`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const m = await page.evaluate(() => {
      const card = document.querySelector('.hub-greeting');
      const col = card?.querySelector(':scope > div:first-child');
      const heading = document.querySelector('.hub-greeting__heading');
      if (!card || !col || !heading) return null;
      const cs = getComputedStyle(card), colCs = getComputedStyle(col);
      const cardInner = card.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const colInner = col.getBoundingClientRect().width - parseFloat(colCs.paddingLeft) - parseFloat(colCs.paddingRight);
      return {
        cardInner: Math.round(cardInner),
        colInner: Math.round(colInner),
        ratio: colInner / cardInner,
        headingHeight: Math.round(heading.getBoundingClientRect().height),
        lineHeight: Math.round(parseFloat(getComputedStyle(heading).lineHeight) || 0),
      };
    });

    expect(m, '.hub-greeting or its heading is missing — the selector this guard relies on has moved').not.toBeNull();
    if (!m) return;
    console.log(`\n  /admin/me hero: heading column ${m.colInner}px of ${m.cardInner}px (${(m.ratio * 100).toFixed(0)}%), heading ${m.headingHeight}px tall`);

    // 0.7, not 1.0: a modest reservation is legitimate. 14 rem of it on a 318px card is not — that
    // measured 30%.
    expect(m.ratio, `the hub heading column is only ${(m.ratio * 100).toFixed(0)}% of the card's inner width — something is reserving space it no longer needs`)
      .toBeGreaterThan(0.7);
  });

  for (const route of ROUTES) {
    test(`nothing is stranded under the floating dock: ${route}`, async ({ page }) => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      await scrollToTheEnd(page);

      const hits = await page.evaluate(OCCLUSION_PROBE) as Array<{ cls: string; text: string; by: string }>;
      const report = hits.map((h) => `      "${h.text}" (.${h.cls.split(' ')[0]}) blocked by .${h.by.split(' ')[0]}`).join('\n');
      if (hits.length) console.log(`\n  ${route}\n    stranded controls: ${hits.length}\n${report}`);

      if (AUDIT_ONLY) return;
      expect(hits.length, `${route} has controls a thumb cannot reach:\n${report}`).toBe(0);
    });
  }
});
