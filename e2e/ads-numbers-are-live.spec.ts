// e2e/ads-numbers-are-live.spec.ts — A3. The four numbers the owner asked for, against the real API.
//
// Owner: *"I want the advertising analysis elements to show all of the results for spending and
// conversions and clicks and impressions and all of that info for the current month by default."*
//
// ── WHY THIS TEST EXISTS AND WHAT IT WOULD HAVE CAUGHT ──────────────────────────────────────────
//
// Before A3, `ad_spend_daily` had ZERO rows while the live account had been spending money for
// twelve days. Nothing failed. The nightly cron ran, called a Google API version that had been
// retired, logged a failure into Vercel's cron output, and returned 200. The dashboard rendered a
// confident "$0 ad spend" — which is not "we have no data", it is a claim that no money was spent.
//
// A unit test cannot catch that: the parser was right, the table was right, the query was right. The
// only thing that was wrong was reachable exclusively by making a real request. So this spec makes
// one, through the app's own route, with the app's own credentials.
//
// ── IT ASSERTS SHAPE AND HONESTY, NOT AMOUNTS ───────────────────────────────────────────────────
//
// Spend changes every day, so asserting "$183.94" would fail tomorrow for a reason that is not a
// defect. What is pinned instead is the set of invariants that were actually broken or at risk:
//
//   * the import path reaches Google and returns rows (not a retired version, not a 403);
//   * clicks never exceed impressions — the sign that two metrics got crossed;
//   * derived ratios are null, not zero, when their denominator is empty;
//   * the page renders each of the four headline labels.

import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import { encode } from '@auth/core/jwt';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3010';
const ADMIN = 'jacobmaddux@starr-surveying.com';

function secret(): string {
  const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  return env.match(/^AUTH_SECRET\s*=\s*(.+)$/m)![1].replace(/^["']|["']$/g, '').trim();
}

async function adminContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  const token = await encode({
    token: { email: ADMIN, name: 'E2E', sub: 'e2e' },
    secret: secret(),
    salt: 'authjs.session-token',
    maxAge: 3600,
  });
  await ctx.addCookies([{
    name: 'authjs.session-token', value: token,
    domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax',
  }]);
  return ctx;
}

/** First day of the current month — the range the page defaults to. */
function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
const today = (): string => new Date().toISOString().slice(0, 10);

test.describe('A3 — the advertising numbers are real', () => {
  test('the refresh route imports this month from Google', async ({ browser }) => {
    const ctx = await adminContext(browser);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/marketing`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async ({ from, to }) => {
      const res = await fetch('/api/admin/marketing/spend/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      return { status: res.status, body: await res.json() };
    }, { from: monthStart(), to: today() });

    expect(result.status).toBe(200);
    // A retired API version and a refused login-customer-id both land here. Both were live defects.
    expect(result.body.error, `the import failed: ${result.body.error}`).toBeUndefined();
    expect(result.body.imported, 'Google returned no rows at all').toBeGreaterThan(0);
    // The range reaches today, which Google is still counting — the page has to say so.
    expect(result.body.includesToday).toBe(true);

    await ctx.close();
  });

  test('the dashboard serves impressions, clicks, conversions and spend', async ({ browser }) => {
    const ctx = await adminContext(browser);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/marketing`, { waitUntil: 'domcontentloaded' });

    const { status, body } = await page.evaluate(async ({ from, to }) => {
      const res = await fetch(`/api/admin/marketing/dashboard?from=${from}&to=${to}`);
      return { status: res.status, body: await res.json() };
    }, { from: monthStart(), to: today() });

    expect(status).toBe(200);
    const p = body.performance;
    expect(p, 'the dashboard returned no performance block').toBeTruthy();

    // Real activity, from the import above.
    expect(p.impressions).toBeGreaterThan(0);
    expect(p.costMicros).toBeGreaterThan(0);

    // Crossing two metrics is the failure that produces a plausible wrong number rather than an
    // error: a 500% click-through rate reads as a formatting bug long before anyone suspects the
    // fields were swapped.
    expect(p.clicks).toBeLessThanOrEqual(p.impressions);
    expect(p.ctr).toBeLessThanOrEqual(1);

    // "— is an answer, 0% is a claim." This account has recorded no conversions, so cost-per-
    // conversion must be null. A zero here would read as "every conversion is free".
    if (p.conversions === 0) expect(p.costPerConversion).toBeNull();

    // A series to draw and campaigns to rank — A5 builds on both.
    expect(Array.isArray(body.daily)).toBe(true);
    expect(body.campaigns.length).toBeGreaterThan(0);

    await ctx.close();
  });

  test('the page shows all four headline numbers', async ({ browser }) => {
    const ctx = await adminContext(browser);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/marketing`, { waitUntil: 'domcontentloaded' });

    const panel = page.getByTestId('mk-performance');
    // A hard wait, not `isVisible()`: that call does not auto-wait, so a test written on it skips
    // itself and reports green while asserting nothing.
    await expect(panel).toBeVisible({ timeout: 30_000 });

    for (const label of ['spent', 'impressions', 'clicks', 'conversions']) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(panel.getByText('click-through rate')).toBeVisible();
    await expect(panel.getByText('per click')).toBeVisible();

    await ctx.close();
  });

  test('the tiles do not push the page sideways at 360px', async ({ browser }) => {
    // M4's rule, applied to the panel this slice adds: four KPI tiles reflow to two rows of two on a
    // phone. The failure mode is a fixed four-column grid, which fits on a laptop and silently gives
    // the whole admin shell a horizontal scrollbar on a phone.
    const ctx = await adminContext(browser);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${BASE}/admin/marketing`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('mk-performance')).toBeVisible({ timeout: 30_000 });

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);

    await ctx.close();
  });
});
