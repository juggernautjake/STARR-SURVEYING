// e2e/harness/copy-tool.spec.ts — the COPY tool duplicates a feature.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('COPY tool duplicates a selected point', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw a point and select it.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  const cx = box!.x + box!.width * 0.5, cy = box!.y + box!.height * 0.5;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(120);
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();

  // COPY: base point then destination.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'COPY' } })));
  await page.waitForTimeout(120);
  await page.mouse.click(cx, cy);                 // base
  await page.waitForTimeout(120);
  await page.mouse.click(cx + 120, cy + 60);      // destination
  await page.waitForTimeout(200);

  // Now two points exist.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b2 pts\\b/')).toBeVisible({ timeout: 8000 });
  await shot(page, 'copy-tool');
});
