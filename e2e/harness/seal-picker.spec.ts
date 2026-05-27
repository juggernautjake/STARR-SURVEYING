// e2e/harness/seal-picker.spec.ts — the official-seal picker opens and renders
// its chrome. The cloud library needs Supabase, so only the modal shell is
// verified headless.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('seal picker opens with upload + saved-seals sections', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openSealPicker')));

  await expect(page.getByText('Official Seal')).toBeVisible();
  await expect(page.getByRole('button', { name: /Upload from computer/ })).toBeVisible();
  await expect(page.getByText(/Saved seals/)).toBeVisible();
  await shot(page, 'seal-picker');
});
