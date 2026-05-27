// e2e/harness/hidden-layer-draw.spec.ts — drawing on a hidden active layer
// is blocked with a warning + hint (you must unhide or switch layers).
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('drawing on a hidden active layer is blocked with a warning', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Hide the active layer (Layer 0 is first + active).
  await page.locator('button[title^="Hide layer"]').first().click();

  // Try to draw a point on the now-hidden active layer.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(150);

  // Warning shown, and no point was created.
  await expect(page.getByText(/is hidden — you can't draw on it/)).toBeVisible({ timeout: 5000 });
  await shot(page, 'hidden-layer-draw');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b0 pts\\b/')).toBeVisible({ timeout: 8000 });
});
