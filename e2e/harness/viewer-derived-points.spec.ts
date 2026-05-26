// e2e/harness/viewer-derived-points.spec.ts — derived vertex points show
// in the Point Data Viewer (read-only). §17b/viewer audit.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('a drawn line\'s vertex points appear in the Point Data Viewer', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw a single line (2 vertices → 2 minted, derived points).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_LINE' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.45);
  await page.waitForTimeout(120);
  await page.mouse.click(box!.x + box!.width * 0.62, box!.y + box!.height * 0.6);
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  // The two line vertices show as derived points.
  await expect(page.locator('text=/\\b2 pts\\b/')).toBeVisible({ timeout: 8000 });
  await shot(page, 'viewer-derived-points');
});
