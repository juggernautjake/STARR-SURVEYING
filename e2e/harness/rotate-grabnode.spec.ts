// e2e/harness/rotate-grabnode.spec.ts — the ROTATE tool shows an
// image-style bounding box + grab-node for any feature, and dragging the
// node spins the selection with a live degree readout.
//
// Spec: docs/planning/in-progress/cad-rotation-grabnode-and-audit.md §5 R1/R2
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('ROTATE grab-node rotates a multi-point selection with a live readout', async ({ page }) => {
  // First-hit dev-server compile of the harness route can run long; give
  // this spec extra headroom so the cold-start doesn't trip the timeout.
  test.slow();
  await openHarness(page);
  await createBlankDrawing(page);

  // Snap OFF so the drawn points and select clicks land exactly where
  // clicked (predictable screen coords).
  await page.getByText('Snap: ON', { exact: true }).click();
  await expect(page.getByText('Snap: OFF', { exact: true })).toBeVisible();

  // Draw two points (a selection with real extent → a meaningful bbox).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  const ax = box!.x + box!.width * 0.40, ay = box!.y + box!.height * 0.45;
  const bx = box!.x + box!.width * 0.60, by = box!.y + box!.height * 0.55;
  await page.mouse.click(ax, ay);
  await page.waitForTimeout(120);
  await page.mouse.click(bx, by);
  await page.waitForTimeout(120);

  // SELECT both points (click + shift-click).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  await page.mouse.click(ax, ay);
  await page.waitForTimeout(100);
  await page.keyboard.down('Shift');
  await page.mouse.click(bx, by);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();

  // Switch to ROTATE — the bounding box + grab-node should render.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'ROTATE' } })));
  await page.waitForTimeout(200);
  await shot(page, 'rotate-grabnode-box');

  // Grab-node = top-mid of the bbox, ~30px above the topmost screen point
  // (smaller screen-Y = ay here).
  const nodeX = (ax + bx) / 2;
  const nodeY = ay - 30;

  // Grab the node and drag to the side → live rotation + degree readout.
  await page.mouse.move(nodeX, nodeY);
  await page.mouse.down();
  await page.mouse.move(nodeX + 120, nodeY + 90);
  await page.waitForTimeout(120);
  await expect(page.getByText(/Rotation:\s*-?\d/).first()).toBeVisible({ timeout: 4000 });
  await shot(page, 'rotate-grabnode-drag');
  await page.mouse.up();
  await page.waitForTimeout(150);

  // Selection is preserved through the grab-drag (no one-shot release).
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await shot(page, 'rotate-grabnode-after');
});
