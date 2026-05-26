// e2e/harness/status-toggles.spec.ts — StatusBar Snap/Grid toggles work.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('StatusBar Snap and Grid toggles flip state', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Snap starts ON → click → OFF → click → ON.
  await expect(page.getByText('Snap: ON', { exact: true })).toBeVisible();
  await page.getByText('Snap: ON', { exact: true }).click();
  await expect(page.getByText('Snap: OFF', { exact: true })).toBeVisible();
  await page.getByText('Snap: OFF', { exact: true }).click();
  await expect(page.getByText('Snap: ON', { exact: true })).toBeVisible();

  // Grid starts OFF → click → ON.
  await expect(page.getByText('Grid: OFF', { exact: true })).toBeVisible();
  await page.getByText('Grid: OFF', { exact: true }).click();
  await expect(page.getByText('Grid: ON', { exact: true })).toBeVisible();

  await shot(page, 'status-toggles');
});
