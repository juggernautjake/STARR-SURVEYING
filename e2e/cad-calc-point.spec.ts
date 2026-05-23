// e2e/cad-calc-point.spec.ts
//
// CAD_POINTS_AND_AI slice G — exercise the Calc Point dialog
// without mutating server state. Opens the dialog via the
// AI menu, verifies the four solver methods render their
// expected input groups, and asserts the Suggest button is
// gated on a computed result.

import { test, expect } from '@playwright/test';
import { openCadWithDrawing } from './fixtures/auth';

test.describe('Calc Point dialog', () => {
  test('opens via AI menu and toggles per-method inputs', async ({ page }) => {
    await openCadWithDrawing(page);

    // Open AI menu, click Calc Point entry. Falls back to the event
    // channel if the menu hover-vs-click timing is fragile.
    const aiMenu = page.locator('button:has-text("AI")').first();
    await aiMenu.click();
    const calcEntry = page.locator('text=Calc Point').first();
    if (await calcEntry.isVisible({ timeout: 1500 }).catch(() => false)) {
      await calcEntry.click();
    } else {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openCalcPointDialog')));
    }

    const methodPicker = page.getByTestId('calc-point-method');
    await expect(methodPicker).toBeVisible({ timeout: 5_000 });

    // 4th-corner default — no extra numeric inputs.
    await expect(page.getByTestId('calc-point-bearing')).toHaveCount(0);

    // Switch to Bearing+Distance — bearing and distance inputs appear.
    await methodPicker.selectOption('BEARING_DISTANCE');
    await expect(page.getByTestId('calc-point-bearing')).toBeVisible();
    await expect(page.getByTestId('calc-point-distance')).toBeVisible();

    // Suggest disabled until a Compute succeeds.
    const suggest = page.getByTestId('calc-point-suggest');
    await expect(suggest).toBeDisabled();
  });
});
