// e2e/harness/point-viewer-edit.spec.ts — editing a coordinate moves the point.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §10c

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('editing a Northing cell updates the point', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw one point.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(150);

  // Open the Point Data Viewer and edit the Northing cell of row 1.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b1 pts\\b/')).toBeVisible({ timeout: 8000 });

  // First data row, Northing is the 2nd column → click it to edit.
  const northingCell = page.locator('tbody tr').first().locator('td').nth(1);
  await northingCell.click();
  const input = northingCell.locator('input');
  await input.fill('1234.5');
  await input.press('Enter');

  // The cell should now show the edited value (formatted to 3 dp).
  await expect(northingCell).toContainText('1234.500');
  await shot(page, 'point-viewer-edit');
});
