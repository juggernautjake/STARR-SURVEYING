// e2e/rail-flyout-scroll.spec.ts
//
// Owner, 2026-08-06: *"whenever we hover over a navmenu link and the popup with all of the submenu
// items pops up, we can scroll up and down the submenu pop up to see all of the items on it."*
//
// The fly-out had no height cap. Money carries 25 registered routes and Office 20, so on a laptop
// those menus rendered taller than the window with their last entries below the fold — and an
// absolutely-positioned overlay does not scroll with the page, so those routes could not be reached
// from the rail at all.
//
// Asserted in a browser because every part of this is layout: whether the element overflows, whether
// it scrolls, and whether it stays on screen are all things only a real viewport can answer.
//
// Run:  E2E_BASE_URL=http://localhost:3021 npx playwright test e2e/rail-flyout-scroll.spec.ts

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
      // A hand-minted token skips `populateSaasContext`, which is what normally resolves staff
      // status at sign-in. Without these the rail hides every `internalOnly` route — which is most
      // of Money — and the menus under test never overflow.
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

/** Hover a workspace icon and wait for its fly-out. The rail opens on a 200 ms delay. */
async function openFlyout(page: Page, workspace: string) {
  await page.locator(`[data-workspace="${workspace}"]`).hover();
  const flyout = page.getByTestId(`flyout-${workspace}`);
  await expect(flyout).toBeVisible({ timeout: 5000 });
  return flyout;
}

test.describe('workspace fly-out scrolling', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  // A short viewport is the whole point — on a tall monitor the bug hides. 620px also guarantees
  // overflow regardless of which routes this identity can see, so the suite does not silently stop
  // testing anything if the registry shrinks or role gating changes.
  test.use({ viewport: { width: 1280, height: 620 } });

  test('the Knowledge fly-out fits on screen and scrolls to its last item', async ({ page }) => {
    await page.goto(`${BASE}/admin/me`);
    const flyout = await openFlyout(page, 'knowledge');

    const box = (await flyout.boundingBox())!;
    // Cardinal requirement: the menu is inside the window.
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(620 + 1);

    const list = flyout.locator('.admin-rail__flyout-list');
    const { scrollHeight, clientHeight } = await list.evaluate((el) => ({
      scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    }));
    // If this workspace ever stops overflowing, the test is no longer exercising anything.
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    // The list actually scrolls, and the final entry can be reached.
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const scrolled = await list.evaluate((el) => el.scrollTop);
    expect(scrolled).toBeGreaterThan(0);

    const lastLink = list.locator('a').last();
    await expect(lastLink).toBeInViewport();
  });

  test('scrolling the fly-out does not close it', async ({ page }) => {
    await page.goto(`${BASE}/admin/me`);
    const flyout = await openFlyout(page, 'knowledge');
    await flyout.locator('.admin-rail__flyout-list').evaluate((el) => { el.scrollTop = 200; });
    await page.waitForTimeout(500);          // longer than the 220 ms hide grace
    await expect(flyout).toBeVisible();
  });

  test('the header stays visible while the list scrolls', async ({ page }) => {
    await page.goto(`${BASE}/admin/me`);
    const flyout = await openFlyout(page, 'knowledge');
    await flyout.locator('.admin-rail__flyout-list').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(flyout.locator('.admin-rail__flyout-title')).toBeInViewport();
  });

  test('a low rail icon opens upward rather than off the bottom', async ({ page }) => {
    await page.goto(`${BASE}/admin/me`);
    // Office is the lowest workspace icon this identity can see, so it has the least room below it.
    const flyout = await openFlyout(page, 'office');
    const box = (await flyout.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(620 + 1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
  });

});

test.describe('workspace fly-out on a tall screen', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  // The cap must not become a permanent scrollbar. On a monitor with room to spare, a menu that fits
  // should render at its natural height — otherwise this fix would have traded an unreachable menu
  // for a needlessly cramped one.
  test.use({ viewport: { width: 1280, height: 1400 } });

  test('a menu that fits is not given a scrollbar it does not need', async ({ page }) => {
    await page.goto(`${BASE}/admin/me`);
    const flyout = await openFlyout(page, 'hub');
    const list = flyout.locator('.admin-rail__flyout-list');
    const { scrollHeight, clientHeight } = await list.evaluate((el) => ({
      scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
  });
});
