// e2e/cad-menu-smoothness.spec.ts
//
// AI Drawing Assistant plan — Phase 7 (visual verification, locally
// runnable). Covers the menu-UX fix: dropdown menus stay open when the
// cursor merely leaves them and close only on item-select or an outside
// click. Also confirms the AI drawing chat opens from the AI menu.
//
// Run locally against a deployment:
//   E2E_BASE_URL=… E2E_LOGIN_EMAIL=… E2E_LOGIN_PASSWORD=… npx playwright test cad-menu-smoothness
// (Not executed in CI here — no dev server / browser in the build env.)

import { test, expect } from '@playwright/test';
import { openCadWithDrawing } from './fixtures/auth';

test.describe('Menu smoothness', () => {
  test('File menu stays open when the cursor leaves it, closes on outside click', async ({ page }) => {
    await openCadWithDrawing(page);

    await page.locator('button:has-text("File")').first().click();
    const item = page.locator('text=New Drawing').first();
    await expect(item).toBeVisible({ timeout: 5_000 });

    // Move the cursor well away from the menu (previously this auto-closed it).
    await page.mouse.move(700, 600);
    await page.waitForTimeout(300);
    await expect(item).toBeVisible(); // still open — the fix

    // An outside click (the click-away overlay) closes it.
    await page.mouse.click(700, 600);
    await expect(item).toBeHidden({ timeout: 5_000 });
  });

  test('Export submenu reveals on hover within the open File menu', async ({ page }) => {
    await openCadWithDrawing(page);
    await page.locator('button:has-text("File")').first().click();
    await page.locator('text=Export').first().hover();
    await expect(page.locator('text=Export as DXF').first()).toBeVisible({ timeout: 5_000 });
    await page.mouse.click(700, 600); // close
  });

  test('AI drawing chat opens from the AI menu', async ({ page }) => {
    await openCadWithDrawing(page);
    await page.locator('button:has-text("AI")').first().click();
    await page.locator('text=AI drawing chat').first().click();
    await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5_000 });
  });
});
