// e2e/harness/visual-audit.spec.ts
// Drives the CAD editor golden path and captures screenshots for visual
// (OCR) inspection — catches layout/render regressions the unit specs miss.

import { test } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('CAD editor golden-path visual audit', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);
  await page.waitForTimeout(1500);
  await shot(page, 'audit-01-initial');

  const box = await page.locator('canvas').first().boundingBox();
  const cx = box ? box.x + box.width / 2 : 800;
  const cy = box ? box.y + box.height / 2 : 500;

  // Draw a line: 'l' activates the Line tool, two clicks, Enter to finish.
  await page.mouse.move(cx, cy);
  await page.keyboard.press('l');
  await page.mouse.click(cx - 180, cy - 80);
  await page.mouse.move(cx + 160, cy + 90);
  await page.mouse.click(cx + 160, cy + 90);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await shot(page, 'audit-02-line');

  // Drop a couple of points: 'p' activates Point.
  await page.keyboard.press('p');
  await page.mouse.click(cx - 60, cy + 40);
  await page.mouse.click(cx + 60, cy - 40);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await shot(page, 'audit-03-points');

  // Open the Draw menu to confirm the menu chrome renders.
  const drawMenu = page.locator('text=Draw').first();
  if (await drawMenu.isVisible().catch(() => false)) {
    await drawMenu.click();
    await page.waitForTimeout(300);
    await shot(page, 'audit-04-draw-menu');
    await page.keyboard.press('Escape');
  }
});
