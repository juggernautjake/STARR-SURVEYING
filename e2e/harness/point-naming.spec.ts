// e2e/harness/point-naming.spec.ts — Slice 8b-wire: drawn points get names.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §8

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('manually drawn points are auto-named in the Point Viewer', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Activate the Point tool, then click the canvas twice.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.55);
  await page.waitForTimeout(150);

  // Open the Point Data Viewer.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')),
  );

  // Two points should now be listed.
  await expect(page.locator('text=/\\b2 pts\\b/')).toBeVisible({ timeout: 8000 });
  await shot(page, 'point-naming');
});
