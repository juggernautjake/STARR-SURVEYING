// e2e/cad-sketch-reconcile.spec.ts
//
// CAD_POINTS_AND_AI slice G — opens the Sketch Reconciliation
// dialog and confirms its controls render + the Analyze/Suggest
// buttons are correctly gated before a file is chosen. The actual
// Vision call is not exercised here (it costs tokens + needs a
// real sketch); the response parser is unit-tested in
// __tests__/cad/ai/sketch-reconcile.test.ts.

import { test, expect } from '@playwright/test';
import { openCadWithDrawing } from './fixtures/auth';

test.describe('Sketch Reconciliation dialog', () => {
  test('opens via the event channel and gates Analyze/Suggest', async ({ page }) => {
    await openCadWithDrawing(page);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openSketchReconcileDialog')));

    // File input + notes textarea render.
    await expect(page.getByTestId('sketch-file')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('sketch-notes')).toBeVisible();

    // Analyze disabled until a file is chosen; Suggest disabled
    // until a result comes back.
    await expect(page.getByTestId('sketch-analyze')).toBeDisabled();
    await expect(page.getByTestId('sketch-suggest')).toBeDisabled();
  });
});
