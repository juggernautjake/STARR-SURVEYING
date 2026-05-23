// e2e/cad-close-drawing.spec.ts
//
// CAD_POINTS_AND_AI slice G — opens the Close Drawing dialog and
// confirms the empty-selection guidance renders. The full Bowditch
// preview flow requires a polyline-with-misclosure fixture and is
// covered by the geometry unit tests
// (__tests__/cad/geometry/vertex-closure.test.ts).
//
// Deployment gate: this test exercises code introduced in slice E
// of this branch. It will go green once the branch merges + the
// deployment ships.

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('Close Drawing dialog', () => {
  test('opens via the event channel and surfaces the no-selection hint', async ({ page }) => {
    await loginAsAdmin(page, '/admin/cad');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openCloseDrawingDialog')));

    const hint = page.locator('text=Select a polyline or polygon feature first').first();
    await expect(hint).toBeVisible({ timeout: 5_000 });

    // Suggest button should be disabled when no polyline is selected.
    const suggest = page.getByTestId('closure-suggest');
    await expect(suggest).toBeDisabled();
  });
});
