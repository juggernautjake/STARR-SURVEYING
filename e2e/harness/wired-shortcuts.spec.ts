// e2e/harness/wired-shortcuts.spec.ts — keyboard-shortcut events that
// previously had no listener now perform their action.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('select-all and print events are now handled', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw two points.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height * 0.45);
  await page.waitForTimeout(100);
  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.55);
  await page.waitForTimeout(100);

  // cad:selectAll (was dead) now selects every feature.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:selectAll')));
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();

  // cad:openPrintDialog (was dead + never mounted) now opens the dialog.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openPrintDialog')));
  await expect(page.getByText('Print / Export')).toBeVisible({ timeout: 4000 });
  await shot(page, 'wired-shortcuts');
});
