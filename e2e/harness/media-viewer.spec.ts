// e2e/harness/media-viewer.spec.ts — attaching media to a point and opening
// the media viewer shows the image with zoom controls.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('view media opens the viewer with the image and zoom controls', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(120);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')));
  await expect(page.locator('text=/\\b1 pts\\b/')).toBeVisible({ timeout: 8000 });

  await page.locator('tbody tr').first().click({ button: 'right' });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Add media for this point…').click(),
  ]);
  await chooser.setFiles({ name: 'rod.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForTimeout(400);

  // Open the viewer via "View media (1)".
  await page.locator('tbody tr').first().click({ button: 'right' });
  await page.getByText(/View media \(1\)/).click();

  // Viewer shows the filename, a zoom readout, and the image.
  await expect(page.getByText('rod.png')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('100%')).toBeVisible();
  await expect(page.locator('img[alt="rod.png"]')).toBeVisible();
  await shot(page, 'media-viewer');

  // Escape closes it.
  await page.keyboard.press('Escape');
  await expect(page.locator('img[alt="rod.png"]')).toHaveCount(0);
});
