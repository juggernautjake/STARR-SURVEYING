// e2e/cad-smoke.spec.ts
//
// Baseline smoke test for the CAD admin app. Confirms login works
// against the live backend and the /admin/cad shell mounts the
// expected toolbar + menu structure. Captures a full-page
// screenshot for visual review (test-results/cad-shell.png).

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('CAD shell', () => {
  test('logs in and renders the toolbar + AI menu', async ({ page }) => {
    await loginAsAdmin(page, '/admin/cad');
    await expect(page).toHaveURL(/\/admin\/cad/);

    // Toolbar should mount. Use a generic role lookup so the test
    // is resilient to icon-only buttons.
    await expect(page.locator('text=Starr CAD').first()).toBeVisible({ timeout: 20_000 });

    // AI menu in the menu bar.
    const aiMenu = page.locator('button:has-text("AI")').first();
    await expect(aiMenu).toBeVisible();

    await page.screenshot({ path: 'test-results/cad-shell.png', fullPage: true });
  });
});
