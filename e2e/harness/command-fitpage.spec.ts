import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

test('typing "fit page" fits the drawing to the page', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(120);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  const cmd = page.locator('input.placeholder-gray-600').first();
  await cmd.fill('fit page');
  await cmd.press('Enter');
  await expect(page.getByText(/Fit to page at/)).toBeVisible({ timeout: 5000 });
});
