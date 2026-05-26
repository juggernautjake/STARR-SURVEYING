// e2e/harness/export-selection.spec.ts — Slice 7: scoped-export menu items.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('File ▸ Export exposes selection-scoped export items', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.locator('button:has-text("File")').first().click();
  await page.locator('text=Export').first().click();

  await expect(page.locator('text=Export selection as CSV')).toBeVisible();
  await expect(page.locator('text=Export selection as DXF')).toBeVisible();
  await expect(page.locator('text=Export selection as LandXML')).toBeVisible();

  await shot(page, 'export-selection-menu');
});
