// e2e/harness/point-edit-undo.spec.ts — Point Viewer edits are undoable.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('editing a point coordinate is undoable (Ctrl+Z reverts)', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw a point.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(150);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b1 pts\\b/')).toBeVisible({ timeout: 8000 });

  const northingCell = page.locator('tbody tr').first().locator('td').nth(1);
  const original = (await northingCell.innerText()).trim();

  // Edit it to a clearly different value.
  await northingCell.click();
  const input = northingCell.locator('input');
  await input.fill('1234.5');
  await input.press('Enter');
  await expect(northingCell).toContainText('1234.500');

  // Switch to SELECT so an undo keypress can't accidentally draw, then
  // undo. The input already blurred on Enter, so Ctrl+Z hits the app.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);

  // The cell reverts to its original value.
  await expect(northingCell).toContainText(original);
  await shot(page, 'point-edit-undo');
});
