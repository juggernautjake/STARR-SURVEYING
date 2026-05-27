// e2e/harness/rotate-selection.spec.ts — selecting then switching to
// ROTATE preserves the selection (no "Select features first").
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('selection persists when switching to the ROTATE tool', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw a point at center.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  const cx = box!.x + box!.width * 0.5, cy = box!.y + box!.height * 0.5;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(150);

  // Select it via click with the SELECT tool.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(150);
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();

  // Switch to ROTATE — selection should persist (no "Select features first").
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'ROTATE' } })));
  await page.waitForTimeout(200);
  await expect(page.getByText('Select features first')).toHaveCount(0);
  await shot(page, 'rotate-selection');
});
