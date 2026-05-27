// e2e/harness/command-selectall.spec.ts — typed "select all" command works.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

test('typing "select all" in the command bar selects all features', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height * 0.45);
  await page.waitForTimeout(100);
  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.55);
  await page.waitForTimeout(100);

  const cmd = page.locator('input.placeholder-gray-600').first();
  await cmd.fill('select all');
  await cmd.press('Enter');
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
});
