// e2e/harness/locked-layer-draw.spec.ts — drawing on a locked active layer
// is blocked with a warning + hint.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('drawing on a locked active layer is blocked with a warning', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Lock the active layer (Layer 0 is first + active).
  await page.locator('button[title="Lock layer"]').first().click();

  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(150);

  await expect(page.getByText(/is locked — you can't draw on it/)).toBeVisible({ timeout: 5000 });
  await shot(page, 'locked-layer-draw');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b0 pts\\b/')).toBeVisible({ timeout: 8000 });
});
