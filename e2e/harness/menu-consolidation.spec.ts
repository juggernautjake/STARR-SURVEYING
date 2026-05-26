// e2e/harness/menu-consolidation.spec.ts — consolidated submenus.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md
// (menu / dropdown consolidation)

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('View has a Data tables & viewers submenu', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.locator('button:has-text("View")').first().click();
  await page.locator('text=Data tables & viewers').first().click();
  await expect(page.getByText('Point Data Viewer (editable)')).toBeVisible();
  await expect(page.getByText('Traverse Viewer (line/curve data)')).toBeVisible();
  await shot(page, 'menu-view-data');
});

test('File has a Review & Delivery submenu', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.locator('button:has-text("File")').first().click();
  await page.locator('text=Review & Delivery').first().click();
  await expect(page.getByText('Survey description…')).toBeVisible();
  await expect(page.getByText('RPLS review mode…')).toBeVisible();
});
