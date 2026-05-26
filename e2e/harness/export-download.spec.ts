// e2e/harness/export-download.spec.ts — selection export produces a file.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §5

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

test('Export selection as CSV downloads a .csv file', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw two points.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.4);
  await page.waitForTimeout(120);
  await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6);
  await page.waitForTimeout(120);

  page.on('dialog', (d) => d.accept().catch(() => {}));

  // Select all via the Edit menu so the selection export is enabled.
  await page.locator('button:has-text("Edit")').first().click();
  await page.locator('text=Select All').first().click();
  await page.waitForTimeout(150);

  // File ▸ Export ▸ Export selection as CSV → expect a download.
  await page.locator('button:has-text("File")').first().click();
  await page.locator('text=Export').first().click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('text=Export selection as CSV').first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
});
