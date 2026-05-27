// e2e/harness/multiselect-edit.spec.ts — selecting a mix of features shows
// per-type tabs in the Property panel that edit each kind in bulk.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('multi-select shows per-type tabs and bulk-edits each kind', async ({ page }) => {
  test.slow(); // cold-compile + several interactions
  await openHarness(page);
  await createBlankDrawing(page);

  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

  // Two points.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  let p = at(0.45, 0.45); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120);
  p = at(0.55, 0.45); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120);

  // One line.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_LINE' } })));
  p = at(0.45, 0.55); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120);
  p = at(0.55, 0.55); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120);

  // Box-select everything.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  const s = at(0.38, 0.38); const e = at(0.62, 0.62);
  await page.mouse.move(s.x, s.y); await page.mouse.down();
  await page.mouse.move(e.x, e.y, { steps: 8 }); await page.mouse.up();
  await expect(page.getByText('3 selected', { exact: true })).toBeVisible({ timeout: 5000 });

  // Property panel shows per-type tabs.
  await expect(page.getByRole('button', { name: /Lines \(1\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Points \(2\)/ })).toBeVisible();
  await shot(page, 'multiselect-edit');

  // Switching tabs scopes the editor to that kind.
  await page.getByRole('button', { name: /Points \(2\)/ }).click();
  await expect(page.getByText(/Editing 2 points together/)).toBeVisible();
  await page.getByRole('button', { name: /Lines \(1\)/ }).click();
  await expect(page.getByText(/Editing 1 lines together/)).toBeVisible();
});
