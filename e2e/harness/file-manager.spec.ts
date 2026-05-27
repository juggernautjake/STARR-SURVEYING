// e2e/harness/file-manager.spec.ts — the File ▸ File Manager modal opens and
// renders its chrome (folder tree + toolbar). The cloud list itself needs the
// DB, but the wiring (event → modal) is verifiable headless.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('File Manager opens with folder tree and toolbar', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openFileManager')));

  // Title, search field, New folder button, and the root tree node render.
  await expect(page.getByText('File Manager')).toBeVisible();
  await expect(page.getByPlaceholder('Search all drawings…')).toBeVisible();
  await expect(page.getByRole('button', { name: /New folder/ })).toBeVisible();
  await expect(page.getByText('All drawings').first()).toBeVisible();
  await shot(page, 'file-manager');
});
