// e2e/harness/property-media.spec.ts — the Properties panel shows a media
// thumbnail strip and can attach media to the selected feature.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('Properties panel attaches and shows a media thumbnail', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  const cx = box!.x + box!.width * 0.5, cy = box!.y + box!.height * 0.5;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(120);

  // Select the point so the Properties panel shows it.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(120);
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();

  // Media section present, empty.
  await expect(page.getByText('No media. Click Add to attach photos/videos.')).toBeVisible();

  // Attach via the panel's Add button.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('button[title="Attach a photo or video to this feature"]').click(),
  ]);
  await chooser.setFiles({ name: 'rod.png', mimeType: 'image/png', buffer: PNG });

  // Thumbnail appears in the panel.
  await expect(page.locator('img[alt="rod.png"]')).toBeVisible({ timeout: 5000 });
  await shot(page, 'property-media');
});
