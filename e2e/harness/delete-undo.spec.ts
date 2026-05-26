// e2e/harness/delete-undo.spec.ts — delete + undo integrity for points.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('select-all → delete → undo restores the points', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw two points.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height * 0.45);
  await page.waitForTimeout(120);
  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.55);
  await page.waitForTimeout(120);

  // Open viewer, confirm 2 points.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b2 pts\\b/')).toBeVisible({ timeout: 8000 });

  // SELECT, Edit ▸ Select All, then Delete.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  await page.locator('button:has-text("Edit")').first().click();
  await page.locator('text=Select All').first().click();
  await page.waitForTimeout(150);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  await expect(page.locator('text=/\\b0 pts\\b/')).toBeVisible({ timeout: 8000 });

  // Undo restores them.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  await expect(page.locator('text=/\\b2 pts\\b/')).toBeVisible({ timeout: 8000 });
  await shot(page, 'delete-undo');
});
