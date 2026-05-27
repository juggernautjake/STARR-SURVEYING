// e2e/harness/canvas-media.spec.ts — right-click a feature on the canvas to
// add/view media.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('canvas right-click on a point can add and then view media', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  const cx = box!.x + box!.width * 0.5, cy = box!.y + box!.height * 0.5;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(120);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));

  // Right-click the point → feature context menu with "Add media".
  await page.mouse.click(cx, cy, { button: 'right' });
  const add = page.getByText('Add media for this feature…');
  await expect(add).toBeVisible({ timeout: 4000 });

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    add.click(),
  ]);
  await chooser.setFiles({ name: 'rod.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForTimeout(400);

  // Right-click again → "View media (1)".
  await page.mouse.click(cx, cy, { button: 'right' });
  await expect(page.getByText(/View media \(1\)/)).toBeVisible({ timeout: 5000 });
  await shot(page, 'canvas-media');
});
