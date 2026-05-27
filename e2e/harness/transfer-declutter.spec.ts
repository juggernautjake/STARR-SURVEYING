// e2e/harness/transfer-declutter.spec.ts — the Send to Layer dialog leads
// with the common flow and tucks power tools behind an Advanced disclosure.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('Send to Layer hides selection tools/presets behind Advanced', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openLayerTransfer')));

  await expect(page.getByText('Send to Layer')).toBeVisible();
  const advanced = page.getByRole('button', { name: /Advanced — selection tools/ });
  await expect(advanced).toBeVisible();

  // Presets (a power tool) are hidden until Advanced is expanded.
  await expect(page.getByText('Preset', { exact: true })).toHaveCount(0);
  await shot(page, 'transfer-declutter-collapsed');

  await advanced.click();
  await expect(page.getByText('Preset', { exact: true })).toBeVisible();
  await shot(page, 'transfer-declutter-expanded');
});
