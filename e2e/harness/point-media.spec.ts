// e2e/harness/point-media.spec.ts — attach an image to a point via the
// Point Data Viewer right-click menu; "View media" then appears.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('attach an image to a point and see View media', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(120);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b1 pts\\b/')).toBeVisible({ timeout: 8000 });

  // Right-click the point → no "View media" yet, but "Add media" is present.
  await page.locator('tbody tr').first().click({ button: 'right' });
  await expect(page.getByText('Add media for this point…')).toBeVisible();
  await expect(page.getByText(/View media/)).toHaveCount(0);

  // Click "Add media" → handle the file chooser with our PNG.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Add media for this point…').click(),
  ]);
  await chooser.setFiles({ name: 'rod.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForTimeout(400);

  // Re-open the menu → "View media (1)" is now available.
  await page.locator('tbody tr').first().click({ button: 'right' });
  await expect(page.getByText(/View media \(1\)/)).toBeVisible({ timeout: 5000 });
  await shot(page, 'point-media');
});
