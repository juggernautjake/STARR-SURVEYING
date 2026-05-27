// e2e/harness/point-viewer-menu.spec.ts — right-click a point in the Point
// Data Viewer for send-to-layer / layers-containing / delete actions.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('right-click a point row exposes command actions and can delete it', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(150);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b1 pts\\b/')).toBeVisible({ timeout: 8000 });

  // Right-click the point row.
  await page.locator('tbody tr').first().click({ button: 'right' });
  await expect(page.getByText('Send to layer', { exact: true })).toBeVisible();
  await expect(page.getByText('Layers containing this point', { exact: true })).toBeVisible();
  const del = page.getByText('Delete point', { exact: true });
  await expect(del).toBeVisible();
  await shot(page, 'point-viewer-menu');

  // Delete removes the point.
  await del.click();
  await expect(page.locator('text=/\\b0 pts\\b/')).toBeVisible({ timeout: 8000 });
});
