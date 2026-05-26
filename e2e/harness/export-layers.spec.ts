// e2e/harness/export-layers.spec.ts — export-by-layers dialog.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §5

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('Export layers dialog lists layers and formats', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.locator('button:has-text("File")').first().click();
  await page.locator('text=Export').first().click();
  await page.locator('text=Export layers').first().click();

  await expect(page.locator('h2:has-text("Export layers")')).toBeVisible();
  await expect(page.locator('input[name="fmt"]')).toHaveCount(3);
  await expect(page.locator('button:has-text("Export (")')).toBeVisible();

  await shot(page, 'export-layers');
});
