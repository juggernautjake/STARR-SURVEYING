// e2e/harness/property-panel.spec.ts — PropertyPanel populates on select.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md
// (per-surface audit: PropertyPanel)

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('selecting a drawn feature populates the Properties panel', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Initially empty.
  await expect(page.getByText('No selection.')).toBeVisible();

  // Draw a point at canvas center.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  const cx = box!.x + box!.width * 0.5;
  const cy = box!.y + box!.height * 0.5;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(150);

  // Switch to Select and click the point.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })),
  );
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(200);

  // The "No selection." placeholder should be gone.
  await expect(page.getByText('No selection.')).toHaveCount(0);
  await shot(page, 'property-panel');
});
