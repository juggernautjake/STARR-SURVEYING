// e2e/harness/import-full.spec.ts — a CSV import runs through the whole
// wizard and the points land in the drawing.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('import a CSV end-to-end and see the points', async ({ page }) => {
  test.slow();
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openImport')));
  await expect(page.getByText('Drop a file here or click to browse')).toBeVisible();

  await page.locator('input[accept*="rw5"]').setInputFiles({
    name: 'points.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('1,5000,5000,100,IPF\n2,5100,5050,101,IPF\n3,5200,5000,102,IPF\n'),
  });
  await expect(page.getByText('points.csv')).toBeVisible();

  // Click Next until the final Import button appears, then import.
  const importBtn = page.getByRole('button', { name: /^Import/ });
  for (let i = 0; i < 5; i++) {
    if (await importBtn.isVisible().catch(() => false)) break;
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.waitForTimeout(250);
  }
  await expect(importBtn).toBeVisible();
  await importBtn.click();
  await page.waitForTimeout(400);

  // The three points are now in the drawing (Point Data Viewer count).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b3 pts\\b/')).toBeVisible({ timeout: 8000 });
  await shot(page, 'import-full');
});
