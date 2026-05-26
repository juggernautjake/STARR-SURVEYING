// e2e/harness/traverse-edit-undo.spec.ts — traverse course edits undoable.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

test('editing a traverse distance is undoable (Ctrl+Z reverts)', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_LINE' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.5);
  await page.waitForTimeout(120);
  await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5);
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:toggleTraverseViewer')));
  await expect(page.locator('text=/\\b1 courses\\b/')).toBeVisible({ timeout: 8000 });

  const distanceCell = page.locator('tbody tr').first().locator('td').nth(5);
  const original = (await distanceCell.innerText()).trim();
  await distanceCell.click();
  const input = distanceCell.locator('input');
  await input.fill('321.5');
  await input.press('Enter');
  await expect(distanceCell).toContainText('321.50');

  // Undo (SELECT first so the keypress can't draw).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  await expect(distanceCell).toContainText(original);
});
