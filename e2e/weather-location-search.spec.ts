// e2e/weather-location-search.spec.ts
//
// Owner, 2026-08-06: *"We have it set to central texas, but we need to have a search function for
// locations in the US. We need to be able to see the weather in any county or city in the USA."*
//
// Driven in a real browser rather than asserted against source, because the failure modes that
// matter here are interaction ones: a listbox that closes before the click lands, a debounce that
// races, a chosen place that never reaches the fetch. This repo has a documented history of shipping
// components that are whole and unreachable — a rendering test would not have caught any of them.
//
// Run:  E2E_BASE_URL=http://localhost:3021 npx playwright test e2e/weather-location-search.spec.ts
//
// Needs a session. `AUTH_SECRET` is read from .env.local and a token minted directly, because the
// login form needs real credentials and this suite should not.

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from '@auth/core/jwt';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3021';

async function signIn(page: Page) {
  const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const m = env.match(/^AUTH_SECRET\s*=\s*(.+)$/m);
  if (!m) throw new Error('AUTH_SECRET missing from .env.local');
  const secret = m[1].replace(/^["']|["']$/g, '').trim();

  const token = await encode({
    token: { email: process.env.E2E_LOGIN_EMAIL || 'jacobmaddux96@gmail.com', name: 'E2E', sub: 'e2e' },
    secret,
    salt: 'authjs.session-token',
    maxAge: 3600,
  });

  const url = new URL(BASE);
  // `addCookies`, not `document.cookie` — the session cookie is httpOnly.
  await page.context().addCookies([{
    name: 'authjs.session-token',
    value: token,
    domain: url.hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
}

test.describe('weather location search', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test('searching a city loads that city’s forecast and puts it in the URL', async ({ page }) => {
    await page.goto(`${BASE}/admin/weather`);
    // Scoped to `main`: the admin shell's top bar renders its own <h1>Weather</h1>, so an unscoped
    // role query matches two elements and fails strict mode.
    await expect(page.getByRole('main').getByRole('heading', { name: 'Weather', level: 1 })).toBeVisible();

    const input = page.getByTestId('weather-location-input');
    await input.fill('killeen');

    const options = page.getByTestId('weather-location-option');
    await expect(options.first()).toBeVisible({ timeout: 10_000 });
    await expect(options.first()).toContainText('Killeen');
    await options.first().click();

    // The location must reach the URL, so the view is shareable and survives a refresh.
    await expect(page).toHaveURL(/lat=.*lon=.*label=/);
    await expect(page.getByText(/Killeen/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('a county is reachable — the thing a ZIP-only page could not do', async ({ page }) => {
    await page.goto(`${BASE}/admin/weather`);
    const input = page.getByTestId('weather-location-input');
    await input.fill('bell county texas');

    const options = page.getByTestId('weather-location-option');
    await expect(options.first()).toBeVisible({ timeout: 10_000 });
    // County hits carry the COUNTY badge; the geocoder alone would have offered a park here.
    await expect(options.first()).toContainText('Bell County');
    await expect(options.first()).toContainText('Texas');
    await options.first().click();

    await expect(page.getByText('Bell County, Texas').first()).toBeVisible({ timeout: 10_000 });
    // A real forecast rendered, not just the label.
    await expect(page.getByRole('heading', { name: '5-day forecast' })).toBeVisible();
  });

  test('keyboard alone can pick a place', async ({ page }) => {
    await page.goto(`${BASE}/admin/weather`);
    const input = page.getByTestId('weather-location-input');
    await input.fill('anchorage');
    await expect(page.getByTestId('weather-location-option').first()).toBeVisible({ timeout: 10_000 });
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(page).toHaveURL(/lat=/);
    await expect(page.getByText(/Anchorage/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('a searched place is remembered as a recent chip', async ({ page }) => {
    await page.goto(`${BASE}/admin/weather`);
    await page.getByTestId('weather-location-input').fill('miami');
    await expect(page.getByTestId('weather-location-option').first()).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('weather-location-option').first().click();
    await expect(page.getByText(/Miami/).first()).toBeVisible({ timeout: 10_000 });

    await page.goto(`${BASE}/admin/weather`);
    await expect(page.getByRole('button', { name: /Miami/ })).toBeVisible();
  });

  test('nonsense says so instead of silently showing Central Texas', async ({ page }) => {
    await page.goto(`${BASE}/admin/weather`);
    await page.getByTestId('weather-location-input').fill('zzzznotaplace');
    await expect(page.getByTestId('weather-location-empty')).toBeVisible({ timeout: 10_000 });
  });

  test('a shared /admin/weather?lat=&lon= link opens that place', async ({ page }) => {
    // Anchorage. If the coordinates were ignored the page would say Central Texas — which is exactly
    // what it did for every non-ZIP location before this change.
    await page.goto(`${BASE}/admin/weather?lat=61.1743&lon=-149.2843&label=${encodeURIComponent('Anchorage, Alaska')}`);
    await expect(page.getByText('Anchorage, Alaska').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Central Texas')).toHaveCount(0);
  });
});
