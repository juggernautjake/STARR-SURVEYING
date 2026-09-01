// e2e/research-responsive.spec.ts — E3, the responsive pass, made a measurement.
//
// The last open slice on RESEARCH_UI_OVERHAUL: *"responsive pass at 1440 and 390 against a
// production build"*. It sat open because it is the one item on that doc a browser, not a test,
// has to settle — so this is the browser, driven, rather than a person scrolling and forming an
// opinion.
//
// ── WHY THIS EXISTS ALONGSIDE `mobile-overflow-audit.spec.ts` ──────────────────────────────────
//
// That audit covers twenty-two ADMIN routes at 360px and asserts one thing: the page does not
// scroll sideways. Not one research route is in its list — the research portal has been outside
// every responsive measurement this repo has. This adds the twelve research routes, at BOTH of the
// widths the doc names, and asks three questions rather than one:
//
//   1. does the page scroll sideways (the thing a reader actually sees);
//   2. is any control unreachable because something is parked on top of it;
//   3. at 1440, does the content collapse into a narrow column of a wide empty page.
//
// (3) is the desktop half, and it is why "responsive" is not a synonym for "works on a phone". A
// portal that renders a 600px column in a 1440px window is not broken — it is unusable for the work
// it exists for, which is reading a deed next to a plat.
//
// ── THE PROBES ARE SHARED ON PURPOSE ────────────────────────────────────────────────────────────
//
// `PROBE` and `OCCLUSION_PROBE` live in `_responsive-probes.ts` and are imported, not copied. Four
// hand-written copies of one list is G12 in the same doc; two hand-written copies of a DOM probe
// would be the same defect with a longer fuse, because the copy that stops being maintained is the
// one that keeps reporting clean.
//
// Run the audit (prints, never fails):
//   AUDIT=1 E2E_BASE_URL=http://localhost:3050 npx playwright test e2e/research-responsive.spec.ts
// Run as the gate:
//   E2E_BASE_URL=http://localhost:3050 npx playwright test e2e/research-responsive.spec.ts

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from '@auth/core/jwt';
import { PROBE, OCCLUSION_PROBE, scrollToTheEnd, type Offender } from './_responsive-probes';
// The same page function `check-portal-themes.mjs` runs over routes. The Review tabs are state, so
// they are unreachable from any route list, and this is the only place they get measured as painted.
import { AUDIT } from '../scripts/_contrast-audit-probe.mjs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3050';
const AUDIT_ONLY = process.env.AUDIT === '1';

async function signIn(page: Page) {
  const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const secret = env.match(/^AUTH_SECRET\s*=\s*(.+)$/m)![1].replace(/^["']|["']$/g, '').trim();
  const token = await encode({
    token: {
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

/**
 * Every routed page under `/admin/research`, and the eight portal tabs.
 *
 * Swept from the filesystem when this was written rather than typed, because a route added after
 * the list is a route nobody measures — and `/admin/research/testing` is exactly that shape: a
 * whole sub-application nobody would have thought to list.
 */
const ROUTES = [
  '/admin/research',
  '/admin/research/pipeline',
  '/admin/research/library',
  '/admin/research/coverage',
  '/admin/research/sites',
  '/admin/research/billing',
  '/admin/research/self-heal',
  '/admin/research/testing',
];

/**
 * 390 and 1440 — the two the doc names.
 *
 * 390 rather than the mobile audit's 360, deliberately and with the trade stated: that audit uses
 * 360 because auditing at the widest common phone gives a real overflow a clean bill of health, and
 * it is right. The doc asks for 390, this is the doc's slice, and a page that overflows at 390
 * overflows at 360 too — so 390 finding something is strictly worse news, not weaker news. 360 is
 * covered for the admin shell by the other file.
 */
const WIDTHS = [
  { name: 'phone 390', viewport: { width: 390, height: 844 }, mobile: true },
  { name: 'desktop 1440', viewport: { width: 1440, height: 900 }, mobile: false },
];

/**
 * At 1440, how much of the window does the content actually use?
 *
 * A portal that lays out a 600px column in a 1440px window has not failed any assertion above and
 * is still the wrong answer for a screen whose job is reading a deed beside a plat. Measured as the
 * widest laid-out block inside the main content area, so a full-bleed background does not flatter
 * it and a `max-width` container is judged on the width it really occupies.
 */
const WIDE_PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const main = document.querySelector('main') || document.body;
  let widest = 0;
  let what = '';
  for (const el of main.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.height < 24 || r.width <= widest) continue;
    if (r.width > vw + 2) continue;                       // an overflowing element is the other test
    widest = r.width;
    what = el.tagName.toLowerCase() + (el.className && el.className.toString
      ? '.' + el.className.toString().split(' ')[0] : '');
  }
  return { viewport: vw, widest: Math.round(widest), what };
})()`;

/**
 * A page that rendered nothing is not a page that passed.
 *
 * Every assertion in this file is satisfied by a blank screen — a route that 500s, or one that
 * bounced to the login, scrolls sideways exactly zero pixels. Without this, a broken auth cookie
 * would turn the whole file green and the slice would be "done".
 */
const RENDERED_PROBE = `(() => {
  const t = (document.body.innerText || '').trim();
  return {
    chars: t.length,
    looksLikeLogin: /sign in|log in|unauthor/i.test(t.slice(0, 400)),
    heading: (document.querySelector('h1, h2')?.textContent || '').trim().slice(0, 60),
  };
})()`;

for (const { name, viewport, mobile } of WIDTHS) {
  test.describe(`research portal — ${name}`, () => {
    test.use({ viewport, hasTouch: mobile, isMobile: mobile });

    test.beforeEach(async ({ page }) => { await signIn(page); });

    for (const route of ROUTES) {
      test(`${route}`, async ({ page }) => {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(700);

        const rendered = await page.evaluate(RENDERED_PROBE) as
          { chars: number; looksLikeLogin: boolean; heading: string };

        const result = await page.evaluate(PROBE) as {
          docScrollsSideways: boolean; scrollWidth: number; viewport: number; offenders: Offender[];
        };

        const report = result.offenders
          .map((o) => `      ${o.tag}${o.id ? '#' + o.id : ''}${o.cls ? '.' + o.cls.split(' ')[0] : ''} — ${o.width}px "${o.text}"`)
          .join('\n');

        let wide = { viewport: 0, widest: 0, what: '' };
        if (!mobile) wide = await page.evaluate(WIDE_PROBE) as typeof wide;

        await scrollToTheEnd(page);
        const stranded = await page.evaluate(OCCLUSION_PROBE) as
          Array<{ cls: string; text: string; by: string }>;

        console.log(
          `\n  ${route} @ ${name}\n    rendered: ${rendered.chars} chars — "${rendered.heading}"\n` +
          `    scrolls sideways: ${result.docScrollsSideways} (${result.scrollWidth} vs ${result.viewport})\n` +
          `    unrescued offenders: ${result.offenders.length}\n${report}\n` +
          (mobile ? '' : `    widest block: ${wide.widest} of ${wide.viewport} (${wide.what})\n`) +
          `    stranded controls: ${stranded.length}` +
          stranded.map((s) => `\n      "${s.text}" under .${s.by.split(' ')[0]}`).join(''),
        );

        if (AUDIT_ONLY) return;

        expect(rendered.chars, `${route} rendered almost nothing — every other assertion here is vacuous`)
          .toBeGreaterThan(120);
        expect(rendered.looksLikeLogin, `${route} bounced to a login; the session cookie is not working`)
          .toBe(false);

        expect(
          result.docScrollsSideways,
          `${route} scrolls sideways at ${name}: ${result.scrollWidth}px of content in a ${result.viewport}px viewport.\n${report}`,
        ).toBe(false);

        expect(
          stranded,
          `${route}: controls unreachable at the bottom of the page at ${name}`,
        ).toEqual([]);

        if (!mobile) {
          // Two-thirds of a 1440 window is 960px — roughly a deed column beside a plat column, which
          // is the thing this portal is for. Below that the page is a phone layout on a desktop.
          expect(
            wide.widest,
            `${route} uses only ${wide.widest}px of a ${wide.viewport}px window (widest block: ${wide.what}) — `
            + 'a narrow column on a wide screen is not "responsive", it is unbuilt.',
          ).toBeGreaterThan(wide.viewport * 0.66);
        }
      });
    }
  });
}

/**
 * A research run with something in every section of the Review tab.
 *
 * Deliberately verbose. Overflow is a function of content length: a fixture with `"foo"` in every
 * field lays out inside any viewport and reports a portal responsive that breaks the moment a real
 * legal description arrives. Instrument numbers, bearings and monument descriptions here are the
 * shapes the worker really produces — long unbroken tokens are exactly what pushes a table wide.
 */
const REVIEW_FIXTURE = {
  owner_name: 'MADDUX, JACOB R AND MADDUX, SARAH E, TRUSTEES OF THE MADDUX FAMILY TRUST',
  result: {
    documentCount: 14,
    data_point_count: 212,
    duration_ms: 3_845_000,
    confidenceScore: 78,
    screenshotCount: 9,
    finalSummary:
      'Fourteen instruments were retrieved for the subject tract in the Bell County Clerk records, '
      + 'covering conveyances from 1957 to 2019. The chain is continuous except at the 2004 transfer, '
      + 'where the grantor of Vol. 5412 Pg. 233 does not match the grantee of the preceding instrument. '
      + 'Three plats were located and analysed; the recorded bearings on the east line disagree with the '
      + 'deed call by 0°14′, which is within the tolerance for a 1961 survey but should be verified in the field.',
    errors: [{ recovered: true, message: 'TexasFile timed out on retry 1' }, { recovered: false, message: 'CAD adapter unavailable' }],
    boundary: {
      callCount: 8,
      bearingsAndDistances: [
        'N 30° 15′ 00″ E, 412.60 feet to a 1/2 inch iron rod found with cap stamped "RPLS 4562"',
        'S 59° 45′ 00″ E, 318.22 feet to a 60d nail set in the centerline of Pecan School Road',
        'S 30° 15′ 00″ W, 412.60 feet to a 1/2 inch iron rod set with cap stamped "STARR RPLS 6871"',
        'N 59° 45′ 00″ W, 318.22 feet to the POINT OF BEGINNING, containing 3.011 acres of land',
      ],
      rowWidths: ['Pecan School Road — 60 foot right-of-way per Plat Cabinet C, Slide 214-B'],
      platEasements: [
        '10 foot utility easement along the entire east line per Plat Cabinet C, Slide 214-B',
        '20 foot drainage easement across the southwest corner per Vol. 4218 Pg. 77',
      ],
    },
    chainOfTitle: [
      { order: 1, date: '1957-04-12', from: 'HOLLAND TOWNSITE COMPANY', to: 'WILHELMINA J. SCHOENEBERG, A WIDOW', instrumentNumber: 'Vol. 0412 Pg. 118', type: 'Warranty Deed' },
      { order: 2, date: '1984-11-02', from: 'WILHELMINA J. SCHOENEBERG', to: 'ROBERT L. AND DIANNE F. KUEHLER', instrumentNumber: 'Vol. 1877 Pg. 402', type: 'Warranty Deed with Vendor’s Lien' },
      { order: 3, date: '2004-06-30', from: 'KUEHLER FAMILY PARTNERSHIP LTD', to: 'BELL COUNTY LAND HOLDINGS LLC', instrumentNumber: 'Vol. 5412 Pg. 233', type: 'Special Warranty Deed' },
      { order: 4, date: '2019-08-14', from: 'BELL COUNTY LAND HOLDINGS LLC', to: 'MADDUX FAMILY TRUST', instrumentNumber: '2019-00041882', type: 'General Warranty Deed' },
    ],
    platAnalyses: [
      {
        name: 'HOLLAND TOWNSITE, BLOCK 14, LOTS 1–4',
        instrumentNumber: 'Plat Cabinet C, Slide 214-B',
        date: '1961-03-09',
        narrative: 'The plat shows a 60 foot right-of-way for Pecan School Road along the south line and '
          + 'a 10 foot utility easement along the east line. Bearings are referenced to the 1927 datum and '
          + 'disagree with the 2019 deed call on the east line by 0°14′. Monumentation is shown at all four '
          + 'corners; the northeast corner is called as a 1/2 inch iron rod, which matches what the field '
          + 'crew is likely to find.',
        adjacentReferences: ['SCHOENEBERG ADDITION to the north', 'HOLLAND ISD tract to the west'],
      },
    ],
    // ── The Artifacts tab's GIS quality card ────────────────────────────────────────────────
    //
    // Added 2026-08-31 with the fourteenth B1a extraction. Before this the Artifacts tab measured
    // **0 chars** in this very spec, and 0 of 50 real projects carry a report — so the card had
    // literally never rendered, and four unreadable colours sat in it while every instrument
    // reported green. A branch nothing renders is a branch nothing can measure.
    //
    // The three scores straddle both bands ON PURPOSE. 82 is good, 55 is the fair band — the one
    // that measured **1.92:1** as #eab308 and is the reason this fixture exists — and 22 is poor.
    // A fixture that exercised one band would have left two colours unmeasured, which is how this
    // happened the first time.
    gisQualityReport: {
      summary: 'Three GIS captures assessed. Two are usable for boundary comparison; the parcel '
        + 'overlay capture is zoomed too far out to resolve the east line.',
      checks: [
        {
          label: 'Bell CAD parcel overview',
          qualityScore: 82,
          zoomAssessment: 'appropriate',
          whatIsShown: 'Subject tract with parcel lines, adjoining tract IDs and the Pecan School Road right-of-way clearly legible.',
          recommendations: [],
        },
        {
          label: 'Aerial imagery with parcel overlay',
          qualityScore: 55,
          zoomAssessment: 'too far out',
          whatIsShown: 'Subject tract visible but parcel boundary lines are thinner than one pixel along the east line.',
          recommendations: [
            'Re-capture at zoom level 18 or closer',
            'Disable the roads layer, which obscures the south boundary at this scale',
          ],
        },
        {
          label: 'FEMA flood hazard layer',
          qualityScore: 22,
          zoomAssessment: 'unusable',
          whatIsShown: 'Layer failed to draw; the capture shows the basemap only, with no hazard shading present.',
          recommendations: ['Retry after the FEMA service returns', 'Fall back to the static FIRM panel'],
        },
      ],
      actionableAdjustments: [
        'Re-run GIS capture for the aerial overlay at a closer zoom before relying on the east line',
        'The FEMA capture carries no data — treat flood determination as unresolved rather than clear',
      ],
    },
    crossValidation: [],
    deedSummary: 'Four instruments, 1957 to 2019, with one break at the 2004 transfer.',
    platSummary: 'One recorded plat, 1961, with a 0°14′ bearing disagreement on the east line.',
    easementSummary:
      'The tract is encumbered by a 60 foot public right-of-way along Pecan School Road, a 10 foot '
      + 'utility easement along the entire east line, and a 20 foot drainage easement across the '
      + 'southwest corner. No mineral reservation was located in the instruments retrieved.',
    fema: {
      floodZone: 'AE', zoneSubtype: 'FLOODWAY', inSFHA: true,
      firmPanel: '48027C0415E', effectiveDate: '2016-09-26',
      sourceUrl: 'https://msc.fema.gov/portal/search',
    },
    txdot: {
      rowWidth: 60, csjNumber: '0909-12-345', highwayName: 'FM 1123 (PECAN SCHOOL ROAD)',
      highwayClass: 'Farm to Market', district: 'Waco', acquisitionDate: '1961-07-01',
      sourceUrl: 'https://gis-txdot.opendata.arcgis.com/',
    },
    easements: [
      {
        type: 'Utility Easement', description: 'A ten (10) foot wide easement for electric distribution '
          + 'facilities along the entire east line of the subject tract, granted to Oncor Electric Delivery '
          + 'Company LLC, its successors and assigns.',
        instrumentNumber: 'Vol. 4218 Pg. 77', width: '10 feet',
        location: 'Along the entire east line, from the northeast corner to the southeast corner',
        sourceUrl: 'https://bell.tx.publicsearch.us/doc/4218-77', source: 'Bell County Clerk',
      },
      {
        type: 'Drainage Easement', description: 'A twenty (20) foot wide drainage easement across the '
          + 'southwest corner of the subject tract as shown on the recorded plat.',
        instrumentNumber: null, width: '20 feet', location: 'Southwest corner',
        sourceUrl: null, source: 'Plat Cabinet C, Slide 214-B',
      },
    ],
    restrictiveCovenants: [
      'No mobile or manufactured home shall be placed on any lot in Block 14.',
      'No structure shall be erected within twenty-five (25) feet of the front property line.',
    ],
  },
  coherence_review: {
    overall_verdict: 'needs_attention',
    overall_score: 68,
    _pass_count: 3,
    confidence_statement: 'The boundary data is usable for field work, but the 2004 chain break must be '
      + 'resolved before a final survey is signed.',
    executive_summary: 'Fourteen documents, 212 data points, three issues. The chain of title breaks at the '
      + '2004 transfer — the grantor of Vol. 5412 Pg. 233 is a partnership that does not appear as grantee '
      + 'in any prior instrument retrieved. Boundary geometry closes at 1:14,200 and the monumentation is '
      + 'consistent. The single most important thing: pull the missing 1998–2004 instruments before field work.',
    summary: 'Deed calls close at 1:14,200 with a 0.09 foot linear misclosure over 1,461.64 feet. The east '
      + 'line bearing differs from the 1961 plat by 0°14′, consistent with a datum difference rather than an '
      + 'error. Three of eight calls reference monuments that should be searched for first.',
    data_quality: {
      boundary_data: { score: 82, pass1_score: 74, adjustment: 'raised after closure computed', assessment: 'Eight calls, all with bearings and distances, closing at 1:14,200.' },
      legal_description: { score: 79, pass1_score: 79, adjustment: 'confirmed', assessment: 'Metes and bounds complete with a stated point of beginning.' },
      chain_of_title: { score: 41, pass1_score: 62, adjustment: 'lowered — pass 2 found the 2004 break', assessment: 'Four instruments with a discontinuity at the 2004 transfer.' },
      monuments: { score: 74, pass1_score: 74, adjustment: 'confirmed', assessment: 'Four corners called, two with cap stamps.' },
      coordinates: { score: 88, pass1_score: 88, adjustment: 'confirmed', assessment: 'Geocode resolved to the parcel centroid within 4 feet.' },
    },
    coherence_issues: [
      { severity: 'critical', area: 'title', title: 'Chain breaks at the 2004 transfer', description: 'The grantor of Vol. 5412 Pg. 233 (KUEHLER FAMILY PARTNERSHIP LTD) does not appear as grantee in any retrieved instrument. A conveyance between 1984 and 2004 is missing.', recommendation: 'Search the clerk index for KUEHLER between 1984 and 2004, including partnership conveyances and probate.', found_in: 'pass2' },
      { severity: 'warning', area: 'boundary', title: 'East line bearing disagrees with the plat', description: 'The 2019 deed calls N 30° 15′ 00″ E; the 1961 plat shows N 30° 01′ E. 0°14′ over 412.60 feet is 1.68 feet at the far end.', recommendation: 'Hold the found monument at the northeast corner and rotate to it.', found_in: 'both' },
      { severity: 'info', area: 'monuments', title: 'Two of four corners have cap stamps', description: 'The northeast and southwest corners are called with cap stamps; the other two are called as bare rods.', recommendation: 'Search for the stamped caps first — they are the most reliable recovery.', found_in: 'pass1' },
    ],
    pipeline_issues: [
      { severity: 'warning', category: 'timeout', title: 'TexasFile timed out on the first retry', description: 'The document retrieval step timed out once and succeeded on retry, adding 94 seconds.', suggested_fix: 'Raise the per-request timeout for TexasFile from 30s to 45s.' },
    ],
    field_survey_notes: [
      'Search first for the 1/2 inch iron rod with cap stamped "RPLS 4562" at the northeast corner — it is the only monument called consistently in both the 1961 plat and the 2019 deed.',
      'The 60d nail at the southeast corner is in the centerline of Pecan School Road and may have been destroyed by resurfacing; expect to reset from the northeast corner.',
    ],
    missing_information: [
      'The 1984–2004 conveyance into KUEHLER FAMILY PARTNERSHIP LTD, without which the chain does not connect.',
      'Any mineral reservation — none was located, which is not the same as none existing.',
    ],
    boundary_detail: {
      traverse_summary: 'Eight calls forming a closed traverse with 0.09 feet of linear misclosure over 1,461.64 feet, or 1:14,200.',
      closure_status: 'Acceptable', call_count: 8, issues_found: 1,
      critical_calls: ['N 30° 15′ 00″ E, 412.60 feet — disagrees with the 1961 plat by 0°14′'],
    },
    deed_chain_detail: {
      chain_summary: 'Four instruments from 1957 to 2019 with one discontinuity.',
      complete: false, deeds_found: 4, breaks: 1,
      missing_instruments: ['The conveyance into KUEHLER FAMILY PARTNERSHIP LTD, between 1984 and 2004'],
    },
    pass_comparison: { pass1_issues_confirmed: 2, pass2_new_issues: 1, pass1_false_alarms: 1, total_issues: 3 },
  },
};


/**
 * The project pages, whose ids are data.
 *
 * `[projectId]/page.tsx` is the 3,289-line screen this whole overhaul is about — the Review tabs,
 * the coherence panel, the easements panel, the run panel. Leaving it out because its URL contains
 * an id would have audited the twelve routes that are NOT the point and called the slice done.
 *
 * Skips rather than fails on an empty account: a guard that goes red on an empty database is a
 * guard people learn to ignore.
 */
async function firstProjectId(page: Page): Promise<string | null> {
  await page.goto(`${BASE}/admin/research`, { waitUntil: 'networkidle' });
  return page.evaluate(async () => {
    const res = await fetch('/api/admin/research');
    if (!res.ok) return null;
    const body = await res.json() as { projects?: Array<{ id: string }> };
    return body.projects?.[0]?.id ?? null;
  });
}

for (const { name, viewport, mobile } of WIDTHS) {
  test.describe(`research project pages — ${name}`, () => {
    test.use({ viewport, hasTouch: mobile, isMobile: mobile });

    test.beforeEach(async ({ page }) => { await signIn(page); });

    for (const sub of ['', '/documents', '/boundary', '/report']) {
      test(`/admin/research/[projectId]${sub || ' (hub)'}`, async ({ page }) => {
        const id = await firstProjectId(page);
        test.skip(!id, 'no research projects on this account');

        await page.goto(`${BASE}/admin/research/${id}${sub}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);

        const rendered = await page.evaluate(RENDERED_PROBE) as
          { chars: number; looksLikeLogin: boolean; heading: string };
        const result = await page.evaluate(PROBE) as {
          docScrollsSideways: boolean; scrollWidth: number; viewport: number; offenders: Offender[];
        };
        const report = result.offenders
          .map((o) => `      ${o.tag}${o.id ? '#' + o.id : ''}${o.cls ? '.' + o.cls.split(' ')[0] : ''} — ${o.width}px "${o.text}"`)
          .join('\n');

        await scrollToTheEnd(page);
        const stranded = await page.evaluate(OCCLUSION_PROBE) as
          Array<{ cls: string; text: string; by: string }>;

        console.log(
          `\n  /admin/research/[projectId]${sub} @ ${name}\n` +
          `    rendered: ${rendered.chars} chars — "${rendered.heading}"\n` +
          `    scrolls sideways: ${result.docScrollsSideways} (${result.scrollWidth} vs ${result.viewport})\n` +
          `    unrescued offenders: ${result.offenders.length}\n${report}\n` +
          `    stranded controls: ${stranded.length}` +
          stranded.map((s) => `\n      "${s.text}" under .${s.by.split(' ')[0]}`).join(''),
        );

        if (AUDIT_ONLY) return;

        expect(rendered.chars, 'the project page rendered almost nothing').toBeGreaterThan(120);
        expect(rendered.looksLikeLogin).toBe(false);
        expect(
          result.docScrollsSideways,
          `the project page${sub} scrolls sideways at ${name}: ${result.scrollWidth} vs ${result.viewport}\n${report}`,
        ).toBe(false);
        expect(stranded, `controls unreachable at ${name}`).toEqual([]);
      });
    }

    /**
     * And every Review sub-tab, which is where all thirteen extractions live.
     *
     * The tab bar is state, not a route, so nothing above ever renders `easements`, `survey` or the
     * coherence panel — the exact markup this doc spent the day rewriting. A responsive pass that
     * measures only what the default tab happens to show is a responsive pass of one eighth of the
     * screen.
     *
     * ── WHY THIS INTERCEPTS THE RESPONSE INSTEAD OF USING THE LIVE PROJECT ──────────────────────
     *
     * The Review section renders on `status: 'review'` and nothing else, and the one project on
     * this account sits at `upload`. Two ways forward, and only one of them is acceptable: advance
     * the owner's real project through the pipeline, or hand the page a project. The first writes
     * to live data to make a layout test pass, which is the kind of thing that gets a QA suite
     * banned; the second is `page.route`.
     *
     * It is also better than the live row would have been. The panels this doc rewrote render
     * nothing at all when their data is absent, so auditing against an empty run would have
     * measured eight empty tabs and reported the portal responsive. The fixture carries a coherence
     * review, a chain of title, plat analyses, FEMA and TxDOT readings, recorded easements and
     * covenants — long strings on purpose, because overflow is a function of content length and
     * short placeholder text is how a layout audit passes a layout that breaks.
     *
     * Everything else on the page still comes from the real API. This replaces one response.
     */
    test('the eight Review tabs', async ({ page }) => {
      const id = await firstProjectId(page);
      test.skip(!id, 'no research projects on this account');

      // ── FULFILLED FROM A BODY BUILT OUTSIDE THE HANDLER ──────────────────────────────────
      //
      // The first version called `route.fetch()` inside the handler to get the real row and
      // patch it. The page hung on "Loading…" and the panel never appeared — which the assertion
      // below reported honestly, rather than going green on an unrendered screen. Reading the row
      // once with `page.request` and fulfilling from a static body has no round trip inside the
      // handler and nothing to deadlock on.
      //
      // A PREDICATE, not a glob: Playwright's URL globs do not match a query string the way the
      // path part suggests, and `**/api/admin/research?id=…` silently matched nothing.
      const live = await page.request.get(`${BASE}/api/admin/research?id=${id}`);
      expect(live.ok(), 'could not read the project to build the fixture from').toBe(true);
      const liveBody = await live.json() as { project: Record<string, unknown> };
      const fixture = JSON.stringify({
        ...liveBody,
        project: {
          ...liveBody.project,
          status: 'review',
          analysis_metadata: {
            ...(liveBody.project.analysis_metadata as Record<string, unknown> ?? {}),
            ...REVIEW_FIXTURE,
          },
        },
      });

      await page.route(
        (url) => url.pathname === '/api/admin/research' && url.searchParams.get('id') === id,
        (route) => route.fulfill({ status: 200, contentType: 'application/json', body: fixture }),
      );

      await page.goto(`${BASE}/admin/research/${id}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);

      const tabs = page.locator('.review-summary-panel__tab');
      const count = await tabs.count();

      // Control: eight tabs, and a run that clicked none of them proves nothing. This is an
      // assertion rather than a skip precisely because the fixture is supposed to guarantee it —
      // if the panel is missing now, the interception stopped working and the test is measuring air.
      expect(count, 'the review panel did not render; the fixture is not reaching the page').toBe(8);

      const bad: string[] = [];
      const dim: string[] = [];
      let measured = 0;

      for (let i = 0; i < count; i++) {
        const label = (await tabs.nth(i).textContent())?.trim() ?? `tab ${i}`;
        await tabs.nth(i).click();
        await page.waitForTimeout(400);
        const r = await page.evaluate(PROBE) as {
          docScrollsSideways: boolean; scrollWidth: number; viewport: number; offenders: Offender[];
        };
        const chars = await page.evaluate(
          "(document.querySelector('.review-tab-content')?.innerText || '').trim().length",
        ) as number;

        // ── F2, THE BROWSER HALF ──────────────────────────────────────────────────────────────
        //
        // `verify:contrast` reads stylesheets and inline styles statically and reports clean over
        // 930 pairs. It still cannot see cascade, inheritance, or what a themed token resolves to —
        // it says so itself: it is a floor, not a ceiling. `check-portal-themes.mjs` is the real
        // instrument, and it walks ROUTES; the Review tabs are STATE, so it has never once
        // rendered the Easements, Survey Data or coherence panels. This is the only place they get
        // measured as painted.
        const contrast = await page.evaluate(AUDIT, { normal: 4.5, large: 3 }) as {
          pageIsDark: boolean;
          islands: Array<{ what: string; bg: string; area: number }>;
          unreadable: Array<{ what: string; ratio: number; need: number; size: number; color: string }>;
          unmeasurable: Array<{ what: string; why: string }>;
        };
        measured += 1;

        console.log(`    review tab "${label}" @ ${name}: ${chars} chars, `
          + `sideways=${r.docScrollsSideways} (${r.scrollWidth} vs ${r.viewport}), `
          + `offenders=${r.offenders.length}, `
          + `unreadable=${contrast.unreadable.length}, unmeasurable=${contrast.unmeasurable.length}`
          + r.offenders.map((o) => `\n        ${o.tag}.${o.cls.split(' ')[0]} ${o.width}px "${o.text}"`).join('')
          + contrast.unreadable.map((u) => `\n        ${u.what} ${u.ratio}:1 (need ${u.need}) ${u.color} @ ${u.size}px`).join(''));

        if (r.docScrollsSideways) {
          bad.push(`${label}: ${r.scrollWidth}px in ${r.viewport}px — `
            + r.offenders.map((o) => `${o.tag}.${o.cls.split(' ')[0]} ${o.width}px`).join(', '));
        }
        for (const u of contrast.unreadable) {
          dim.push(`${label} → ${u.what}: ${u.ratio}:1 (needs ${u.need}) — ${u.color} at ${u.size}px`);
        }
      }

      // Control: the contrast probe ran on every tab, not on none of them. An `evaluate` that
      // throws inside the page returns nothing useful and an empty findings list looks identical
      // to a clean one.
      expect(measured, 'the contrast probe did not run on every tab').toBe(count);

      if (AUDIT_ONLY) return;
      expect(bad, `Review tabs that scroll sideways at ${name}:\n  ${bad.join('\n  ')}`).toEqual([]);
      expect(dim, `Text below WCAG AA on a Review tab at ${name}:\n  ${dim.join('\n  ')}`).toEqual([]);
    });
  });
}
