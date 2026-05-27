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

  // Open the Send to Layer dialog. The point filter is an always-on text
  // field (no Search tab / button) that filters live as you type.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openLayerTransfer')));
  await expect(page.getByText('Send to Layer')).toBeVisible();

  const input = page.getByPlaceholder(/Filter points/);
  await expect(input).toBeVisible();

  const results = page.getByTestId('point-search-result');
  // Results appear only while there is a query.
  await expect(results).toHaveCount(0);

  // A non-matching query shows the empty state…
  await input.fill('zzz');
  await expect(page.getByText(/No points match/)).toBeVisible();

  // …and a matching prefix filters live (drawn points are numbered from 1).
  await input.fill('1');
  await expect(results.first()).toBeVisible();
  await shot(page, 'point-search');

  // Clicking a result adds it to the picks.
  await results.first().click();
  await expect(page.getByText(/\b1 picked\b/)).toBeVisible();
});
