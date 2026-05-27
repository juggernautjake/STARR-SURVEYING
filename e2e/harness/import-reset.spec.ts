// e2e/harness/import-reset.spec.ts — reopening the import wizard always
// starts fresh at step 1 (regression: it could reopen stuck on "Done").
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

async function openImport(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openImport')));
}

test('reopening the import wizard resets to step 1', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // First open — step 1 drop zone is shown.
  await openImport(page);
  await expect(page.getByText('Drop a file here or click to browse')).toBeVisible();

  // Upload a CSV and advance past step 1.
  await page.locator('input[accept*="rw5"]').setInputFiles({
    name: 'points.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('1,5000,5000,100,IPF\n2,5050,5000,100,IPF\n'),
  });
  await expect(page.getByText('points.csv')).toBeVisible();
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.waitForTimeout(200);
  await expect(page.getByText('Drop a file here or click to browse')).toHaveCount(0);
  await shot(page, 'import-reset-advanced');

  // Close the wizard.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Reopen — must be back at step 1 (not stuck on a later step / Done).
  await openImport(page);
  await expect(page.getByText('Drop a file here or click to browse')).toBeVisible();
  await expect(page.getByText('points.csv')).toHaveCount(0);
  await shot(page, 'import-reset-fresh');
});
