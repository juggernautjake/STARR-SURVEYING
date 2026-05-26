// e2e/harness/dialogs-smoke.spec.ts — key dialogs open without error.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md
// (per-surface audit: dialogs sweep)

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

test('Curve Calculator opens from the Survey menu', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.locator('button:has-text("Survey")').first().click();
  await page.locator('text=Curve Calculator').first().click();

  // The solve-mode select (with R + Δ options) should be visible.
  await expect(page.locator('select:has(option[value="R_DELTA"])')).toBeVisible({ timeout: 8000 });
});

test('Settings dialog opens from Help', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.locator('button:has-text("Help")').first().click();
  await page.locator('text=Settings & Preferences').first().click();
  await expect(page.getByText(/settings/i).first()).toBeVisible({ timeout: 8000 });
});
