// e2e/dialog-fits-the-screen.spec.ts
//
// Owner, 2026-08-11: *"when assigning roles to someone, I am not able to scroll to see all of the
// roles and I cannot see the button to actually save/assign the role to that person."*
//
// Asserted in a browser because the whole bug is layout arithmetic against a real viewport: eleven
// role cards is about 800px of content, a phone viewport is about 660px, and the dialog had no
// height cap inside a `position: fixed` overlay — so the overflow went off BOTH ends and no gesture
// could reach the Save button. A unit test cannot see any of that.
//
// The assertion is deliberately about REACHABILITY, not about pixels: the button must be inside the
// viewport, and every role must be scrollable into view. Pinning exact heights would make this fail
// the next time somebody adds a role, which is the opposite of what it is for.
//
// Run:  E2E_BASE_URL=http://localhost:3045 npx playwright test e2e/dialog-fits-the-screen.spec.ts

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from '@auth/core/jwt';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3045';

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

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.describe('the Edit Roles dialog fits a phone', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test('Save Roles is on screen, and every role can be scrolled to', async ({ page }) => {
    // `networkidle`, not `domcontentloaded`. The user list is fetched after hydration, and with
    // `domcontentloaded` this raced it: the table was intermittently still empty when the assertion
    // below ran. Waiting for the DOM says nothing about whether the data arrived.
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' });

    // The mobile path, which is the one under test. At 390px the table's action column is hidden by
    // AdminUsers.css, so the icon button in the row is present in the DOM but not visible — you tap
    // the row to expand it, and the labelled "Edit Roles" button is inside that panel. Driving the
    // desktop control instead would have tested a control a phone cannot reach.
    // A HARD assertion, not a skip.
    //
    // This started as `test.skip(!visible, 'no user rows here')` and that was a mistake worth
    // recording. `isVisible()` does not auto-wait — it answers about the DOM at that instant, and
    // the user list arrives from a fetch — so it returned false every time and the test skipped
    // ITSELF, reporting green while asserting nothing. Then, once that was fixed, the same skip
    // swallowed a genuine failure during a red-test.
    //
    // A skip that reads as a pass is worse than a failure. The environment this runs against has
    // users; if the rows do not arrive, that is a real problem and the test should say so.
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow, 'no user rows loaded — the roles dialog cannot be opened')
      .toBeVisible({ timeout: 20_000 });
    await firstRow.tap();

    const editButton = page.getByRole('button', { name: 'Edit Roles', exact: true }).first();
    await expect(editButton).toBeVisible({ timeout: 10_000 });

    // Opens the dialog and nothing else. This test NEVER clicks Save or Cancel: it is asserting
    // layout against a live admin account, and a role-mutating click here would change a real
    // person's access.
    await editButton.tap();

    const dialog = page.locator('.admin-dialog');
    await expect(dialog).toBeVisible();

    // 1. The dialog itself never exceeds the viewport.
    const vh = page.viewportSize()!.height;
    const box = (await dialog.boundingBox())!;
    expect(box.height, 'the dialog is taller than the screen').toBeLessThanOrEqual(vh);
    expect(box.y, 'the dialog starts above the top of the screen').toBeGreaterThanOrEqual(0);

    // 2. The Save button — the actual complaint — is inside the viewport WITHOUT scrolling
    //    anything. This is what the pinned footer buys.
    const save = page.getByRole('button', { name: /save roles/i });
    const saveBox = (await save.boundingBox())!;
    expect(saveBox.y + saveBox.height, 'the Save button is below the bottom of the screen')
      .toBeLessThanOrEqual(vh);
    expect(saveBox.y, 'the Save button is above the top of the screen').toBeGreaterThanOrEqual(0);

    // 3. The role list scrolls internally rather than being clipped — the other half of the report
    //    ("not able to scroll to see all of the roles").
    const body = page.locator('.admin-dialog__body');
    const metrics = await body.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
    }));
    expect(metrics.overflowY, 'the dialog body does not scroll').toMatch(/auto|scroll/);
    if (metrics.scrollHeight > metrics.clientHeight) {
      // Only meaningful when the content actually overflows; if a future viewport fits all the
      // roles, there is nothing to scroll and nothing to assert.
      await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const scrolled = await body.evaluate((el) => el.scrollTop);
      expect(scrolled, 'the body would not scroll to its end').toBeGreaterThan(0);

      // And the footer is STILL on screen after scrolling to the bottom of the list.
      const saveAfter = (await save.boundingBox())!;
      expect(saveAfter.y + saveAfter.height).toBeLessThanOrEqual(vh);
    }
  });
});
