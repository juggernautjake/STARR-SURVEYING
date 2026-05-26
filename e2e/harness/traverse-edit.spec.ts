// e2e/harness/traverse-edit.spec.ts — §10f editing a course distance.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §10

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('editing a LINE distance in the Traverse Viewer updates it', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw a line (two clicks).
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_LINE' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.5);
  await page.waitForTimeout(120);
  await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5);
  await page.waitForTimeout(120);
  // Finish the line (Escape ends an in-progress polyline/line chain).
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:toggleTraverseViewer')));
  await expect(page.locator('text=/\\b1 courses\\b/')).toBeVisible({ timeout: 8000 });

  // Distance is column index 5 (Type,StartN,StartE,EndN,EndE,Distance).
  const distanceCell = page.locator('tbody tr').first().locator('td').nth(5);
  await distanceCell.click();
  const input = distanceCell.locator('input');
  await input.fill('321.5');
  await input.press('Enter');

  await expect(distanceCell).toContainText('321.50');
  await shot(page, 'traverse-edit');
});
