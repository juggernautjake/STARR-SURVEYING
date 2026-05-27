// e2e/harness/point-viewer-bulk.spec.ts — multi-select points in the Point
// Data Viewer and run a bulk action (delete).
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('select multiple points and bulk-delete them', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw two points.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height * 0.45);
  await page.waitForTimeout(120);
  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.55);
  await page.waitForTimeout(120);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b2 pts\\b/')).toBeVisible({ timeout: 8000 });

  // Select all visible points via the header checkbox (one click, robust to
  // the bulk bar shifting rows in a short panel).
  await expect(page.locator('tbody input[aria-label^="Select point"]')).toHaveCount(2);
  await page.locator('thead input[aria-label="Select all visible points"]').check();

  // Bulk bar shows with actions.
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask AI' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  await shot(page, 'point-viewer-bulk');

  // Bulk delete removes both points.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('text=/\\b0 pts\\b/')).toBeVisible({ timeout: 8000 });
});
