// e2e/harness/point-viewer.spec.ts — Slice 10c: Point Data Viewer opens.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §10

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('Point Data Viewer opens from the View menu', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.locator('button:has-text("View")').first().click();
  await page.locator('text=Point Data Viewer').first().click();

  await expect(page.locator('text=Point Data').first()).toBeVisible();
  await expect(page.locator('select[title="Filter by layer"]')).toBeVisible();
  await expect(page.locator('button:has-text("Columns")')).toBeVisible();

  await shot(page, 'point-viewer');
});
