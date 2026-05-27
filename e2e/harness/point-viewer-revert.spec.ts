// e2e/harness/point-viewer-revert.spec.ts — the Point Data Viewer tracks
// each point's original value and can revert an edited point back to it.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('editing a point shows a revert control that restores the original', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw one point.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(150);

  // Open the viewer; no revert control before any edit.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b1 pts\\b/')).toBeVisible({ timeout: 8000 });
  const row = page.locator('tbody tr').first();
  await expect(row.locator('button[aria-label^="Revert point"]')).toHaveCount(0);

  // Edit the Description cell (6th column).
  const descCell = row.locator('td').nth(5);
  await descCell.click();
  const input = descCell.locator('input');
  await input.fill('POLE');
  await input.press('Enter');
  await expect(descCell).toContainText('POLE');

  // A revert control now appears; clicking it restores the original (empty).
  const revert = row.locator('button[aria-label^="Revert point"]');
  await expect(revert).toBeVisible();
  await shot(page, 'point-viewer-edited');
  await revert.click();
  await expect(descCell).not.toContainText('POLE');
  await expect(row.locator('button[aria-label^="Revert point"]')).toHaveCount(0);
  await shot(page, 'point-viewer-reverted');
});
