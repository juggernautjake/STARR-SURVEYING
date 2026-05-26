// e2e/harness/undo-button.spec.ts — toolbar Undo button works.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('toolbar Undo button reverts the last edit', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw a point.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(150);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b1 pts\\b/')).toBeVisible({ timeout: 8000 });

  // Click the toolbar Undo button.
  await page.locator('button[aria-label^="Undo"]').first().click();
  await page.waitForTimeout(300);
  await expect(page.locator('text=/\\b0 pts\\b/')).toBeVisible({ timeout: 8000 });
  await shot(page, 'undo-button');
});
