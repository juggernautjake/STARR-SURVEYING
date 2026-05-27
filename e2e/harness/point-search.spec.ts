// e2e/harness/point-search.spec.ts — the Send to Layer dialog has a Search
// source mode that finds points by number prefix and adds them to the picks.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('point search filters results and adds a point to the picks', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw two points so there is something to search.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.55);
  await page.waitForTimeout(150);

  // Open the Send to Layer dialog and switch to Search mode.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openLayerTransfer')));
  await expect(page.getByText('Send to Layer')).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  const input = page.getByPlaceholder(/Search points/);
  await expect(input).toBeVisible();

  // Both drawn points are listed.
  const results = page.getByTestId('point-search-result');
  await expect(results).toHaveCount(2);

  // A non-matching query shows the empty state…
  await input.fill('zzz');
  await expect(page.getByText(/No points match/)).toBeVisible();

  // …and clearing restores the full list.
  await input.fill('');
  await expect(results).toHaveCount(2);
  await shot(page, 'point-search');

  // Clicking a result adds it to the picks.
  await results.first().click();
  await expect(page.getByText(/\b1 picked\b/)).toBeVisible();
});
