// e2e/harness/rename-dialog.spec.ts — editing a point Name opens the
// guarded rename dialog (§10d).
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §10

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('editing a point Name opens the rename confirmation dialog', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw a point (auto-named "1").
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })),
  );
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(150);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b1 pts\\b/')).toBeVisible({ timeout: 8000 });

  // Edit the Name cell (column 0) to a new value.
  const nameCell = page.locator('tbody tr').first().locator('td').nth(0);
  await nameCell.click();
  const input = nameCell.locator('input');
  await input.fill('500');
  await input.press('Enter');

  // The guarded rename dialog appears with both strategies.
  await expect(page.getByRole('heading', { name: 'Change point name?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename everywhere' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duplicate instead' })).toBeVisible();
  await expect(page.getByText('Remember my choice for future point-name changes')).toBeVisible();
  await shot(page, 'rename-dialog');
});
