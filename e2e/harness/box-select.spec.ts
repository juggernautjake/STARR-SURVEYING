// e2e/harness/box-select.spec.ts — in SELECT mode, dragging a box on empty
// canvas selects the enclosed features (was: panned the view).
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('drag box-selects features in SELECT mode', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Two points near center.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.46, box!.y + box!.height * 0.46);
  await page.waitForTimeout(100);
  await page.mouse.click(box!.x + box!.width * 0.54, box!.y + box!.height * 0.54);
  await page.waitForTimeout(100);

  // SELECT, then drag a box around both points (start on empty canvas).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  await page.mouse.move(box!.x + box!.width * 0.38, box!.y + box!.height * 0.38);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.62, box!.y + box!.height * 0.62, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible({ timeout: 5000 });
  await shot(page, 'box-select');

  // A plain click on empty canvas deselects.
  await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.2);
  await expect(page.getByText('2 selected', { exact: true })).toHaveCount(0);
});
