// e2e/sidebar-one-tap.spec.ts
//
// Owner, 2026-08-11: *"please make it so that it just takes one tap always to open the sidebar
// navmenu and not two. Right now I have to tap it twice for it to open. I should only have to tap
// it once."*
//
// Asserted in a browser because every candidate cause is a browser fact: whether a first tap is
// swallowed by a hover state, whether an invisible overlay is sitting on the button, whether the
// drawer opens and is then painted underneath something. None of those are visible in a diff, and a
// unit test of `setSidebarOpen` would pass while the phone still needs two taps.
//
// Run:  E2E_BASE_URL=http://localhost:3021 npx playwright test e2e/sidebar-one-tap.spec.ts

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from '@auth/core/jwt';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3021';

async function signIn(page: Page) {
  const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const secret = env.match(/^AUTH_SECRET\s*=\s*(.+)$/m)![1].replace(/^["']|["']$/g, '').trim();
  const token = await encode({
    token: {
      email: process.env.E2E_LOGIN_EMAIL || 'jacobmaddux96@gmail.com',
      name: 'E2E', sub: 'e2e',
      roles: ['admin'],
      isCompanyUser: true,
      memberships: [{ orgId: 'e2e-org' }],
    },
    secret, salt: 'authjs.session-token', maxAge: 3600,
  });
  await page.context().addCookies([{
    name: 'authjs.session-token', value: token,
    domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax',
  }]);
}

// A real phone viewport. The drawer only exists below 1024px — on a desktop width the hamburger is
// `display:none` and there is nothing to test.
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.describe('sidebar drawer opens on the first tap', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test('one tap opens it, and it can be closed again', async ({ page }) => {
    await page.goto(`${BASE}/admin/me`, { waitUntil: 'domcontentloaded' });

    const hamburger = page.locator('.admin-topbar__hamburger');
    const drawer = page.locator('aside.admin-sidebar');
    await expect(hamburger).toBeVisible({ timeout: 20_000 });

    // Closed to begin with: translated fully off-screen to the left.
    const boxBefore = await drawer.boundingBox();
    expect(boxBefore?.x ?? -999).toBeLessThan(0);

    // ONE tap. `tap()` rather than `click()` so this exercises the touch event sequence a phone
    // actually sends — a first tap swallowed by a hover state only reproduces under touch.
    await hamburger.tap();
    await page.waitForTimeout(500); // the drawer has a 0.3s transform transition

    const boxAfter = await drawer.boundingBox();
    expect(
      boxAfter?.x ?? -999,
      'the drawer is still off-screen after ONE tap — this is the two-tap bug',
    ).toBeGreaterThanOrEqual(0);

    // And it must be closable. NOT via the hamburger: the drawer deliberately stacks above the top
    // bar (see the other test), so the hamburger is underneath it while open. That is the normal
    // shape for a mobile drawer, and it is why the drawer carries its own close button — a menu you
    // can open and not obviously close is worse than the bug this test was written for.
    await page.locator('.admin-sidebar__close').tap();
    await page.waitForTimeout(500);
    const boxClosed = await drawer.boundingBox();
    expect(boxClosed?.x ?? -999).toBeLessThan(0);

    // The dimmed area is the other way out, and it must work too — it is the one most people reach
    // for by habit.
    await hamburger.tap();
    await page.waitForTimeout(500);
    await page.locator('.admin-sidebar-overlay--active').tap({ position: { x: 340, y: 500 } });
    await page.waitForTimeout(500);
    expect((await drawer.boundingBox())?.x ?? -999).toBeLessThan(0);
  });

  test('the drawer is not painted underneath the top bar', async ({ page }) => {
    // Found while diagnosing the tap bug: `.admin-topbar` is z-index 200 and `.admin-sidebar` is 50,
    // so the open drawer slides UNDER the bar. Its header — the logo and the "Starr Surveying"
    // brand, which is also the link to the Hub — is covered on every phone.
    await page.goto(`${BASE}/admin/me`, { waitUntil: 'domcontentloaded' });
    const hamburger = page.locator('.admin-topbar__hamburger');
    await expect(hamburger).toBeVisible({ timeout: 20_000 });
    await hamburger.tap();
    await page.waitForTimeout(500);

    const topbarZ = await page.locator('.admin-topbar').evaluate(
      (el) => Number(getComputedStyle(el).zIndex) || 0,
    );
    const drawerZ = await page.locator('aside.admin-sidebar').evaluate(
      (el) => Number(getComputedStyle(el).zIndex) || 0,
    );
    expect(drawerZ, 'the open drawer must stack above the top bar').toBeGreaterThan(topbarZ);
  });
});
