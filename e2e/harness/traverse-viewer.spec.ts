// e2e/harness/traverse-viewer.spec.ts — Slice 10e: Traverse Viewer opens.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §10

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('Traverse Viewer opens from the View menu', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.locator('button:has-text("View")').first().click();
  await page.locator('text=Traverse Viewer').first().click();

  await expect(page.locator('text=Traverse Data').first()).toBeVisible();
  await expect(page.locator('th:has-text("Bearing")')).toBeVisible();
  await expect(page.locator('th:has-text("Radius")')).toBeVisible();

  await shot(page, 'traverse-viewer');
});
