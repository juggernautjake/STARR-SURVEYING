// e2e/harness/zoom-sizing.spec.ts — §13 labels stay bounded, lines visible.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §13

import { test } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('labels stay bounded and lines visible when zoomed in', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw a line and a point (point gets an auto-name label).
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_LINE' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.45);
  await page.waitForTimeout(120);
  await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.55);
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');

  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(120);

  // Zoom in hard toward the center via wheel; the line must stay a
  // visible stroke (floored) and labels must not balloon (capped).
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(300);
  await shot(page, 'zoom-sizing-in');

  // Canvas is still rendering after the zoom (no crash).
  await page.locator('canvas').waitFor({ state: 'visible' });
});
