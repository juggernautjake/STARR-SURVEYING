// e2e/harness/point-viewer.spec.ts — Slice 10c: Point Data Viewer opens.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §10

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('Point Data Viewer opens from the View menu', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.locator('button:has-text("View")').first().click();
  // "Point Data Viewer" lives under the "Data tables & viewers" submenu.
  await page.getByText('Data tables & viewers').hover();
  await page.locator('text=Point Data Viewer').first().click();

  await expect(page.locator('text=Point Data').first()).toBeVisible();
  // Per-layer tab strip (the "All" tab is always present).
  await expect(page.locator('button[title="Show points from every layer"]')).toBeVisible();
  await expect(page.locator('button:has-text("Columns")')).toBeVisible();

  await shot(page, 'point-viewer');
});
