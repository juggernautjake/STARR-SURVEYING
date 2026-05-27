// e2e/harness/point-viewer-collapse.spec.ts — the Point Data viewer is a
// single dock that's always available at the bottom and collapses to a bar.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('Point Data viewer is always available and collapsible', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Collapsed bar is present by default (always available at the bottom).
  const bar = page.getByRole('button', { name: /Point Data/ });
  await expect(bar).toBeVisible();

  // Expand it → the full viewer toolbar appears.
  await bar.click();
  await expect(page.getByText('Point Data', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder(/Search/)).toBeVisible();
  await shot(page, 'point-viewer-expanded');

  // Collapse it again via the viewer's close control → back to the bar.
  await page.getByRole('button', { name: 'Close point data viewer' }).click();
  await expect(page.getByRole('button', { name: /Point Data/ })).toBeVisible();
});
